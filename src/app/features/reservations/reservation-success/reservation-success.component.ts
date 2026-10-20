import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TablerIconComponent } from 'angular-tabler-icons';
import {
  AmenityDetail,
  BLOCKING_RESERVATION_STATUSES,
  MyReservation,
} from '../data-access/reservation-availability.models';
import {
  formatCurrencyCOP,
  formatInstant,
  formatInstantAsTimeOfDay,
  formatLongDate,
} from '../data-access/reservation-format';
import { ReservationPaymentProofComponent } from '../reservation-payment-proof/reservation-payment-proof.component';

/**
 * What the resident sees once the booking exists (ADR-0018). Presentational:
 * it takes the created reservation and renders it, and the only way out is back
 * to Domi's chat — a booked slot ends the errand the link started.
 *
 * The booking's **code** (`R001`) is the headline, not its GUID: ADR-0011 made
 * the code exactly so a human — and Domi, in the chat — can name the booking.
 * The GUID is never shown; nobody reads one out loud.
 *
 * The status matters as much as the code. A booking is born `Confirmed` only
 * when the area asks for neither approval nor payment (ADR-0018 §2); otherwise
 * it is `Pending` and bound to a deadline, and a resident who walks away
 * thinking "reservado" would lose the slot.
 *
 * The one thing the resident can still DO from here is send the comprobante,
 * which is why that block sits above the way out: a booking born `Pending` on
 * a paid area is waiting on exactly that. The booking was created a moment ago,
 * so it carries no proofs yet and the block is handed an empty list rather than
 * spending a request to learn so.
 */
@Component({
  selector: 'app-reservation-success',
  standalone: true,
  imports: [TablerIconComponent, ReservationPaymentProofComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-success.component.html',
  styles: `
    .reservation-code {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    /* Full-width and thumb-sized: this is the end of the flow, tapped one-handed. */
    .action-btn {
      min-height: 2.75rem;
      touch-action: manipulation;
    }
  `,
})
export class ReservationSuccessComponent {
  readonly reservation = input.required<MyReservation>();
  readonly amenity = input.required<AmenityDetail>();
  /** `null` hides the link — see `domiWhatsAppUrl()`. */
  readonly whatsAppUrl = input<string | null>(null);

  readonly isConfirmed = computed(() => this.reservation().status === 'Confirmed');

  /**
   * A booking only accepts proofs while it blocks a slot. Always true for a
   * booking just created — kept as a check anyway, so the block does not have
   * to assume where it was rendered from.
   */
  readonly acceptsProofs = computed(() =>
    BLOCKING_RESERVATION_STATUSES.includes(this.reservation().status),
  );

  /** Why it is still pending, in the resident's words. Both reasons can apply. */
  readonly pendingReason = computed(() => {
    const amenity = this.amenity();
    const needsApproval = amenity.requiresApproval;
    const needsPayment = amenity.policy.paymentRequired;

    if (needsApproval && needsPayment) {
      return 'Queda pendiente del pago y de la aprobación de la administración.';
    }
    if (needsPayment) {
      return 'Queda pendiente del pago.';
    }
    if (needsApproval) {
      return 'Queda pendiente de la aprobación de la administración.';
    }
    return 'Queda pendiente de confirmación por parte de la administración.';
  });

  readonly deadlineLabel = computed(() => {
    const deadline = this.reservation().pendingDeadlineUtc;
    return deadline ? formatInstant(deadline) : null;
  });

  readonly priceLabel = computed(() => {
    const price = this.amenity().policy.price;
    return price ? formatCurrencyCOP(price) : null;
  });

  readonly dateLabel = computed(() => formatLongDate(this.reservation().dateLocal));

  readonly timeLabel = computed(() => {
    const reservation = this.reservation();
    return `${formatInstantAsTimeOfDay(reservation.startsAtUtc)} – ${formatInstantAsTimeOfDay(reservation.endsAtUtc)}`;
  });
}
