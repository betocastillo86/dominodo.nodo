import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { TablerIconComponent } from 'angular-tabler-icons';
import { catchError, finalize, map, Observable, of, switchMap, tap } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { ReservationAvailabilityService } from '../data-access/reservation-availability.service';
import { formatInstant } from '../data-access/reservation-format';
import {
  RESERVATION_MAX_PAYMENT_PROOFS,
  RESERVATION_PROOF_IMAGE_CONTENT_TYPES,
  RESERVATION_PROOF_MAX_BYTES,
  ReservationPaymentProofDto,
} from '../data-access/reservation-availability.models';

/** A minted SAS URL plus the epoch ms it stops working at. */
interface SignedUrl {
  url: string;
  expiresAt: number;
}

/** Re-mint a cached SAS this long before it expires, so a load that starts at the edge finishes. */
const URL_REFRESH_MARGIN_MS = 60_000;

/**
 * The resident's half of the payment-proof flow (ADR-0018 §5): upload the
 * comprobante, and once it is in, see it and take it back out as an image.
 *
 * Three calls, never the bytes through our API: the API mints a 15-minute
 * pre-signed PUT, the browser uploads STRAIGHT to the private container, and a
 * third call adopts the key as a proof of this booking. Reading one back needs
 * its own short-lived SAS — the container is private, so unlike an amenity
 * photo there is no URL that keeps working.
 *
 * Attaching a proof does NOT confirm the booking. The copy says so, because a
 * resident who uploads a receipt and walks away believing the slot is theirs is
 * exactly the failure this screen exists to prevent.
 *
 * Images only, by deliberate narrowing: the API also accepts PDFs and Office
 * documents, but this is a phone inside WhatsApp's WebView, where the proof is
 * a screenshot or a photo — and only an image can be shown back the way the
 * resident expects.
 */
