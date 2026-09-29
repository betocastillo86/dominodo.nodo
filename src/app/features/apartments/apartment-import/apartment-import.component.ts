import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
  TemplateRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgbModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { Subscription, switchMap, takeWhile, tap, timer } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  ApartmentImportDto,
  ApartmentImportRowIssueDto,
  ApartmentImportStatus,
  buildImportTemplate,
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_STATUS_BADGE,
  IMPORT_STATUS_LABEL,
  issueDetail,
  issueText,
} from '../data-access/apartment-import.models';
import { ApartmentImportsService } from '../data-access/apartment-imports.service';

/** How often the tracking card asks for the import's state while it moves. */
const POLL_INTERVAL_MS = 1500;

/** States the server is still working on — the only ones worth polling. */
const MOVING: ReadonlySet<ApartmentImportStatus> = new Set<ApartmentImportStatus>([
  'Validating',
  'Applying',
]);

const TEMPLATE_FILE_NAME = 'plantilla-carga-apartamentos.csv';

/**
 * Bulk import of apartments and residents (API ADR-0012) as a three-step wizard:
 *
 *  1. how to prepare the file + the downloadable template + picking the CSV;
 *  2. the diagnosis — the server reads the whole file and answers a report the
 *     administrator must see BEFORE anything is written;
 *  3. the apply, confirmed once and only from a validated import.
 *
 * The step is derived from the import itself rather than kept as a counter, so a
 * reload lands exactly where the process is: the id lives in the URL
 * (`/apartments/import/:importId`) and the state comes from the server.
 *
 * Both POSTs answer 202 — nothing is synchronous here. Progress and the final
 * outcome are reached by polling, and polling stops as soon as the import stops
 * moving (it is either waiting on the administrator or already terminal).
 */
