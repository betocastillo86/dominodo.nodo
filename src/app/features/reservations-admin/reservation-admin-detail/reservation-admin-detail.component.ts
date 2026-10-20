import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { catchError, finalize, forkJoin, map, Observable, of, tap } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { ApartmentDetailDto, apartmentLabel } from '../../apartments/data-access/apartment.models';
import { AmenityDetail } from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityOptionsService } from '../data-access/amenity-options.service';
import { ApartmentOptionsService } from '../data-access/apartment-options.service';
import { formatDay } from '../../dashboard/data-access/date-range';
import {
  formatCurrencyCOP,
  formatInstant,
  formatInstantAsTimeOfDay,
} from '../../reservations/data-access/reservation-format';
import { ResidentInfo, ResidentInfoService } from '../data-access/resident-info.service';
import {
  isImageProof,
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  ReservationDetailDto,
  ReservationPaymentProofDto,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';
import { ReservationRespondComponent } from '../reservation-respond/reservation-respond.component';

/** A minted SAS URL plus the epoch ms it stops working at. */
interface SignedUrl {
  url: string;
  expiresAt: number;
}

/** Re-mint a cached SAS this long before it expires, so a load that starts at the edge finishes. */
const URL_REFRESH_MARGIN_MS = 60_000;

/**
 * Admin reservation detail: who booked, where, when, and whether they paid —
 * with the same "responder" dialog the list carries
 * (`ReservationRespondComponent`), so an administrator who opened a booking to
 * read its comprobante can answer it without going back to the listing.
 *
 * `GET /reservations/{id}` returns less than a list row does: no `apartment`
 * block, no `paymentUploaded`, no `price`. So this screen rebuilds them —
 * the apartment with `GET /apartments/{id}` (needs `apartments.view`; falls
 * back to the raw id), the payment state from `paymentProofs`/`amountPaid`, and
 * the value from the area's policy. Resolving the resident's name/phone takes
 * one more call (`GET /users/{id}`, no permission needed). All three are one
 * request for one record — the LIST deliberately resolves nothing per row.
 */
@Component({
  selector: 'app-reservation-admin-detail',
  standalone: true,
  imports: [
    PageHeaderComponent,
    SpinnerComponent,
    EmptyStateComponent,
    RouterLink,
    TablerIconComponent,
    ReservationRespondComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-admin-detail.component.html',
  styles: `
    /* The proof as the card's content, not as an icon beside it: this screen
       exists to answer "does the receipt match the booking", and that is read
       off the amount, not off a 40px square. Contained, because a transfer
       receipt is tall and narrow and cropping it hides the figure. */
    .proof-preview {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      border-radius: var(--tblr-border-radius);
      background-color: var(--tblr-bg-surface-tertiary);
      overflow: hidden;
      cursor: zoom-in;
    }
    .proof-preview img {
      display: block;
      width: 100%;
      max-height: 16rem;
      object-fit: contain;
    }
    .proof-preview:hover img {
      opacity: 0.9;
    }

    /* Stand-in while the SAS is in flight, and for a proof that is not an image. */
    .proof-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 6rem;
      border-radius: var(--tblr-border-radius);
      background-color: var(--tblr-bg-surface-tertiary);
      color: var(--tblr-secondary);
    }

    /* Lightbox: the same dark stage the PQRS detail uses. */
    .lightbox-stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      background-color: #000;
    }
    .lightbox-image {
      max-width: 100%;
      max-height: 75vh;
      object-fit: contain;
    }
    .lightbox-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      z-index: 1;
      opacity: 0.85;
    }
    .lightbox-nav:hover {
      opacity: 1;
    }
    .lightbox-nav--prev {
      left: 0.75rem;
    }
    .lightbox-nav--next {
      right: 0.75rem;
    }
  `,
})
export class ReservationAdminDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ReservationsAdminService);
  private readonly residentInfo = inject(ResidentInfoService);
  private readonly apartments = inject(ApartmentOptionsService);
  private readonly amenities = inject(AmenityOptionsService);
  private readonly modal = inject(NgbModal);
  private readonly notifications = inject(NotificationService);

  private readonly id = this.route.snapshot.paramMap.get('id')!;

  readonly reservation = signal<ReservationDetailDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly resident = signal<ResidentInfo | null>(null);
  readonly residentLoading = signal(true);

  readonly apartment = signal<ApartmentDetailDto | null>(null);

  /**
   * The booked area. `GET /reservations/{id}` names it only by `amenityId`, and
   * which area a booking is for is the first thing anybody reading this screen
   * needs — so it is resolved and shown at the top, not buried as a GUID.
   */
  readonly amenity = signal<AmenityDetail | null>(null);

  readonly statusLabel = RESERVATION_STATUS_LABEL;
  readonly statusBadge = RESERVATION_STATUS_BADGE;

  readonly title = computed(() => {
    const r = this.reservation();
    return r ? `Reserva ${r.code}` : 'Reserva';
  });

  readonly amenityName = computed(() => this.amenity()?.name ?? null);

  readonly apartmentDisplay = computed(() => {
    const apartment = this.apartment();
    if (apartment) return apartmentLabel(apartment);
    return this.reservation()?.apartmentId ?? '—';
  });

  readonly residentName = computed(() => {
    const r = this.resident();
    return r ? `${r.firstName} ${r.lastName}`.trim() : null;
  });

  /** The area's price, from the policy the detail carries. */
  readonly priceLabel = computed(() => {
    const price = this.reservation()?.policy.price;
    return price == null ? '—' : formatCurrencyCOP(price);
  });

  /**
   * "Paid" here means a proof is in — the same thing the list's
   * `paymentUploaded` reports. `amountPaid` is what the staff recorded on
   * confirming, which is a separate (and optional) fact.
   */
  readonly paymentLabel = computed(() => {
    const r = this.reservation();
    if (!r) return '—';
    return r.paymentProofs.length > 0 ? 'Comprobante subido' : 'Sin comprobante';
  });

  readonly amountPaidLabel = computed(() => {
    const amount = this.reservation()?.amountPaid;
    return amount == null ? null : formatCurrencyCOP(amount);
  });

  // ── Payment proof previews ─────────────────────────────────────────────────

  /** proofId → signed URL, shared by the card previews and the lightbox. */
  private readonly signedUrls = signal<Record<string, SignedUrl>>({});
  /** Proofs whose <img> the browser could not decode — fall back to the icon. */
  private readonly brokenPreviews = signal<Record<string, true>>({});

  readonly previewsLoading = signal(false);
  readonly downloadingId = signal<string | null>(null);

  /** The proofs the lightbox navigates over — the previewable ones, in list order. */
  readonly imageProofs = computed<ReservationPaymentProofDto[]>(() =>
    (this.reservation()?.paymentProofs ?? []).filter(isImageProof),
  );

  readonly viewerIndex = signal(0);

  readonly viewerProof = computed<ReservationPaymentProofDto | null>(
    () => this.imageProofs()[this.viewerIndex()] ?? null,
  );

  readonly viewerCounter = computed(() => {
    const count = this.imageProofs().length;
    return count > 1 ? `${this.viewerIndex() + 1} de ${count}` : null;
  });

  constructor() {
    this.fetch();
  }

  /**
   * Answering changes the booking's state, the deadline and the confirmation
   * block — all of them on this screen — so the record is refetched whole
   * rather than patched. The resident, apartment and area come back with it;
   * they are three cheap reads for a move an administrator makes once.
   */
  onResponded(): void {
    this.fetch();
  }

  windowLabel(r: ReservationDetailDto): string {
    const day = formatDay(r.dateLocal);
    const start = formatInstantAsTimeOfDay(r.startsAtUtc);
    const end = formatInstantAsTimeOfDay(r.endsAtUtc);
    return `${day} · ${start}–${end}`;
  }

  formatInstant(value: string): string {
    return formatInstant(value);
  }

  isImage(proof: ReservationPaymentProofDto): boolean {
    return isImageProof(proof);
  }

  /** Signed URL for a proof, or null while it is still being minted. */
  previewUrl(proofId: string): string | null {
    return this.signedUrls()[proofId]?.url ?? null;
  }

  isBrokenPreview(proofId: string): boolean {
    return proofId in this.brokenPreviews();
  }

  onPreviewError(proofId: string): void {
    this.brokenPreviews.update((prev) => ({ ...prev, [proofId]: true }));
  }

  /**
   * Opens the proof full size. The card preview is capped so the page stays
   * readable with several proofs on it; a transfer receipt's reference number
   * is only legible here.
   */
  openViewer(proof: ReservationPaymentProofDto, tpl: TemplateRef<unknown>): void {
    const index = this.imageProofs().findIndex((p) => p.id === proof.id);
    if (index < 0) return;

    this.viewerIndex.set(index);
    const ref = this.modal.open(tpl, { size: 'xl', centered: true });

    // Esc is ng-bootstrap's; the arrows are ours. The listener lives only as
    // long as the modal does.
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') this.viewerNext();
      else if (event.key === 'ArrowLeft') this.viewerPrev();
    };
    document.addEventListener('keydown', onKeydown);
    ref.hidden.subscribe(() => document.removeEventListener('keydown', onKeydown));
  }

  viewerNext(): void {
    const count = this.imageProofs().length;
    if (count > 1) this.viewerIndex.update((i) => (i + 1) % count);
  }

  viewerPrev(): void {
    const count = this.imageProofs().length;
    if (count > 1) this.viewerIndex.update((i) => (i - 1 + count) % count);
  }

  /**
   * Hands the proof over as a file. Re-minted rather than reusing the preview's
   * URL: this screen stays open while somebody reconciles payments, easily
   * longer than the five minutes a SAS lives.
   */
  download(proof: ReservationPaymentProofDto): void {
    if (this.downloadingId()) return;

    this.downloadingId.set(proof.id);
    this.service
      .getPaymentProofDownloadUrl(this.id, proof.id)
      .pipe(finalize(() => this.downloadingId.set(null)))
      .subscribe({
        // `noopener` so the opened tab cannot reach back through `window.opener`,
        // and `noreferrer` so the SAS never travels as a Referer.
        next: (res) => window.open(res.url, '_blank', 'noopener,noreferrer'),
        // A toast, never `error`: that signal replaces the whole detail, and a
        // SAS that failed to mint is no reason to take the booking off screen.
        error: () => this.notifications.error('No pudimos abrir el comprobante. Inténtalo de nuevo.'),
      });
  }

  /** Mints the URLs the image proofs need, without holding up the rest of the page. */
  private loadPreviews(proofs: ReservationPaymentProofDto[]): void {
    const images = proofs.filter(isImageProof).filter((p) => !this.hasFreshUrl(p.id));
    if (images.length === 0) return;

    this.previewsLoading.set(true);
    forkJoin(images.map((p) => this.mintUrl(p.id)))
      .pipe(finalize(() => this.previewsLoading.set(false)))
      .subscribe();
  }

  private hasFreshUrl(proofId: string): boolean {
    const entry = this.signedUrls()[proofId];
    return !!entry && entry.expiresAt - Date.now() > URL_REFRESH_MARGIN_MS;
  }

  private mintUrl(proofId: string): Observable<SignedUrl | null> {
    return this.service.getPaymentProofDownloadUrl(this.id, proofId).pipe(
      map((res) => {
        const parsed = new Date(res.expiresAtUtc).getTime();
        return {
          url: res.url,
          // An unparseable expiry would keep every read re-minting; assume the
          // API's ~5 min TTL instead.
          expiresAt: Number.isNaN(parsed) ? Date.now() + 5 * 60_000 : parsed,
        };
      }),
      tap((entry) => {
        this.signedUrls.update((prev) => ({ ...prev, [proofId]: entry }));
        this.brokenPreviews.update((prev) => {
          const { [proofId]: _removed, ...rest } = prev;
          return rest;
        });
      }),
      // One dead proof must not sink the whole batch.
      catchError(() => of(null)),
    );
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getById(this.id).subscribe({
      next: (reservation) => {
        this.reservation.set(reservation);
        this.loading.set(false);
        this.fetchResident(reservation.userId);
        this.fetchApartment(reservation.apartmentId);
        this.fetchAmenity(reservation.amenityId);
        this.loadPreviews(reservation.paymentProofs);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  private fetchResident(userId: string): void {
    this.residentLoading.set(true);
    this.residentInfo.getById(userId).subscribe({
      next: (resident) => {
        this.resident.set(resident);
        this.residentLoading.set(false);
      },
      // The booking itself is the important part; a failed resolve just leaves this card empty.
      error: () => {
        this.resident.set(null);
        this.residentLoading.set(false);
      },
    });
  }

  private fetchAmenity(amenityId: string): void {
    this.amenities.getById(amenityId).subscribe({
      // An area deleted out from under a past booking would 404; the heading
      // then stays out rather than showing a GUID nobody can read.
      next: (amenity) => this.amenity.set(amenity),
      error: () => this.amenity.set(null),
    });
  }

  private fetchApartment(apartmentId: string): void {
    // Without `apartments.view` this 403s, and the lookup answers null rather
    // than throwing; the raw id is then what the card shows.
    this.apartments.getById(apartmentId).subscribe((apartment) => this.apartment.set(apartment));
  }
}
