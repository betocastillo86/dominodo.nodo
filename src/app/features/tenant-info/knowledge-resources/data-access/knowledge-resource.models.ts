/**
 * Knowledge Resource DTOs — typed EXACTLY as `dominodo.api` returns them (camelCase),
 * verified against Swagger (`/api/v1/knowledge-resources`). Do not rename fields.
 */

/** Lifecycle status (`OperationsKnowledgeResourceStatus`). */
export type KnowledgeResourceStatus = 'Draft' | 'Published' | 'Archived';

/** Row shape returned by `GET /knowledge-resources` (`OperationsKnowledgeResourceDto`). No `body`. */
export interface KnowledgeResourceListItem {
  id: string;
  tenantId: string;
  title: string;
  category: string | null;
  status: KnowledgeResourceStatus;
  publishedAtUtc: string | null;
  updatedAtUtc: string | null;
}

/** Full shape returned by `GET /knowledge-resources/{id}` (`OperationsKnowledgeResourceDetailDto`). */
export interface KnowledgeResourceDetail {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  category: string | null;
  status: KnowledgeResourceStatus;
  publishedAtUtc: string | null;
  publishedByUserId: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Body for `POST /knowledge-resources` (`OperationsCreateKnowledgeResourceRequest`). */
export interface CreateKnowledgeResourceRequest {
  title: string;
  body: string;
}

/** Body for `PUT /knowledge-resources/{id}` (`OperationsUpdateKnowledgeResourceRequest`). */
export interface UpdateKnowledgeResourceRequest {
  title: string;
  body: string;
  status: KnowledgeResourceStatus;
}

/** Server-side filters supported by `GET /knowledge-resources`. */
export interface KnowledgeResourceFilters {
  search: string | null;
  status: KnowledgeResourceStatus | null;
}
