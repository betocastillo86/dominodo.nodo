import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';

export interface RequestCategoryDto {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
}

/**
 * Read-only category lookup for the request form selects.
 * Loads all active categories in one request (category lists are small/stable).
 * Errors resolve to [] so the form stays usable even if the lookup fails.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesLookupService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/request-categories`;

  getActive(): Observable<RequestCategoryDto[]> {
    return this.http
      .get<PagedResult<RequestCategoryDto>>(this.base, { params: { page: 1, pageSize: 100 } })
      .pipe(
        map((r) => r.items.filter((c) => c.isActive)),
        catchError(() => of<RequestCategoryDto[]>([])),
      );
  }
}
