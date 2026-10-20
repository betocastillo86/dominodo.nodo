/**
 * DTOs for the admin Reservations module ("Reservas", read-only: list + detail
 * over the areas sociales bookings). Typed EXACTLY as `dominodo.api` returns
 * them (camelCase; do not rename) — verified against Swagger
 * (`/api/v1/reservations`, 2026-10-19).
 *
 * The LIST row and the DETAIL are NOT the same shape, and the detail is the
 * leaner of the two: `apartment`, `price` and `paymentUploaded` live only on
 * the list row. That is why `ReservationDetailDto` does not extend
 * `ReservationDto`, and why the detail screen resolves the apartment itself and
 * reads payment state from `paymentProofs`/`amountPaid` instead.
 *
 * `status` reuses the same `ReservationStatus` union as the resident booking
 * screen (`features/reservations`) — both read the same
 * `OperationsReservationStatus` enum, so one definition covers both.
 */
import type { AmenityPolicy } from '../../tenant-info/amenities/data-access/amenity.models';
import type {
  AttachmentDownloadUrl,
  ReservationStatus,
} from '../../reservations/data-access/reservation-availability.models';

export type { AttachmentDownloadUrl, ReservationStatus };

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  Pending: 'Pendiente',
  Confirmed: 'Confirmada',
  Rejected: 'Rechazada',
  Cancelled: 'Cancelada',
  Expired: 'Expirada',
};

/**
 * Every status, in the order the status filter offers them — the API's own
 * `OperationsReservationStatus` order, which also runs from "needs an answer"
 * to "already closed".
 */
export const RESERVATION_STATUSES: readonly ReservationStatus[] = [
  'Pending',
  'Confirmed',
  'Rejected',
  'Cancelled',
  'Expired',
];

/**
 * The Tabler colour utility each status wears. Split out from the badge class
 * because the list paints the same colours on a `<select>` rather than a
 * `<span>` — `badge` would fight the control's own shape, the tint alone does
 * not (it sets background, text and border colour, nothing else).
 */
export const RESERVATION_STATUS_TINT: Record<ReservationStatus, string> = {
  Pending: 'bg-yellow-lt',
  Confirmed: 'bg-green-lt',
  Rejected: 'bg-red-lt',
  Cancelled: 'bg-secondary-lt',
  Expired: 'bg-secondary-lt',
};

/** That same tint worn as a badge — every static status cell in the module. */
export const RESERVATION_STATUS_BADGE: Record<ReservationStatus, string> = {
  Pending: `badge ${RESERVATION_STATUS_TINT.Pending}`,
  Confirmed: `badge ${RESERVATION_STATUS_TINT.Confirmed}`,
  Rejected: `badge ${RESERVATION_STATUS_TINT.Rejected}`,
  Cancelled: `badge ${RESERVATION_STATUS_TINT.Cancelled}`,
  Expired: `badge ${RESERVATION_STATUS_TINT.Expired}`,
};

/** Sort key accepted by `GET /reservations` (`sortBy`). `StartDate` is the booked window. */
export type ReservationSortBy = 'StartDate' | 'CreatedDate';
/** Sort direction accepted by `GET /reservations` (`direction`). */
export type SortDirection = 'Asc' | 'Desc';

export interface ReservationSort {
  sortBy: ReservationSortBy;
  direction: SortDirection;
}

/**
 * The booking's apartment, embedded on each LIST row
 * (`OperationsReservationApartmentDto` — not the full `ApartmentDto`).
 */
export interface ReservationApartmentDto {
  id: string;
  tower: string | null;
  number: string;
}

