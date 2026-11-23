/**
 * DTOs for the Visits module, typed EXACTLY as `dominodo.api` returns them
 * (camelCase). Do not rename fields.
 *
 * A visit is PRE-AUTHORIZED by a resident (or staff) and the guard later checks
 * the visitor in: each check-in is a `VisitEntry` (ADR-0027). There is no
 * approval step — an entry is a fact that already happened at the gate.
 */

/** `VisitKind`: Frequent = a range up to a year, many entries; the other two are single-use. */
export type VisitKind = 'Frequent' | 'OneTime' | 'Delivery';

/** Derived status: `Scheduled` until used/expired; `Disabled` only applies to a Frequent. */
export type VisitStatus = 'Scheduled' | 'Used' | 'Expired' | 'Disabled';

export const VISIT_KINDS: readonly VisitKind[] = ['Frequent', 'OneTime', 'Delivery'];
export const VISIT_STATUSES: readonly VisitStatus[] = ['Scheduled', 'Used', 'Expired', 'Disabled'];

export const VISIT_KIND_LABEL: Record<VisitKind, string> = {
  Frequent: 'Frecuente',
  OneTime: 'Una vez',
  Delivery: 'Domicilio',
};

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  Scheduled: 'Programada',
  Used: 'Usada',
  Expired: 'Vencida',
  Disabled: 'Deshabilitada',
};

export const VISIT_STATUS_BADGE: Record<VisitStatus, string> = {
  Scheduled: 'badge bg-blue-lt',
  Used: 'badge bg-green-lt',
  Expired: 'badge bg-secondary-lt',
  Disabled: 'badge bg-red-lt',
};

/** `VisitApartmentDto`. Absent on platform-wide listings. */
export interface VisitApartmentDto {
  id: string;
  tower: string | null;
  number: string;
}

/** Row of `GET /visits` (`VisitDto`). */
export interface VisitDto {
  id: string;
  tenantId: string;
  apartmentId: string;
  apartment: VisitApartmentDto | null;
  kind: VisitKind;
  status: VisitStatus;
  /** `yyyy-MM-dd` local day. */
  validFrom: string;
  /** `yyyy-MM-dd` local day. */
  validUntil: string;
  isEnabled: boolean;
  /** Null on a Delivery (it stores no person). */
  visitorName: string | null;
  visitorDocument: string | null;
  /** Only on a Delivery. */
  companyName: string | null;
  phone: string | null;
  /** Stored normalized: upper-case, no spaces or dashes. */
  vehiclePlate: string | null;
  entriesCount: number;
  lastEnteredAtUtc: string | null;
  createdAtUtc: string;
}

/** One check-in (`VisitEntryDto`). */
export interface VisitEntryDto {
  id: string;
  visitId: string;
  apartmentId: string;
  apartment: VisitApartmentDto | null;
  kind: VisitKind;
  /** The visitor's name, or the company on a Delivery. */
  displayName: string;
  vehiclePlate: string | null;
  enteredAtUtc: string;
  checkedInByUserId: string;
  guardNote: string | null;
}

/** `GET /visits/{id}` (`VisitDetailDto`). */
export interface VisitDetailDto {
  id: string;
  tenantId: string;
  apartmentId: string;
  apartment: VisitApartmentDto | null;
  kind: VisitKind;
  status: VisitStatus;
  validFrom: string;
  validUntil: string;
  isEnabled: boolean;
  visitorName: string | null;
  visitorDocument: string | null;
  companyName: string | null;
  phone: string | null;
  vehiclePlate: string | null;
  /** 15-minute read URL; null when the visit has no photo. */
  photoUrl: string | null;
  registeredByUserId: string;
  entries: VisitEntryDto[];
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/** Body of `POST /visits/{id}/entries`. The body itself is optional. */
export interface CheckInVisitRequest {
  guardNote: string | null;
}

/** Filters of `GET /visits`. `null` / empty = not sent. */
export interface VisitFilters {
  kind: VisitKind | null;
  status: VisitStatus | null;
  apartmentId: string | null;
  /** `yyyy-MM-dd`: visits whose validity range contains this local day. */
  validOn: string | null;
  search: string;
}

/**
 * Body of `POST /visits` (requires `visits.create` when loading on an
 * apartment's behalf, which makes `apartmentId` mandatory). Frequent and OneTime
 * need `visitorName` + `visitorDocument`; Delivery needs `companyName` and the
 * API drops any person data. Only Frequent may span more than one day (≤ 1 year);
 * `validUntil` null means "same day as validFrom".
 */
export interface CreateVisitRequest {
  apartmentId: string;
  kind: VisitKind;
  /** `yyyy-MM-dd`, not before today (local -05:00). */
  validFrom: string;
  validUntil: string | null;
  visitorName: string | null;
  visitorDocument: string | null;
  companyName: string | null;
  phone: string | null;
  /** From `POST /visits/photos/upload-url`. */
  photoKey: string | null;
  /** Optional on any kind; normalized by the API. */
  vehiclePlate: string | null;
}

/**
 * Body of `PUT /visits/{id}/vehicle-plate` — sets or clears (null) the plate in
 * any status. Needs `visits.edit` OR `visits.checkin` (or being the resident).
 */
export interface ChangeVisitVehiclePlateRequest {
  vehiclePlate: string | null;
}

/** `VisitPhotoUploadTicketDto`: a 15-minute PRIVATE write URL plus the key to send as `photoKey`. */
export interface VisitPhotoUploadTicket {
  uploadUrl: string;
  key: string;
}

export const VISIT_PHOTO_CONTENT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];
/** Client-side cap only; the API itself checks the content type, not the size. */
export const VISIT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Domain limits (`Visit.cs`). */
export const VISIT_NAME_MAX_LENGTH = 200;
export const VISIT_DOCUMENT_MAX_LENGTH = 50;
export const VISIT_COMPANY_MAX_LENGTH = 200;
export const VISIT_PHONE_MAX_LENGTH = 30;
/** Counted AFTER normalization, as the domain does. */
export const VISIT_VEHICLE_PLATE_MAX_LENGTH = 20;

export const VISIT_GUARD_NOTE_MAX_LENGTH = 500;

/**
 * The plate as the API will store it (`Visit.NormalizePlate`): trimmed, without
 * spaces or dashes, upper-case; null when nothing is left.
 */
export function normalizeVehiclePlate(value: string | null | undefined): string | null {
  const plate = (value ?? '').trim().replace(/[\s-]/g, '').toUpperCase();
  return plate || null;
}

/** The name a visit is known by: the person, or the company on a Delivery. */
export function visitDisplayName(v: {
  visitorName: string | null;
  companyName: string | null;
}): string {
  return v.visitorName || v.companyName || '—';
}
