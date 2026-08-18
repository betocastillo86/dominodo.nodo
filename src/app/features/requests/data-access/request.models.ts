/**
 * Request (PQRS) DTOs — typed EXACTLY as `dominodo.api` returns them (camelCase).
 * Verified against RequestDto.cs and RequestsController.cs. Do not rename fields.
 */

export type RequestStatus = 'New' | 'InProgress' | 'Resolved' | 'Closed';
export type RequestType = 'Peticion' | 'Queja' | 'Reclamo' | 'Sugerencia' | 'Maintenance';
export type RequestPriority = 'Low' | 'Medium' | 'High';
export type RequestVisibility = 'Private' | 'Public';

/** Row shape returned by `GET /requests` (`RequestDto`). */
export interface RequestDto {
  id: string;
  tenantId: string;
  code: string;
  type: RequestType;
  categoryId: string;
  title: string;
  description: string;
  location: string | null;
  status: RequestStatus;
  priority: RequestPriority;
  visibility: RequestVisibility;
  createdByUserId: string;
  apartmentId: string | null;
  assignedToUserId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Ordered list of statuses for the board view columns. */
export const BOARD_STATUSES: readonly RequestStatus[] = ['New', 'InProgress', 'Resolved', 'Closed'];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  New: 'Nuevo',
  InProgress: 'En progreso',
  Resolved: 'Resuelto',
  Closed: 'Cerrado',
};

/** Badge class for list table cells and board count pills. */
export const STATUS_BADGE: Record<RequestStatus, string> = {
  New: 'badge bg-azure-lt',
  InProgress: 'badge bg-yellow-lt',
  Resolved: 'badge bg-green-lt',
  Closed: 'badge bg-secondary-lt',
};

/** Tabler color name for `card-status-top` and derived utilities in the board. */
export const STATUS_COLOR: Record<RequestStatus, string> = {
  New: 'azure',
  InProgress: 'yellow',
  Resolved: 'green',
  Closed: 'secondary',
};

export const PRIORITY_LABEL: Record<RequestPriority, string> = {
  Low: 'Baja',
  Medium: 'Media',
  High: 'Alta',
};

/** Numeric weight for sorting (mirrors the API enum: Low=0, Medium=1, High=2). */
export const PRIORITY_RANK: Record<RequestPriority, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
};

/**
 * Board ordering: priority descending (High → Low), then newest first — the
 * same order the API applies with `sortBy=Priority&direction=Desc` and its
 * `ThenByDescending(CreatedAtUtc)` tiebreaker. Used to keep optimistic drops
 * consistent with what a board reload would return.
 */
export function compareByPriorityThenDate(a: RequestDto, b: RequestDto): number {
  const byPriority = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
  if (byPriority !== 0) return byPriority;
  return new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime();
}

export const PRIORITY_BADGE: Record<RequestPriority, string> = {
  Low: 'badge bg-blue-lt',
  Medium: 'badge bg-orange-lt',
  High: 'badge bg-red-lt',
};

export const TYPE_LABEL: Record<RequestType, string> = {
  Peticion: 'Petición',
  Queja: 'Queja',
  Reclamo: 'Reclamo',
  Sugerencia: 'Sugerencia',
  Maintenance: 'Mantenimiento',
};
