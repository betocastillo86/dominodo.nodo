/**
 * DTOs for the Apartments module, typed EXACTLY as `dominodo.api` returns them
 * (camelCase). Do not rename fields.
 *
 * Enums serialize as their verbatim member names (JsonStringEnumConverter), and
 * every response DTO projects them through `.ToString()`, so they always arrive
 * as strings.
 */

/**
 * `ApartmentType` (Tenants/Apartments/ApartmentType.cs). Parking and storage are
 * no longer units but annexes of an apartment (API ADR-0029 §2).
 */
export type ApartmentType = 'Apartment' | 'House' | 'Commercial';

/** `ApartmentStatus` (Tenants/Apartments/ApartmentStatus.cs). */
export type ApartmentStatus = 'Occupied' | 'Vacant';

/**
 * `ResidentRelationType` — note the member is `Renter`, NOT `Tenant`: in this
 * codebase "tenant" is the conjunto, so the API deliberately avoids the clash.
 */
export type ResidentRelationType = 'Owner' | 'Renter';

/**
 * `AccountStatementDto` — the unit's morosidad snapshot. The two figures are
 * INDEPENDENT (ADR-0025 §2): a settled unit can stay flagged and an indebted one
 * can be exempted, so `isOverdue` is never derived from `overdueBalance`.
 */
export interface AccountStatementDto {
  overdueBalance: number;
  isOverdue: boolean;
  updatedAtUtc: string;
}

/** Body of `PUT /apartments/{id}/account-statement` (requires apartments.edit). */
export interface UpdateAccountStatementRequest {
  /** >= 0; the server rounds to 2 decimals. */
  overdueBalance: number;
  isOverdue: boolean;
}

/**
 * `sortBy` of `GET /apartments` (`ApartmentSortField`). `Tower` orders by tower
 * then number, `Number` by number then tower; the two account-statement fields
 * put units that never had a statement last, in either direction.
 */
export type ApartmentSortBy = 'Tower' | 'Number' | 'OverdueBalance' | 'IsOverdue';

export interface ApartmentSort {
  sortBy: ApartmentSortBy;
  direction: 'Asc' | 'Desc';
}

/** What the API applies when no sort is sent. */
export const DEFAULT_APARTMENT_SORT: ApartmentSort = { sortBy: 'Tower', direction: 'Asc' };

/** List item returned by `GET /apartments` (`ApartmentListItemDto`). */
export interface ApartmentDto {
  id: string;
  tenantId: string;
  tower: string | null;
  number: string;
  type: ApartmentType;
  status: ApartmentStatus;
  /** Null while the unit has never received one — not the same as a zeroed statement. */
  accountStatement: AccountStatementDto | null;
  /** Never null: a unit that never got annexes reads as three empty lists. */
  annexes: ApartmentAnnexesDto;
  /** Monthly administration fee. Null = not configured, which is not the same as 0 (an exempt unit). */
  administrationFee: number | null;
}

/** `GET /apartments/{id}` (`ApartmentDetailDto`). Residents are NOT inline. */
export interface ApartmentDetailDto {
  id: string;
  tenantId: string;
  tower: string | null;
  number: string;
  type: ApartmentType;
  status: ApartmentStatus;
  /** Free-form string; the API does not parse it as JSON. */
  attributes: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  /** Null while the unit has never received one — not the same as a zeroed statement. */
  accountStatement: AccountStatementDto | null;
  /** Never null: a unit that never got annexes reads as three empty lists. */
  annexes: ApartmentAnnexesDto;
  /** Monthly administration fee. Null = not configured, which is not the same as 0 (an exempt unit). */
  administrationFee: number | null;
}

/**
 * Body of `PUT /apartments/{id}` (requires apartments.edit) → 204. A FULL
 * replace: an omitted or null `attributes` / `administrationFee` is cleared, so
 * whoever changes one field echoes every other one as it was. The tower is only
 * checked against the conjunto's list when it changes, so echoing a legacy one
 * is safe.
 */
export interface UpdateApartmentRequest {
  number: string;
  type: ApartmentType;
  tower: string | null;
  attributes: string | null;
  /** >= 0; the server rounds to 2 decimals. Null clears it. */
  administrationFee: number | null;
}

export interface ApartmentVehicleDto {
  /** Normalized by the API: uppercase, no spaces or hyphens. */
  plate: string;
  model: string | null;
}

