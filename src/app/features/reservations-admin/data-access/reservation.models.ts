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
import type { ReservationStatus } from '../../reservations/data-access/reservation-availability.models';

export type { ReservationStatus };

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  Pending: 'Pendiente',
  Confirmed: 'Confirmada',
  Rejected: 'Rechazada',
  Cancelled: 'Cancelada',
  Expired: 'Expirada',
};

export const RESERVATION_STATUS_BADGE: Record<ReservationStatus, string> = {
  Pending: 'badge bg-yellow-lt',
  Confirmed: 'badge bg-green-lt',
  Rejected: 'badge bg-red-lt',
  Cancelled: 'badge bg-secondary-lt',
  Expired: 'badge bg-secondary-lt',
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

/** The three moves this portal offers on a booking, one endpoint each. */
export type ReservationAction = 'confirm' | 'reject' | 'cancel';

export const RESERVATION_ACTION_LABEL: Record<ReservationAction, string> = {
  confirm: 'Aprobar',
  reject: 'Rechazar',
  cancel: 'Cancelar',
};

/** Rejecting and cancelling keep a mandatory reason; approving does not take one. */
export function requiresReason(action: ReservationAction): boolean {
  return action === 'reject' || action === 'cancel';
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
  reservation: ReservationDto,
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

/** Body of `POST /reservations/{id}/confirm`. `amountPaid` is recorded, not processed. */
export interface ConfirmReservationRequest {
  amountPaid: number | null;
}

/** Body of `POST /reservations/{id}/reject` and `.../cancel`. */
export interface ReservationReasonRequest {
  reason: string;
}

/**
 * Server-side filters this screen sends to `GET /reservations` (plus paging and
 * sort). `fromUtc`/`toUtc` match the booking WINDOW, never the creation date.
 */
export interface ReservationFilters {
  amenityId: string | null;
  paymentUploaded: boolean | null;
  fromUtc: string | null;
  toUtc: string | null;
}
