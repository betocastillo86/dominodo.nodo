/**
 * Administrative blocks of a social area (API ADR-0031): the administration
 * takes an area out of circulation for a free range — it may span several days
 * and ignores opening hours and the booking policy. Typed exactly as
 * `AmenityBlockDto` comes back (camelCase).
 */

export type AmenityBlockStatus = 'Active' | 'Cancelled';

export const AMENITY_BLOCK_STATUS_LABEL: Record<AmenityBlockStatus, string> = {
  Active: 'Activo',
  Cancelled: 'Cancelado',
};

export const AMENITY_BLOCK_STATUS_BADGE: Record<AmenityBlockStatus, string> = {
  Active: 'badge bg-orange-lt',
  Cancelled: 'badge bg-secondary-lt',
};

/** Mirrors `AmenityBlock.TitleMaxLength` / `NotesMaxLength` in the API's domain. */
export const AMENITY_BLOCK_TITLE_MAX_LENGTH = 200;
export const AMENITY_BLOCK_NOTES_MAX_LENGTH = 1000;

export interface AmenityBlockDto {
  id: string;
  amenityId: string;
  /** The blocked window, `[startsAtUtc, endsAtUtc)`. */
  startsAtUtc: string;
  endsAtUtc: string;
  title: string;
  notes: string | null;
  status: AmenityBlockStatus;
  cancelledBy: string | null;
  cancelledAtUtc: string | null;
  createdAtUtc: string;
  createdBy: string | null;
}

/**
 * Body of both `POST /amenities/{id}/blocks` and `PUT /amenities/{id}/blocks/{blockId}`.
 * The PUT replaces all four fields; the area itself never changes.
 */
export interface AmenityBlockRequest {
  startsAtUtc: string;
  endsAtUtc: string;
  title: string;
  notes: string | null;
}

/**
 * Filters of `GET /amenities/{id}/blocks`. `fromUtc`/`toUtc` match the blocked
 * WINDOW — a block that touches the range is returned.
 */
export interface AmenityBlockFilters {
  status: AmenityBlockStatus | null;
  fromUtc: string | null;
  toUtc: string | null;
}

// ── Wall clock ↔ instant ─────────────────────────────────────────────────────

/** The conjunto's fixed offset (`ReportingTime`) — Colombia has no DST. */
const CONJUNTO_OFFSET = '-05:00';

/**
 * A civil date and time typed by the administrator (`yyyy-MM-dd`, `HH:mm`) as
 * an instant on the conjunto's clock, never the browser's: an administrator
 * travelling abroad still blocks the salón from 6 p. m. Bogotá time.
 */
export function toConjuntoInstant(day: string, time: string): string {
  return `${day}T${time}:00${CONJUNTO_OFFSET}`;
}

const CONJUNTO_PARTS = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // `hourCycle` alone, never alongside `hour12` — see `reservation-format.ts`.
  hourCycle: 'h23',
  timeZone: 'America/Bogota',
});

/** An instant back to the `{ day, time }` the form edits, on the conjunto's clock. */
export function fromConjuntoInstant(iso: string): { day: string; time: string } {
  const parts = Object.fromEntries(
    CONJUNTO_PARTS.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return {
    day: `${parts['year']}-${parts['month']}-${parts['day']}`,
    time: `${parts['hour']}:${parts['minute']}`,
  };
}
