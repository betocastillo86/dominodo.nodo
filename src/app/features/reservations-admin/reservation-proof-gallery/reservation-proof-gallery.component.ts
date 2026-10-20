import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { catchError, finalize, forkJoin, map, of, tap } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { formatInstant } from '../../reservations/data-access/reservation-format';
import { isImageProof, ReservationPaymentProofDto } from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/** As much of a booking as opening its proofs needs — a list row satisfies it. */
export interface ProofGalleryTarget {
  id: string;
  code: string;
}

/**
 * The payment proofs of one booking, as a gallery in a dialog — what the list's
 * "Pago: Sí" cell opens, so an administrator can check the receipt without
 * leaving the page they are working through.
 *
 * A LIST ROW does not carry its proofs (`ReservationDto` only reports
 * `paymentUploaded`), so the dialog fetches the booking itself
 * (`GET /reservations/{id}`) and then mints one short-lived SAS per image. That
 * is why it opens straight away on a spinner rather than waiting: the request
 * is the price of not putting N detail reads behind a list that shows twenty
 * rows at a time.
 *
 * Nothing is cached between openings — a SAS lives about five minutes and this
 * dialog is opened, read and closed — and nothing is cached across bookings:
 * every `open()` starts from scratch.
 *
 * Renders only its dialog; the host puts the trigger on screen and calls
 * `open()`.
 */
@Component({
  selector: 'app-reservation-proof-gallery',
  standalone: true,
  imports: [TablerIconComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-proof-gallery.component.html',
  styles: `
    /* The dark stage the module's other viewer uses (detail → lightbox), so a
       proof looks the same whichever screen opened it. */
    .gallery-stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      background-color: #000;
    }
    .gallery-image {
      max-width: 100%;
      max-height: 70vh;
      object-fit: contain;
    }
    .gallery-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 1;
      opacity: 0.85;
    }
    .gallery-nav:hover {
      opacity: 1;
    }
    .gallery-nav--prev {
      left: 0.75rem;
    }
    .gallery-nav--next {
      right: 0.75rem;
    }

    /* The strip below the stage: every proof at a glance, the open one framed.
       Only drawn when there is more than one — a single proof is the stage. */
    .gallery-thumbs {
      display: flex;
      gap: 0.5rem;
      overflow-x: auto;
      padding: 0.5rem;
    }
    .gallery-thumb {
      flex: 0 0 auto;
      width: 4.5rem;
      height: 4.5rem;
      padding: 0;
      border: 2px solid transparent;
      border-radius: var(--tblr-border-radius);
      background-color: var(--tblr-bg-surface-tertiary);
      overflow: hidden;
      cursor: pointer;
    }
    .gallery-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gallery-thumb--active {
      border-color: var(--tblr-primary);
    }

    /* Stand-in while a SAS is in flight, and for a proof that is not an image. */
    .gallery-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      color: var(--tblr-secondary);
    }
  `,
})
export class ReservationProofGalleryComponent {
  private readonly service = inject(ReservationsAdminService);
  private readonly modal = inject(NgbModal);
  private readonly notifications = inject(NotificationService);

  private readonly tpl = viewChild.required<TemplateRef<unknown>>('galleryTpl');

  /** The booking the dialog is currently about. */
  readonly target = signal<ProofGalleryTarget | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private readonly proofs = signal<ReservationPaymentProofDto[]>([]);
  /** proofId → signed URL, minted for this opening only. */
  private readonly urls = signal<Record<string, string>>({});
  /** Proofs whose <img> the browser could not decode — fall back to the icon. */
  private readonly broken = signal<Record<string, true>>({});

  readonly downloadingId = signal<string | null>(null);

  /** The proofs the gallery pages over, in the order the API returned them. */
  readonly images = computed(() => this.proofs().filter(isImageProof));

  /** PDFs and documents: the API's allowlist takes them, and they are listed, not shown. */
  readonly files = computed(() => this.proofs().filter((p) => !isImageProof(p)));

  readonly index = signal(0);

  readonly current = computed<ReservationPaymentProofDto | null>(
    () => this.images()[this.index()] ?? null,
  );

  readonly counter = computed(() => {
    const count = this.images().length;
    return count > 1 ? `${this.index() + 1} de ${count}` : null;
  });

  /**
   * Opens the dialog and loads the booking's proofs into it. The modal goes up
   * first: the fetch is what it is waiting on, not what decides whether it
   * opens.
   */
  open(reservation: ProofGalleryTarget): void {
    this.target.set(reservation);
    this.proofs.set([]);
    this.urls.set({});
    this.broken.set({});
    this.index.set(0);
    this.error.set(null);
    this.loading.set(true);

    const ref = this.modal.open(this.tpl(), { size: 'xl', centered: true });

    // Esc is ng-bootstrap's; the arrows are ours. The listener lives only as
    // long as the dialog does.
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') this.next();
      else if (event.key === 'ArrowLeft') this.prev();
    };
    document.addEventListener('keydown', onKeydown);
    ref.hidden.subscribe(() => document.removeEventListener('keydown', onKeydown));

    this.service.getById(reservation.id).subscribe({
      next: (detail) => {
        this.proofs.set(detail.paymentProofs);
        this.loadUrls(detail.id, detail.paymentProofs);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  /** Signed URL for a proof, or null while it is still being minted. */
  url(proofId: string): string | null {
    return this.urls()[proofId] ?? null;
  }

  isBroken(proofId: string): boolean {
    return proofId in this.broken();
  }

  onImageError(proofId: string): void {
    this.broken.update((prev) => ({ ...prev, [proofId]: true }));
  }

  formatInstant(value: string): string {
    return formatInstant(value);
  }

  show(proof: ReservationPaymentProofDto): void {
    const index = this.images().findIndex((p) => p.id === proof.id);
    if (index >= 0) this.index.set(index);
  }

  next(): void {
    const count = this.images().length;
    if (count > 1) this.index.update((i) => (i + 1) % count);
  }

  prev(): void {
    const count = this.images().length;
    if (count > 1) this.index.update((i) => (i - 1 + count) % count);
  }

  /**
   * Hands the proof over as a file. Re-minted rather than reusing the one the
   * gallery is showing: the dialog can sit open longer than the five minutes a
   * SAS lives.
   */
  download(proof: ReservationPaymentProofDto): void {
    const target = this.target();
    if (!target || this.downloadingId()) return;

    this.downloadingId.set(proof.id);
    this.service
      .getPaymentProofDownloadUrl(target.id, proof.id)
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({
        // `noopener` so the opened tab cannot reach back through `window.opener`,
        // and `noreferrer` so the SAS never travels as a Referer.
        next: (res) => window.open(res.url, '_blank', 'noopener,noreferrer'),
        // A toast, never the dialog's `error`: that would replace the proofs
        // already on screen over one failed mint.
        error: () =>
          this.notifications.error('No pudimos abrir el comprobante. Inténtalo de nuevo.'),
      });
  }

  /** Mints what the gallery needs to draw: one SAS per image proof. */
  private loadUrls(reservationId: string, proofs: ReservationPaymentProofDto[]): void {
    const images = proofs.filter(isImageProof);
    if (images.length === 0) return;

    forkJoin(
      images.map((proof) =>
        this.service.getPaymentProofDownloadUrl(reservationId, proof.id).pipe(
          map((res) => res.url),
          tap((url) => this.urls.update((prev) => ({ ...prev, [proof.id]: url }))),
          // One dead proof must not sink the whole batch.
          catchError(() => of(null)),
        ),
      ),
    ).subscribe();
  }
}
