/**
 * Amenity ("área social") DTOs — typed EXACTLY as `dominodo.api` returns them
 * (camelCase), verified against Swagger (`/api/v1/amenities`, ADR-0016). Do not
 * rename fields.
 */

/** `OperationsAmenityStatus`. No `delete`: this plus soft-delete cover removal. */
export type AmenityStatus = 'Active' | 'OutOfService';

/** `DayOfWeek`, serialized as a string enum (`Sunday` first, matching .NET's). */
export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** `OperationsAmenityPhotoDto`. `url` is the public, servable URL. */
export interface AmenityPhoto {
  id: string;
  key: string;
  url: string;
  sortOrder: number;
}

/** `OperationsOpeningHoursSlotDto` / the write-side `AmenityOpeningHoursInput`. */
export interface AmenityOpeningHoursSlot {
  dayOfWeek: DayOfWeek;
  /** `TimeOnly`, as `HH:mm:ss`. */
  opensAt: string;
  closesAt: string;
}

/**
 * `OperationsReservationPolicyDto` (read) / `OperationsAmenityPolicyInput`
 * (write) — identical shape, so one interface covers both directions.
 * `minHours` defaults to 1 server-side when omitted on write.
 *
 * Every field has to make the round trip on an edit: `PUT /amenities/{id}`
 * REPLACES the policy document, so a field left out of the body is not kept —
 * it is reset to whatever the server defaults it to.
 */
export interface AmenityPolicy {
  allowsMultiplePerDay: boolean;
  minHours: number | null;
  maxHours: number | null;
  price: number | null;
  paymentRequired: boolean;
  maxPerDayPerApartment: number | null;
  usageRules: string | null;
  additionalServices: string | null;
  requiresGoodStanding: boolean;
  /**
   * How long a `Pending` booking holds its slot before expiring; `null` means
   * it never expires. Not edited in this portal — carried verbatim on save so
   * an edit does not silently drop it.
   */
  pendingExpiryHours: number | null;
  /**
   * The notice the holder owes to cancel a CONFIRMED booking: it stops being
   * cancellable this many days before it starts, and `0` means no window at
   * all. Read comes back as a number (`0` for a policy written before the rule
   * existed); on write an omitted value is NOT 0 — the server fills in
   * {@link AMENITY_DEFAULT_CANCEL_BEFORE_DAYS}, so always send it explicitly.
   * Pending bookings and staff holding `reservations.cancel` are never bound.
   */
  cancelBeforeTotalDays: number | null;
  openingHours: AmenityOpeningHoursSlot[];
}

/** Row shape returned by `GET /amenities` (`OperationsAmenityDto`). No `policy`. */
export interface AmenityListItem {
  id: string;
  tenantId: string;
  name: string;
  maxOccupancy: number;
  requiresApproval: boolean;
  status: AmenityStatus;
  photos: AmenityPhoto[];
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/** Full shape returned by `GET /amenities/{id}` (`OperationsAmenityDetailDto`). */
export interface AmenityDetail extends AmenityListItem {
  policy: AmenityPolicy;
}

/** Body for `POST /amenities` (`OperationsCreateAmenityRequest`). */
export interface CreateAmenityRequest {
  name: string;
  maxOccupancy: number;
  requiresApproval: boolean;
  policy: AmenityPolicy;
  photoKeys: string[];
}

/**
 * Body for `PUT /amenities/{id}` (`OperationsUpdateAmenityRequest`). `photoKeys`
 * carries the WHOLE set — resend the keys to keep, drop the ones to remove.
 */
export type UpdateAmenityRequest = CreateAmenityRequest;

/** Server-side filters supported by `GET /amenities` (plus paging). */
export interface AmenityFilters {
  name: string;
  status: AmenityStatus | null;
}

/** Body of `POST /amenities/photos/upload-url` (`OperationsCreateAmenityPhotoUploadUrlRequest`). */
export interface CreateAmenityPhotoUploadUrlRequest {
  contentType: string;
}

/** Response of the same call (`OperationsAmenityPhotoUploadTicketDto`). */
export interface AmenityPhotoUploadTicket {
  uploadUrl: string;
  key: string;
  url: string;
}

/** What the photo upload accepts, mirroring the server's allowlist (ADR-0016 §5). */
export const AMENITY_PHOTO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const AMENITY_MIN_PHOTOS = 1;
export const AMENITY_MAX_PHOTOS = 5;
export const AMENITY_NAME_MAX_LENGTH = 200;
export const AMENITY_POLICY_TEXT_MAX_LENGTH = 2000;

/** `ReservationPolicy.DefaultCancelBeforeTotalDays` / `MaxCancelBeforeTotalDays`. */
export const AMENITY_DEFAULT_CANCEL_BEFORE_DAYS = 7;
export const AMENITY_MAX_CANCEL_BEFORE_DAYS = 365;