@Component({
  selector: 'app-apartment-import',
  standalone: true,
  imports: [
    PageHeaderComponent,
    SpinnerComponent,
    TablerIconComponent,
    RouterLink,
    NgTemplateOutlet,
    NgbTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './apartment-import.component.html',
})
export class ApartmentImportComponent {
  private readonly service = inject(ApartmentImportsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(NgbModal);
  private readonly destroyRef = inject(DestroyRef);

  // Static copy for step 1.
  readonly columns = IMPORT_COLUMNS;
  readonly maxBytesLabel = `${IMPORT_MAX_BYTES / (1024 * 1024)} MB`;
  readonly statusLabel = IMPORT_STATUS_LABEL;
  readonly statusBadge = IMPORT_STATUS_BADGE;

  /** The picked CSV, before it is uploaded. */
  readonly file = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  /** Upload + `POST /apartments/imports` in flight. */
  readonly starting = signal(false);
  /** Confirm in flight, held until the import is seen as confirmed. */
  readonly confirming = signal(false);
  readonly loadError = signal<string | null>(null);
  /** True between attaching the poller and its first answer. */
  readonly resuming = signal(false);

  readonly importState = signal<ApartmentImportDto | null>(null);

  /** The live poller. One at a time — re-tracking replaces it. */
  private polling?: Subscription;

  readonly status = computed<ApartmentImportStatus | null>(
    () => this.importState()?.status ?? null,
  );
  readonly report = computed(() => this.importState()?.report ?? null);

  /**
   * Which step the wizard is on. Step 3 hinges on `confirmedAtUtc`, not on the
   * status: the apply re-validates while it writes, so a confirmed import can
   * still end up `Rejected` — and that outcome belongs to the apply step, not
   * back on the diagnosis.
   */
  readonly step = computed<1 | 2 | 3>(() => {
    const current = this.importState();
    // Landing straight on /apartments/import/:id (a reload, a shared link) must
    // not flash step 1 while the first read is in flight.
    if (!current) return this.resuming() ? 2 : 1;
    return current.confirmedAtUtc ? 3 : 2;
  });

  /**
   * A validated file that still carries row errors. The API would happily apply
   * it — the failed rows are simply dropped — but a partial load is not what the
   * administrator asked for, and the units that DID load would then have to be
   * reconciled by hand against a file nobody can re-run safely.
   */
  readonly hasRowErrors = computed(() => (this.report()?.rowsWithError ?? 0) > 0);

  /** Only a validated import, inside its TTL and with no failed row, can be applied. */
  readonly canConfirm = computed(
    () =>
      this.status() === 'Validated' &&
      !this.hasRowErrors() &&
      !this.confirming() &&
      this.step() === 2,
  );

  /**
   * Percentage for the progress bar, or null while the total is still unknown —
   * the server reports `rowsTotal = 0` until the last line is parsed, and
   * showing the running count as a total would lie.
   */
  readonly progressPercent = computed(() => {
    const progress = this.importState()?.progress;
    if (!progress || progress.rowsTotal <= 0) return null;
    return Math.min(100, Math.round((progress.rowsProcessed / progress.rowsTotal) * 100));
  });

  readonly fileErrors = computed(() => this.report()?.fileErrors ?? []);
  readonly rowErrors = computed(() => this.sortByRow(this.report()?.rowErrors ?? []));
  readonly warnings = computed(() => this.sortByRow(this.report()?.warnings ?? []));

  readonly issueText = issueText;
  readonly issueDetail = issueDetail;

  constructor() {
    // Reacts to both entries of this wizard: `/apartments/import` (a fresh file)
    // and `/apartments/import/:importId` (resume an open one, e.g. on reload).
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('importId');
      if (!id) {
        this.reset();
        return;
      }
      this.track(id);
    });
  }

  /** Downloads the three-row sample file. */
  downloadTemplate(): void {
    const blob = new Blob([buildImportTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = TEMPLATE_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Picks a file and checks it against the purpose policy before uploading. */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    this.fileError.set(null);

    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.fileError.set('El archivo debe ser un CSV (.csv).');
      return;
    }
    if (file.size === 0) {
      this.fileError.set('El archivo está vacío.');
      return;
    }
    if (file.size > IMPORT_MAX_BYTES) {
      this.fileError.set(`El archivo supera el máximo de ${this.maxBytesLabel}.`);
      return;
    }

    this.file.set(file);
  }

  clearFile(): void {
    this.file.set(null);
    this.fileError.set(null);
  }

  /** Uploads the CSV, opens the import and moves the wizard to step 2. */
  validate(): void {
    const file = this.file();
    if (!file || this.starting()) return;

    this.starting.set(true);
    this.fileError.set(null);

    this.service.createFromFile(file).subscribe({
      next: (importId) => {
        this.starting.set(false);
        this.router.navigate(['/apartments/import', importId]);
      },
      error: (error: HttpErrorResponse) => {
        this.starting.set(false);
        this.fileError.set(
          error.status === 0
            ? 'No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.'
            : toMessage(error),
        );
      },
    });
  }

  /** Applying is irreversible, so it is confirmed against the report. */
  confirm(tpl: TemplateRef<unknown>): void {
    if (!this.canConfirm()) return;

    this.modal.open(tpl).result.then(
      () => this.apply(),
      () => undefined,
    );
  }

  /** Back to step 1 with a clean slate; the previous import stays as it is. */
  startOver(): void {
    this.router.navigate(['/apartments/import']);
  }

  /** Re-attaches the poller after a read failure. */
  retry(): void {
    const id = this.importState()?.id ?? this.route.snapshot.paramMap.get('importId');
    if (id) this.track(id);
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private apply(): void {
    const id = this.importState()?.id;
    if (!id) return;

    this.confirming.set(true);
    this.loadError.set(null);

    this.service.confirm(id).subscribe({
      // `confirming` is NOT cleared here: the 202 only means the apply was
      // accepted, and the button must stay locked until the polled import comes
      // back carrying `confirmedAtUtc`.
      next: () => this.track(id),
      // The error interceptor already toasts the reason; re-reading the import
      // is what puts the screen back in sync (a 409 usually means it expired).
      error: () => {
        this.confirming.set(false);
        this.track(id);
      },
    });
  }

  /**
   * Polls `GET /apartments/imports/{id}` until the import stops moving. A
   * `Validated` import is terminal for this purpose too — it is waiting on the
   * administrator, and asking again would answer the same thing forever.
   */
  private track(id: string): void {
    this.loadError.set(null);
    this.resuming.set(!this.importState());
    this.polling?.unsubscribe();

    this.polling = timer(0, POLL_INTERVAL_MS)
      .pipe(
        switchMap(() => this.service.getById(id)),
        tap((current) => {
          this.importState.set(current);
          this.resuming.set(false);
          if (current.confirmedAtUtc) this.confirming.set(false);
        }),
        takeWhile((current) => MOVING.has(current.status), true),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        error: (error: HttpErrorResponse) => {
          this.confirming.set(false);
          this.resuming.set(false);
          this.loadError.set(
            error.status === 404
              ? 'No encontramos esta carga. Es posible que pertenezca a otro conjunto.'
              : toMessage(error),
          );
        },
      });
  }

  private reset(): void {
    this.polling?.unsubscribe();
    this.resuming.set(false);
    this.importState.set(null);
    this.file.set(null);
    this.fileError.set(null);
    this.loadError.set(null);
    this.confirming.set(false);
    this.starting.set(false);
  }

  private sortByRow(issues: ApartmentImportRowIssueDto[]): ApartmentImportRowIssueDto[] {
    return [...issues].sort((a, b) => a.rowNumber - b.rowNumber);
  }
}
