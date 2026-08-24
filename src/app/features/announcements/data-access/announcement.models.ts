/**
 * Announcement DTOs — typed EXACTLY as `dominodo.api` returns them (camelCase),
 * verified against Swagger (`/api/v1/announcements`). Do not rename fields.
 */

/** Lifecycle status (`OperationsAnnouncementStatus`). */
export type AnnouncementStatus = 'Draft' | 'Published' | 'Archived';

/** Priority level (`OperationsAnnouncementPriority`). */
export type AnnouncementPriority = 'High' | 'Medium' | 'Low';

/** Target audience (`OperationsAudienceType`). */
export type AudienceType = 'AllTenant' | 'ByTower' | 'ByApartments';

/** Row shape returned by `GET /announcements` (`OperationsAnnouncementDto`). No `body`. */
export interface AnnouncementListItem {
  id: string;
  tenantId: string;
  title: string;
  categoryId: string | null;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceType: string;
  publishedAtUtc: string | null;
  expiresAtUtc: string | null;
}

/** Full shape returned by `GET /announcements/{id}` (`OperationsAnnouncementDetailDto`). */
export interface AnnouncementDetail {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  categoryId: string | null;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  audienceType: AudienceType;
  audienceFilter: string | null;
  publishedAtUtc: string | null;
  expiresAtUtc: string | null;
  publishedByUserId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Body for `POST /announcements` (`OperationsCreateAnnouncementRequest`). */
export interface CreateAnnouncementRequest {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  audienceType: AudienceType;
  audienceFilter: string | null;
  categoryId: string | null;
  expiresAtUtc: string | null;
}

/** Body for `PUT /announcements/{id}` (`OperationsUpdateAnnouncementRequest`). */
export interface UpdateAnnouncementRequest {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  audienceType: AudienceType;
  audienceFilter: string | null;
  categoryId: string | null;
  expiresAtUtc: string | null;
}

/** Server-side filters supported by `GET /announcements` (only these two, plus paging). */
export interface AnnouncementFilters {
  status: AnnouncementStatus | null;
  categoryIds: string[];
}
