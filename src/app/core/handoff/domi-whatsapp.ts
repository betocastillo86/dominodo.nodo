import { environment } from '../../../environments/environment';

/**
 * Deep link back to Domi's WhatsApp chat — the way out of the resident surface,
 * which the resident reached from that same chat (ADR-0017).
 *
 * `wa.me` is WhatsApp's own deep link, so it hands the resident back to the
 * conversation instead of opening a second app — including inside WhatsApp's
 * in-app browser, where this surface usually runs.
 *
 * The number lives in `src/environments/` because it is Domi's Twilio sender
 * and is NOT the same per environment: dev and stage share the non-production
 * sender, prod has its own. Returns `null` when no number is configured, so
 * callers can simply hide the link.
 */
export function domiWhatsAppUrl(): string | null {
  const digits = environment.domiWhatsAppNumber.replace(/\D/g, '');
  return digits.length > 0 ? `https://wa.me/${digits}` : null;
}
