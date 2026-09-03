/**
 * DTOs for the Apartments module, typed EXACTLY as `dominodo.api` returns them
 * (camelCase). Do not rename fields.
 *
 * Enums serialize as their verbatim member names (JsonStringEnumConverter), and
 * every response DTO projects them through `.ToString()`, so they always arrive
 * as strings.
 */

/** `ApartmentType` (Tenants/Apartments/ApartmentType.cs). */
export type ApartmentType = 'Apartment' | 'House' | 'Commercial' | 'Parking' | 'Storage';

/** `ApartmentStatus` (Tenants/Apartments/ApartmentStatus.cs). */
export type ApartmentStatus = 'Occupied' | 'Vacant';

/**
 * `ResidentRelationType` — note the member is `Renter`, NOT `Tenant`: in this
 * codebase "tenant" is the conjunto, so the API deliberately avoids the clash.
 */
export type ResidentRelationType = 'Owner' | 'Renter';

/** List item returned by `GET /apartments` (`ApartmentDto`). */
export interface ApartmentDto {
  id: string;
  tenantId: string;
  tower: string | null;
  number: string;
  type: ApartmentType;
  status: ApartmentStatus;
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
}

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
  Parking: 'Parqueadero',
  Storage: 'Depósito',
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
