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
