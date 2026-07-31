import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';
import { RequestCategory } from './request-category.models';

/**
 * Lookup service for request categories (`GET /request-categories`).
 * Loads active categories once; the list is used as a select source in
 * announcement create/edit and as a multi-select filter in the list.
 */
@Injectable({ providedIn: 'root' })
export class RequestCategoriesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/request-categories`;

  private readonly _categories = signal<RequestCategory[]>([]);
  readonly categories = this._categories.asReadonly();

  load(): void {
    const params = new HttpParams().set('pageSize', 100).set('includeInactive', false);
    this.http.get<PagedResult<RequestCategory>>(this.baseUrl, { params }).subscribe({
      next: (result) => this._categories.set(result.items),
      error: (_: HttpErrorResponse) => this._categories.set([]),
    });
  }
}