@Component({
  selector: 'app-reservation-payment-proof',
  standalone: true,
  imports: [TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-payment-proof.component.html',
  styles: `
    /* Thumb-sized, like every other action on this surface: a Tabler button is
       below 44px by default. */
    .proof-btn {
      min-height: 2.75rem;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    /* The proof itself. Contained, not cropped — a transfer receipt is tall and
       narrow, and cropping it to a square hides the amount. Capped in vh so it
       never pushes the download button off a 360x640 screen. */
    .proof-figure {
      border-radius: var(--tblr-border-radius);
      background-color: var(--tblr-bg-surface-tertiary);
      overflow: hidden;
    }
    .proof-image {
      display: block;
      width: 100%;
      max-height: 45vh;
      object-fit: contain;
    }

    /* The fallback when the browser cannot decode what was uploaded. */
    .proof-placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 7rem;
      color: var(--tblr-secondary);
    }
  `,
})
export class ReservationPaymentProofComponent implements OnInit {
  private readonly service = inject(ReservationAvailabilityService);

  readonly reservationId = input.required<string>();

  /**
   * The proofs already on the booking. Only `GET /reservations/{id}` carries
   * them, so the parent passes what it loaded — the success screen knows this
   * is empty (the booking was created a moment ago) and spends no request on it.
   */
  readonly initialProofs = input<readonly ReservationPaymentProofDto[]>([]);

  /**
   * Whether the API would still accept a proof — a booking only takes one while
   * it blocks a slot (`Pending` or `Confirmed`). Hiding the picker otherwise is
   * UX; the server stays authoritative and answers 409 either way.
   */
  readonly canUpload = input<boolean>(true);

  readonly proofs = signal<ReservationPaymentProofDto[]>([]);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly downloadingId = signal<string | null>(null);

  /**
   * Said after a successful upload, and kept until the resident does something
   * else. The proof appearing above is not enough on its own: on a phone the
   * image pushes the rest down, so what sits under the thumb that just tapped
   * is this line — and "¿se habrá subido?" is the question that makes somebody
   * send the same receipt four times.
   */
  readonly success = signal<string | null>(null);

  /** proofId → signed URL, used by the preview. Downloads always mint a fresh one. */
  private readonly signedUrls = signal<Record<string, SignedUrl>>({});
  /** Proofs whose <img> the browser could not decode — fall back to the icon. */
  private readonly brokenPreviews = signal<Record<string, true>>({});

  readonly acceptedTypes = RESERVATION_PROOF_IMAGE_CONTENT_TYPES.join(',');
  readonly maxBytesLabel = `${RESERVATION_PROOF_MAX_BYTES / (1024 * 1024)} MB`;

  readonly hasProofs = computed(() => this.proofs().length > 0);

  readonly canAddMore = computed(
    () => this.canUpload() && this.proofs().length < RESERVATION_MAX_PAYMENT_PROOFS,
  );

  ngOnInit(): void {
    const proofs = [...this.initialProofs()];
    this.proofs.set(proofs);
    if (proofs.length) {
      this.loadPreviews(proofs);
    }
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    // Cleared right away so the same file can be re-picked after an error.
    target.value = '';
    if (!file || this.uploading()) return;

    this.error.set(null);
    this.success.set(null);

    if (!RESERVATION_PROOF_IMAGE_CONTENT_TYPES.includes(file.type)) {
      this.error.set('Solo puedes subir imágenes (JPG, PNG, WEBP o GIF).');
      return;
    }
    if (file.size > RESERVATION_PROOF_MAX_BYTES) {
      this.error.set(`La imagen supera ${this.maxBytesLabel}. Intenta con una más liviana.`);
      return;
    }

    this.upload(file);
  }

  private upload(file: File): void {
    const reservationId = this.reservationId();
    this.uploading.set(true);

    this.service
      .createPaymentProofUploadUrl(reservationId, {
        fileName: file.name,
        contentType: file.type,
      })
      .pipe(
        switchMap((ticket) =>
          this.service.uploadPaymentProof(ticket.uploadUrl, file).pipe(map(() => ticket)),
        ),
        switchMap((ticket) =>
          this.service.confirmPaymentProof(reservationId, {
            key: ticket.key,
            fileName: file.name,
            contentType: file.type,
          }),
        ),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: (proof) => {
          this.proofs.update((list) => [...list, proof]);
          this.loadPreviews([proof]);
          // Deliberately NOT "ya quedó confirmada": a proof never moves the
          // booking's state (ADR-0018 §5), and this wording holds whether the
          // booking is still pending or was confirmed before the payment.
          this.success.set('¡Listo! Recibimos tu comprobante. La administración lo revisará.');
        },
        error: (error: unknown) => this.error.set(this.uploadMessage(error)),
      });
  }

  /**
   * The PUT to Blob Storage fails as a status-0/opaque error with no
   * `ProblemDetails` behind it, so `toMessage` would surface nothing useful —
   * and that is the step most likely to fail on a phone's connection.
   */
  private uploadMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status !== 0 && error.error?.title) {
      return toMessage(error);
    }
    return 'No pudimos subir el comprobante. Verifica tu conexión e intenta de nuevo.';
  }

  // ── Preview ─────────────────────────────────────────────────────────────────

  previewUrl(proofId: string): string | null {
    return this.signedUrls()[proofId]?.url ?? null;
  }

  isBrokenPreview(proofId: string): boolean {
    return proofId in this.brokenPreviews();
  }

  onPreviewError(proofId: string): void {
    this.brokenPreviews.update((prev) => ({ ...prev, [proofId]: true }));
  }

  uploadedAt(proof: ReservationPaymentProofDto): string {
    return formatInstant(proof.uploadedAtUtc);
  }

  private loadPreviews(proofs: readonly ReservationPaymentProofDto[]): void {
    for (const proof of proofs) {
      if (this.hasFreshUrl(proof.id)) continue;
      this.mintUrl(proof.id).subscribe();
    }
  }

  private hasFreshUrl(proofId: string): boolean {
    const entry = this.signedUrls()[proofId];
    return !!entry && entry.expiresAt - Date.now() > URL_REFRESH_MARGIN_MS;
  }

  private mintUrl(proofId: string): Observable<SignedUrl | null> {
    return this.service.getPaymentProofDownloadUrl(this.reservationId(), proofId).pipe(
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
      // A proof that cannot be previewed still has its download button.
      catchError(() => of(null)),
    );
  }

  // ── Download ────────────────────────────────────────────────────────────────

  /**
   * Always re-minted, never the cached preview URL: the resident may have had
   * this card open longer than the SAS lives. The spinner is cleared by
   * `saveAs`, not by the mint — the bytes are the slow half on mobile data, and
   * a button that goes idle while nothing has happened yet reads as broken.
   */
  download(proof: ReservationPaymentProofDto): void {
    if (this.downloadingId()) return;

    this.downloadingId.set(proof.id);
    this.error.set(null);
    this.success.set(null);

    this.service.getPaymentProofDownloadUrl(this.reservationId(), proof.id).subscribe({
      next: (res) => this.saveAs(res.url, proof.fileName),
      error: () => {
        this.downloadingId.set(null);
        this.error.set('No pudimos abrir el comprobante. Intenta de nuevo en un momento.');
      },
    });
  }

  /**
   * `download` on a CROSS-ORIGIN href is ignored by every browser, and the SAS
   * carries no `content-disposition`, so the link alone would merely navigate
   * to the image. The bytes are fetched first and handed over as a `blob:` URL,
   * which is same-origin and honours the attribute — a real save, named after
   * the file the resident uploaded.
   *
   * That fetch needs CORS on the storage account (the same rule the upload PUT
   * already relies on). Two fallbacks behind it, because this surface is a
   * WebView: a new tab, and — when the WebView blocks one, which it does for a
   * window opened outside a tap — this tab, where the resident can long-press
   * to save. The handoff session lives in `sessionStorage`, so coming back is
   * a Back tap, not a lost booking.
   */
  private saveAs(url: string, fileName: string): void {
    fetch(url)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error('fetch'))))
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        this.clickDownload(objectUrl, fileName);
        // Revoking synchronously races the save; a minute outlives any of it.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      })
      .catch(() => {
        if (!window.open(url, '_blank', 'noopener,noreferrer')) {
          window.location.href = url;
        }
      })
      .finally(() => this.downloadingId.set(null));
  }

  private clickDownload(href: string, fileName: string): void {
    const link = document.createElement('a');
    link.href = href;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
