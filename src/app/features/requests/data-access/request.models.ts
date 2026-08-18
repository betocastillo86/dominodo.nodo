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

// ── Detail DTOs ───────────────────────────────────────────────────────────────

export type RequestParticipantType = 'Reporter' | 'Follower';
export type RequestParticipantSource = 'Self' | 'AutoMatched' | 'Admin';
export type RequestUpdateType = 'Progress' | 'Comment' | 'Evidence' | 'Resolution';

export interface RequestParticipantDto {
  id: string;
  userId: string;
  participantType: RequestParticipantType;
  source: RequestParticipantSource;
  joinedAtUtc: string;
}

export interface RequestUpdateDto {
  id: string;
  authorUserId: string;
  type: RequestUpdateType;
  body: string | null;
  isInternal: boolean;
  createdAtUtc: string;
}

export interface RequestStatusHistoryDto {
  id: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  changedByUserId: string;
  changedAtUtc: string;
  note: string | null;
}

export interface RequestAttachmentDto {
  id: string;
  requestId: string;
  requestUpdateId: string | null;
  fileName: string;
  contentType: string;
  uploadedByUserId: string;
  createdAtUtc: string;
}

/** Full detail shape returned by `GET /requests/{id}`. */
export interface RequestDetailDto extends RequestDto {
  resolvedAtUtc: string | null;
  closedAtUtc: string | null;
  metadata: string | null;
  participants: RequestParticipantDto[];
  updates: RequestUpdateDto[];
  statusHistory: RequestStatusHistoryDto[];
  attachments: RequestAttachmentDto[];
}

// ── Request bodies ────────────────────────────────────────────────────────────

export interface UpdateRequestBody {
  type: RequestType;
  title: string;
  description: string;
  priority: RequestPriority;
  categoryId: string;
  location: string | null;
  metadata: string | null;
  visibility: RequestVisibility;
}

export interface AddRequestUpdateBody {
  type: RequestUpdateType;
  body: string | null;
  isInternal: boolean;
}

export interface AttachmentDownloadUrlDto {
  url: string;
}

// ── Label maps for detail view ────────────────────────────────────────────────

export const UPDATE_TYPE_LABEL: Record<RequestUpdateType, string> = {
  Progress: 'Progreso',
  Comment: 'Comentario',
  Evidence: 'Evidencia',
  Resolution: 'Resolución',
};

export const UPDATE_TYPE_BADGE: Record<RequestUpdateType, string> = {
  Progress: 'badge bg-blue-lt',
  Comment: 'badge bg-secondary-lt',
  Evidence: 'badge bg-purple-lt',
  Resolution: 'badge bg-green-lt',
};

export const PARTICIPANT_TYPE_LABEL: Record<RequestParticipantType, string> = {
  Reporter: 'Solicitante',
  Follower: 'Seguidor',
};

/**
 * Valid target statuses from each source status.
 * Rule: every transition is allowed EXCEPT Closed → New and Resolved → New.
 */
export const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  New: ['InProgress', 'Resolved', 'Closed'],
  InProgress: ['New', 'Resolved', 'Closed'],
  Resolved: ['InProgress', 'Closed'],
  Closed: ['InProgress', 'Resolved'],
};
