/** DTO returned by `GET /request-categories` (`OperationsRequestCategoryDto`). */
export interface RequestCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
}