/** Row shape returned by `GET /reservations` (`OperationsReservationDto`). */
export interface ReservationDto {
  id: string;
  tenantId: string;
  amenityId: string;
  code: string;
  userId: string;
  apartmentId: string;
  apartment: ReservationApartmentDto;
  startsAtUtc: string;
  endsAtUtc: string;
  /** The local day the window falls on (`DateOnly` as `yyyy-MM-dd`). */
  dateLocal: string;
  attendees: number;
  status: ReservationStatus;
  /**
   * The area's CURRENT price, not a value frozen when the booking was made:
   * re-pricing an area changes what past bookings report here.
   */
  price: number | null;
  /** Whether a payment proof is already in. Not the same as "fully paid". */
  paymentUploaded: boolean;
  pendingDeadlineUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/** `OperationsReservationPaymentProofDto`. */
export interface ReservationPaymentProofDto {
  id: string;
  fileName: string;
  contentType: string;
  uploadedBy: string;
  uploadedAtUtc: string;
}

/** Extensions still treated as images when the stored content type came back generic. */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif'];

/**
 * Whether a payment proof can be rendered as an image. Not every proof can: the
 * API's allowlist also takes PDFs and Office documents, and those keep the
 * generic file icon. An upload that lost its content type on the way to Blob
 * (`application/octet-stream`) still matches by extension.
 */
export function isImageProof(proof: ReservationPaymentProofDto): boolean {
  if (proof.contentType?.toLowerCase().startsWith('image/')) return true;
  const name = proof.fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Full shape returned by `GET /reservations/{id}`
 * (`OperationsReservationDetailDto`). Deliberately NOT extending
 * `ReservationDto` — see the file doc: the detail carries no `apartment`,
 * `price` or `paymentUploaded`.
 */
export interface ReservationDetailDto {
  id: string;
  tenantId: string;
  amenityId: string;
  code: string;
  userId: string;
  apartmentId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  dateLocal: string;
  attendees: number;
  status: ReservationStatus;
  pendingDeadlineUtc: string | null;
  confirmedBy: string | null;
  confirmedAtUtc: string | null;
  /** What the staff RECORDED as paid when confirming; there is no wallet behind it. */
  amountPaid: number | null;
  /** The approver's optional note, written when the booking was confirmed. */
  confirmationComment: string | null;
  rejectedBy: string | null;
  rejectedAtUtc: string | null;
  rejectionReason: string | null;
  cancelledBy: string | null;
  cancelledAtUtc: string | null;
  cancellationReason: string | null;
  /** The area's policy at read time (price, payment/approval rules, hours). */
  policy: AmenityPolicy;
  paymentProofs: ReservationPaymentProofDto[];
  /** When the resident asked for the booking — "fecha de solicitud". */
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

// ── State transitions ─────────────────────────────────────────────────────────

/** `Reservation.ReasonMaxLength` — mirrored from the domain. */
export const RESERVATION_REASON_MAX_LENGTH = 500;

/** `Reservation.CommentMaxLength` — mirrored from the domain. */
export const RESERVATION_COMMENT_MAX_LENGTH = 500;

/** The three moves this portal offers on a booking, one endpoint each. */
export type ReservationAction = 'confirm' | 'reject' | 'cancel';

/** The state each move LANDS the booking on. */
export const RESERVATION_ACTION_TARGET: Record<ReservationAction, ReservationStatus> = {
  confirm: 'Confirmed',
  reject: 'Rejected',
  cancel: 'Cancelled',
};

/**
 * How a move is NAMED wherever it is offered or reported: by the state it lands
 * on, never by a verb. One source for all three places a move surfaces — the
 * list's status select, the dialog's own select, and the toast that follows —
 * so a booking reads "Confirmada" everywhere instead of being approved in one
 * screen and confirmed in the next.
 */
export const RESERVATION_ACTION_LABEL: Record<ReservationAction, string> = {
  confirm: RESERVATION_STATUS_LABEL[RESERVATION_ACTION_TARGET.confirm],
  reject: RESERVATION_STATUS_LABEL[RESERVATION_ACTION_TARGET.reject],
  cancel: RESERVATION_STATUS_LABEL[RESERVATION_ACTION_TARGET.cancel],
};

/** Rejecting and cancelling keep a mandatory reason; approving does not take one. */
export function requiresReason(action: ReservationAction): boolean {
  return action === 'reject' || action === 'cancel';
}

/**
 * Approving takes an OPTIONAL note where the other two take a motive — the only
 * move that carries one. Nothing is lost by leaving it empty: the domain trims
 * it and reads blank as absence (`Reservation.CheckComment`), so an untouched
 * textarea and a whitespace-only one both store nothing.
 */
export function acceptsComment(action: ReservationAction): boolean {
  return action === 'confirm';
}

/**
 * As much of a booking as answering it needs. Structural on purpose: the LIST
 * row (`ReservationDto`) and the DETAIL (`ReservationDetailDto`) are different
 * shapes, and both screens open the same dialog.
 */
export interface RespondableReservation {
  id: string;
  code: string;
  status: ReservationStatus;
  startsAtUtc: string;
}

/**
 * The moves the API would actually accept for this booking, mirroring the
 * domain guards (`Reservation.Confirm/Reject/Cancel`):
 *  - confirm/reject: only a PENDING booking, and only with `reservations.edit`;
 *  - cancel: a pending or confirmed booking whose window has not started, and
 *    only with `reservations.cancel` (a different permission — staff are not
 *    bound by the area's cancellation notice, the holder is).
 *
 * Hiding what is not allowed is UX; the server stays authoritative, so a race
 * still comes back as a 409 and is shown as such.
 */
export function availableReservationActions(
  reservation: RespondableReservation,
  canEdit: boolean,
  canCancel: boolean,
): ReservationAction[] {
  const actions: ReservationAction[] = [];
  const isPending = reservation.status === 'Pending';

  if (canEdit && isPending) {
    actions.push('confirm', 'reject');
  }

  const blocksSlot = isPending || reservation.status === 'Confirmed';
  const started = new Date(reservation.startsAtUtc).getTime() <= Date.now();
  if (canCancel && blocksSlot && !started) {
    actions.push('cancel');
  }

  return actions;
}

/**
 * Body of `POST /reservations/{id}/confirm`. `amountPaid` is recorded, not
 * processed; `comment` is the approver's optional note, read back on the detail
 * as `confirmationComment`.
 */
export interface ConfirmReservationRequest {
  amountPaid: number | null;
  comment: string | null;
}

/** Body of `POST /reservations/{id}/reject` and `.../cancel`. */
export interface ReservationReasonRequest {
  reason: string;
}

/**
 * Server-side filters this screen sends to `GET /reservations` (plus paging and
 * sort). THREE independent date ranges, each over a different instant — picking
 * the wrong one is the easy mistake here:
 *  - `fromUtc`/`toUtc` — the booked WINDOW, when the area is used;
 *  - `createdFromUtc`/`createdToUtc` — when the resident ASKED for it;
 *  - `expiresFromUtc`/`expiresToUtc` — `pendingDeadlineUtc`, when an unanswered
 *    pending booking lapses.
 */
export interface ReservationFilters {
  amenityId: string | null;
  apartmentId: string | null;
  status: ReservationStatus | null;
  paymentUploaded: boolean | null;
  fromUtc: string | null;
  toUtc: string | null;
  createdFromUtc: string | null;
  createdToUtc: string | null;
  expiresFromUtc: string | null;
  expiresToUtc: string | null;
}
