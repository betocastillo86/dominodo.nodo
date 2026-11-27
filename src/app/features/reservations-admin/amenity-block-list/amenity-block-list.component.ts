import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { PermissionStore } from '../../../core/authz/permission.store';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { DataTableComponent, TableColumn } from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { toFromUtc, toToUtc } from '../../dashboard/data-access/date-range';
import { formatInstant } from '../../reservations/data-access/reservation-format';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityBlockModalComponent } from '../amenity-block-modal/amenity-block-modal.component';
import {
  AMENITY_BLOCK_STATUS_BADGE,
  AMENITY_BLOCK_STATUS_LABEL,
  AmenityBlockDto,
  AmenityBlockStatus,
} from '../data-access/amenity-block.models';
import { AmenityBlocksService } from '../data-access/amenity-blocks.service';
import { AmenityOptionsService } from '../data-access/amenity-options.service';

/**
 * Administrative blocks of the social areas (API ADR-0031), reached from the
 * Reservas list. The API lists blocks one area at a time, so the area filter
 * is required: it starts on the first area, and the choice rides in the URL
 * (`?area=`) so a reload or a shared link lands on the same one.
 *
 * Defaults to the ACTIVE blocks — the ones that keep residents out today.
 * Cancelled ones stay reachable through the status filter, as history.
 * Creating and editing open {@link AmenityBlockModalComponent}; cancelling asks
 * first. All three need `amenities.edit`.
 */
@Component({
  selector: 'app-amenity-block-list',
  standalone: true,
  imports: [PageHeaderComponent, DataTableComponent, ReactiveFormsModule, RouterLink, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amenity-block-list.component.html',
})
export class AmenityBlockListComponent {
  private readonly service = inject(AmenityBlocksService);
  private readonly amenityOptions = inject(AmenityOptionsService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly canEdit = computed(() => this.permissions.has('amenities.edit'));

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly areas = signal<AmenityListItem[]>([]);
  readonly areasLoaded = signal(false);
  readonly areasError = signal<string | null>(null);

  readonly amenityControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl<AmenityBlockStatus | ''>('Active', { nonNullable: true });
  readonly fromControl = new FormControl('', { nonNullable: true });
  readonly toControl = new FormControl('', { nonNullable: true });

  readonly statuses = Object.entries(AMENITY_BLOCK_STATUS_LABEL) as [AmenityBlockStatus, string][];

  /** The block awaiting the cancel confirmation, and whether that call is in flight. */
  readonly cancelling = signal<AmenityBlockDto | null>(null);
  readonly cancelBusy = signal(false);
  readonly cancelError = signal<string | null>(null);

  private readonly actionsCell =
    viewChild<TemplateRef<{ $implicit: AmenityBlockDto }>>('actionsCell');
  private readonly cancelTpl = viewChild.required<TemplateRef<unknown>>('cancelTpl');

  readonly columns = computed<readonly TableColumn<AmenityBlockDto>[]>(() => {
    const columns: TableColumn<AmenityBlockDto>[] = [
      { header: 'Título', value: (b) => b.title, class: 'table-cell-wrap fw-medium' },
      { header: 'Desde', value: (b) => formatInstant(b.startsAtUtc), class: 'text-nowrap' },
      { header: 'Hasta', value: (b) => formatInstant(b.endsAtUtc), class: 'text-nowrap' },
      { header: 'Notas', value: (b) => b.notes ?? '—', class: 'table-cell-wrap text-secondary' },
      {
        header: 'Estado',
        value: (b) => AMENITY_BLOCK_STATUS_LABEL[b.status],
        badgeClass: (b) => AMENITY_BLOCK_STATUS_BADGE[b.status],
      },
    ];
    if (this.canEdit()) {
      columns.push({
        header: '',
        value: () => '',
        cellTemplate: this.actionsCell(),
        class: 'w-1 text-end',
      });
    }
    return columns;
  });

  readonly rowKey = (b: AmenityBlockDto): string => b.id;

  private readonly pageSize = 20;

  constructor() {
    this.amenityOptions.list().subscribe({
      next: (areas) => {
        this.areas.set(areas);
        this.areasLoaded.set(true);
        const requested = this.route.snapshot.queryParamMap.get('area');
        const initial = areas.find((a) => a.id === requested)?.id ?? areas[0]?.id ?? '';
        // Emits, so the first reload happens here — once the area is known.
        this.amenityControl.setValue(initial);
        if (!initial) this.service.clear();
      },
      error: (error: HttpErrorResponse) => {
        this.areasError.set(toMessage(error));
        this.areasLoaded.set(true);
        this.service.clear();
      },
    });

    this.amenityControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((area) => {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { area: area || null },
        replaceUrl: true,
      });
    });

    for (const control of [this.amenityControl, this.statusControl, this.fromControl, this.toControl]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    }
  }

  onPageChange(page: number): void {
    this.reload(page);
  }

  openCreate(): void {
    const ref = this.modal.open(AmenityBlockModalComponent, { size: 'lg' });
    (ref.componentInstance as AmenityBlockModalComponent).init(
      this.areas(),
      this.amenityControl.value || null,
    );
    ref.result.then(
      () => {
        this.notifications.success('Área bloqueada.');
        this.reload(1);
      },
      () => undefined,
    );
  }

  openEdit(block: AmenityBlockDto): void {
    const ref = this.modal.open(AmenityBlockModalComponent, { size: 'lg' });
    (ref.componentInstance as AmenityBlockModalComponent).init(this.areas(), block.amenityId, block);
    ref.result.then(
      () => {
        this.notifications.success('Bloqueo actualizado.');
        this.reload(this.paging()?.page ?? 1);
      },
      () => undefined,
    );
  }

  confirmCancel(block: AmenityBlockDto): void {
    this.cancelling.set(block);
    this.cancelError.set(null);
    this.modal.open(this.cancelTpl()).result.then(
      () => undefined,
      () => undefined,
    );
  }

  /** Runs from the confirmation dialog, which stays open on failure to show why. */
  cancelBlock(modal: { close(): void }): void {
    const block = this.cancelling();
    if (!block) return;

    this.cancelBusy.set(true);
    this.cancelError.set(null);
    this.service.cancel(block.amenityId, block.id).subscribe({
      next: () => {
        this.cancelBusy.set(false);
        modal.close();
        this.notifications.success('Bloqueo cancelado. El área vuelve a estar disponible en ese rango.');
        this.reload(this.paging()?.page ?? 1);
      },
      error: (error: HttpErrorResponse) => {
        this.cancelBusy.set(false);
        this.cancelError.set(toMessage(error));
      },
    });
  }

  /** `"16 de diciembre, 6:00 p. m."` — the conjunto's clock, as in the table. */
  readonly formatInstant = formatInstant;

  private reload(page: number): void {
    const amenityId = this.amenityControl.value;
    if (!amenityId) return;

    this.service.list(
      amenityId,
      {
        status: this.statusControl.value || null,
        fromUtc: this.fromControl.value ? toFromUtc(this.fromControl.value) : null,
        toUtc: this.toControl.value ? toToUtc(this.toControl.value) : null,
      },
      page,
      this.pageSize,
    );
  }
}
