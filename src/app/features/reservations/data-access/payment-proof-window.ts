import { formatHoursDuration } from '../../../shared/ui/duration-input/duration';
import type { AmenityDetail, MyReservation } from './reservation-availability.models';
import { addHours, formatInstant } from './reservation-format';

/**
 * The resident's half of `ReservationPolicy.PaymentProofExpiryHours`: how long a
 * booking on a paid area waits for the comprobante before it stops holding the
 * slot. One place, because the same plazo is said three times on this surface —
 * as reference on the area card, as a warning before confirming, and as a
 * deadline once the booking exists — and three wordings of one rule is how a
 * resident ends up believing the wrong one.
 *
 * The rule only exists where payment does: an area that asks for no payment
 * never releases a booking for a missing comprobante, and `null` hours means
 * the administrator chose not to put a clock on it.
 */
export function paymentProofWindowHours(amenity: AmenityDetail | null | undefined): number | null {
  const policy = amenity?.policy;
  if (!policy?.paymentRequired) return null;
  const hours = policy.paymentProofExpiryHours;
  return hours != null && hours > 0 ? hours : null;
}

/** The area card's reference line: `"Hasta 2 días después de reservar"`. */
export function paymentProofWindowText(amenity: AmenityDetail | null | undefined): string | null {
  const hours = paymentProofWindowHours(amenity);
  return hours == null ? null : `Hasta ${formatHoursDuration(hours)} después de reservar`;
}

/** Said BEFORE confirming, when the booking — and therefore the clock — does not exist yet. */
export function paymentProofWindowNotice(amenity: AmenityDetail | null | undefined): string | null {
  const hours = paymentProofWindowHours(amenity);
  if (hours == null) return null;
  return `Tendrás ${formatHoursDuration(hours)} para enviar el comprobante o pagar en la administración. Si no, el horario se libera.`;
}

/**
 * The same plazo once the booking exists, as a date the resident can act on.
 *
 * `pendingDeadlineUtc` wins whenever the API sent one: it is the server's own
 * answer to "when does this booking stop holding the slot", so echoing it keeps
 * the screen from showing two different deadlines for one booking. Only when it
 * is absent is the date derived from the policy, counted from the moment the
 * booking was created.
 *
 * Only for a `Pending` booking: a confirmed one is settled, and a rejected,
 * cancelled or expired one has no slot left to lose.
 */
export function paymentProofDeadlineNotice(
  amenity: AmenityDetail | null | undefined,
  reservation: MyReservation | null | undefined,
): string | null {
  const hours = paymentProofWindowHours(amenity);
  if (hours == null || !reservation || reservation.status !== 'Pending') return null;

  const deadline = reservation.pendingDeadlineUtc ?? addHours(reservation.createdAtUtc, hours);
  // Phrased as the rule, not as an accusation: the same line is read before the
  // comprobante is sent and after, and "envía el comprobante" would tell a
  // resident who already sent one that it never arrived.
  return `Si antes del ${formatInstant(deadline)} no recibimos tu comprobante o tu pago en la administración, el horario se libera.`;
}
