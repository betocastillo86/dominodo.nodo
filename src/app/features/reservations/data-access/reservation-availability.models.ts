/**
 * DTOs for the resident booking screen (ADR-0018 in `dominodo.api`), typed
 * EXACTLY as the API returns them (camelCase). Do not rename fields.
 *
 * The amenity shapes (`AmenityDetail`, `AmenityPolicy`, …) are re-exported from
 * the admin "Áreas sociales" feature instead of being redefined: both features
 * read the same `GET /amenities/{id}` response, and the admin side already
 * mirrors it field-for-field (ADR-0016). Only the NEW shapes this screen needs
 * — availability and the resident's own bookings (ADR-0018) — are defined here.
 */
import type {
  AmenityDetail,
  AmenityOpeningHoursSlot,
  AmenityPhoto,
  AmenityPolicy,
  AmenityStatus,
  DayOfWeek,
} from '../../tenant-info/amenities/data-access/amenity.models';

export type { AmenityDetail, AmenityOpeningHoursSlot, AmenityPhoto, AmenityPolicy, AmenityStatus, DayOfWeek };

/** `OperationsAmenitySlotUnavailableReason` (ADR-0018 §3/§8). */
export type AmenitySlotUnavailableReason = 'Past' | 'Booked' | 'DayAlreadyBooked';

/**
 * `OperationsAmenityAvailabilitySlotDto`. `startsAtLocal`/`endsAtLocal` are the
 * conjunto's fixed `-05:00` local time, verbatim (`TimeOnly` as `HH:mm:ss`).
 * `reason` is non-null exactly when `isAvailable` is `false`.
 */
export interface AmenityAvailabilitySlot {
  startsAtUtc: string;
  endsAtUtc: string;
  startsAtLocal: string;
  endsAtLocal: string;
  isAvailable: boolean;
  reason: AmenitySlotUnavailableReason | null;
}

/** `OperationsAmenityAvailabilityDayDto`. `date` is `DateOnly` as `yyyy-MM-dd`. */
export interface AmenityAvailabilityDay {
  date: string;
  dayOfWeek: DayOfWeek;
  slots: AmenityAvailabilitySlot[];
}

/**
 * `OperationsAmenityAvailabilityDto` — `GET /amenities/{id}/availability?from=&to=`
 * (ADR-0018 §3/§8). NOT paged: every day of the range comes back, capped at 31
 * days (a longer range is rejected by the API, never truncated).
 */
export interface AmenityAvailability {
  amenityId: string;
  from: string;
  to: string;
  /** Duration of every slot — the area's minimum booking, the atomic bookable unit. */
  slotHours: number;
  days: AmenityAvailabilityDay[];
}

/** `OperationsReservationStatus` (ADR-0018 §2). Only `Pending`/`Confirmed` block a slot. */
export type ReservationStatus = 'Pending' | 'Confirmed' | 'Rejected' | 'Cancelled' | 'Expired';

export const BLOCKING_RESERVATION_STATUSES: readonly ReservationStatus[] = ['Pending', 'Confirmed'];

/**
 * `OperationsReservationDto` — the row shape of `GET /reservations/mine` and
 * also what `POST /reservations` answers with on 201.
 */
export interface MyReservation {
  id: string;
  tenantId: string;
  amenityId: string;
  code: string;
  userId: string;
  apartmentId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  /** The local day the window falls on — what the calendar matches against. */
  dateLocal: string;
  attendees: number;
  status: ReservationStatus;
  pendingDeadlineUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/**
 * Body of `POST /reservations` (`OperationsCreateReservationRequest`, ADR-0018 §8).
 *
 * The window is the chosen availability slot's own `startsAtUtc`/`endsAtUtc`
 * sent back verbatim: the API re-validates it against the policy (hour-aligned,
 * a whole number of hours, inside a single opening tramo), so echoing the slot
 * is the only way to be sure the client and the server agree on the window.
 */
export interface CreateReservationRequest {
  amenityId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  attendees: number;
  /**
   * Only the staff branch and a resident with MORE THAN ONE active residency
   * need this. This screen never sends it: a handoff session has no way to list
   * the resident's apartments, so the ambiguous case comes back as
   * `Reservation.ApartmentAmbiguous` and is handled as an error.
   */
  apartmentId?: string;
}

// ── Payment proofs (ADR-0018 §5) ──────────────────────────────────────────────

/**
 * The booking's full detail — `GET /reservations/{id}`, reachable by the
 * handoff session. Re-exported from the admin Reservations module instead of
 * redefined: both sides read the SAME `OperationsReservationDetailDto`, and
 * these are type-only imports, so nothing of that feature reaches this bundle.
 */
export type {
  ReservationDetailDto,
  ReservationPaymentProofDto,
} from '../../reservations-admin/data-access/reservation.models';

/** `Reservation.MaxPaymentProofs` — mirrored from the domain. */
export const RESERVATION_MAX_PAYMENT_PROOFS = 5;

/**
 * What the resident's file picker accepts. The API's allowlist is wider (it
 * also takes PDFs and Office documents), but this surface is a phone inside
 * WhatsApp's WebView: the comprobante is a screenshot of the transfer or a
 * photo of the receipt, and narrowing the picker to images is what keeps the
 * preview below meaningful — every proof shown here can be rendered as one.
 */
export const RESERVATION_PROOF_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

/**
 * Same cap the branding logo and the apartment import use. The API enforces no
 * size of its own — the PUT goes straight to Blob Storage — so this is the only
 * thing standing between a 12 MP phone photo and a resident's mobile data.
 */
export const RESERVATION_PROOF_MAX_BYTES = 5 * 1024 * 1024;

/** Body of `POST /reservations/{id}/payment-proofs/upload-url`. */
export interface CreateReservationPaymentProofUploadUrlRequest {
  fileName: string;
  contentType: string;
}

/**
 * `OperationsReservationPaymentProofUploadTicketDto`. No `url`, unlike an
 * amenity photo's ticket: the container is private, so reading the blob back
 * needs its own short-lived SAS (`AttachmentDownloadUrl`).
 */
export interface ReservationPaymentProofUploadTicket {
  uploadUrl: string;
  /** What the confirm call echoes back; the API checks it belongs to this booking. */
  key: string;
}

/** Body of `POST /reservations/{id}/payment-proofs`. */
export interface ConfirmReservationPaymentProofRequest {
  key: string;
  fileName: string;
  contentType: string;
}

/**
 * `AttachmentDownloadUrlDto` — a short-lived (~5 min) SAS for one blob in the
 * private container. Defined here rather than imported from the PQRS feature:
 * the API shares the contract across modules, the portal does not share it
 * across features.
 */
export interface AttachmentDownloadUrl {
  url: string;
  /** SAS expiry; a cached URL must be re-minted past it. */
  expiresAtUtc: string;
}

/**
 * The booking's state as the RESIDENT reads it. Deliberately not the admin
 * table's one-word label: "Pendiente" alone, on the screen where a resident
 * just booked, reads as "ya quedó" — the waiting is the part they must notice.
 */
export const RESIDENT_RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  Pending: 'Pendiente de confirmación',
  Confirmed: 'Confirmada',
  Rejected: 'Rechazada',
  Cancelled: 'Cancelada',
  Expired: 'Expirada',
};

export const RESIDENT_RESERVATION_STATUS_BADGE: Record<ReservationStatus, string> = {
  Pending: 'badge bg-yellow-lt',
  Confirmed: 'badge bg-green-lt',
  Rejected: 'badge bg-red-lt',
  Cancelled: 'badge bg-secondary-lt',
  Expired: 'badge bg-secondary-lt',
};