/**
 * Vehicles, parking spots and storage units of an apartment (API ADR-0029 §1).
 * Nothing is unique — the same plate or spot may repeat, even across units —
 * and every value is also a search key of `GET /apartments?search=`.
 */
export interface ApartmentAnnexesDto {
  vehicles: ApartmentVehicleDto[];
  parkingSpots: string[];
  storageUnits: string[];
}

/**
 * Body of `PUT /apartments/{id}/annexes` (requires apartments.edit) → 204. A full
 * replace: an empty list clears it, so the form always sends all three.
 */
export type UpdateApartmentAnnexesRequest = ApartmentAnnexesDto;

/** Limits enforced by the API (`ApartmentAnnexes`). */
export const ANNEX_MAX_ITEMS = 10;
export const ANNEX_PLATE_MAX_LENGTH = 20;
export const ANNEX_MODEL_MAX_LENGTH = 100;
export const ANNEX_LABEL_MAX_LENGTH = 20;

/** Nested profile on `ResidentDto`. Null when Users can't resolve the id. */
export interface ResidentUserDto {
  fullName: string;
  phone: string;
}

/**
 * One resident↔apartment link, from `GET /apartments/{id}/residents`.
 * Returns ALL rows (active and ended) — filter on `isActive` client-side.
 * `id` is the ApartmentResident row id, NOT a membership id.
 */
export interface ResidentDto {
  id: string;
  apartmentId: string;
  userId: string;
  relationType: ResidentRelationType;
  livesHere: boolean;
  /** `YYYY-MM-DD` (DateOnly) or null. */
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  user: ResidentUserDto | null;
}

/** Body of `POST /apartments/{id}/residents` — the user must ALREADY exist. */
export interface AssignResidentRequest {
  userId: string;
  relationType: ResidentRelationType;
  livesHere: boolean;
  /** `YYYY-MM-DD` or null. */
  startDate: string | null;
}

/** Body of `PUT /apartments/{id}/residents/{residentId}/end`. `endDate` is required. */
export interface EndResidencyRequest {
  /** `YYYY-MM-DD`. */
  endDate: string;
}

/**
 * Body of `POST /memberships/invite`. For an unknown phone with
 * `roleId = RESIDENTE_ROLE_ID` the server creates the user AND an Active
 * membership, then links the apartment asynchronously (domain event).
 * `apartmentId`/`relationType`/`livesHere` are required for that role and
 * REJECTED for any other.
 */
export interface InviteResidentRequest {
  /** E.164, e.g. `+573001234567`. */
  phone: string;
  roleId: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  apartmentId: string;
  relationType: ResidentRelationType;
  livesHere: boolean;
}

/** 201 body of `POST /memberships/invite`. */
export interface InviteResidentResponse {
  id: string;
  /** `membership` when the person was linked directly, `invitation` when pending. */
  kind: 'membership' | 'invitation';
}

/** `SystemRoleIds.Residente` — residents are always invited with this role. */
export const RESIDENTE_ROLE_ID = 5;

export const APARTMENT_TYPE_LABEL: Record<ApartmentType, string> = {
  Apartment: 'Apartamento',
  House: 'Casa',
  Commercial: 'Local comercial',
};

export const APARTMENT_STATUS_LABEL: Record<ApartmentStatus, string> = {
  Occupied: 'Ocupado',
  Vacant: 'Desocupado',
};

export const APARTMENT_STATUS_BADGE: Record<ApartmentStatus, string> = {
  Occupied: 'badge bg-green-lt',
  Vacant: 'badge bg-secondary-lt',
};

export const RELATION_LABEL: Record<ResidentRelationType, string> = {
  Owner: 'Propietario',
  Renter: 'Arrendatario',
};

export const RELATION_BADGE: Record<ResidentRelationType, string> = {
  Owner: 'badge bg-blue-lt',
  Renter: 'badge bg-purple-lt',
};

/** Display label for an apartment: "Torre A · 101", or just "101" without a tower. */
export function apartmentLabel(apartment: {
  tower: string | null;
  number: string;
}): string {
  return apartment.tower ? `${apartment.tower} · ${apartment.number}` : apartment.number;
}

const MONEY = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** `$ 450.000` in the conjunto's currency; cents only when there are some. */
export function formatMoney(value: number): string {
  return MONEY.format(value);
}
