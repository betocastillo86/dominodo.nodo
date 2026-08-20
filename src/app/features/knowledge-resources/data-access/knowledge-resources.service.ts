import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import {
  CreateKnowledgeResourceRequest,
  KnowledgeResourceDetail,
  KnowledgeResourceFilters,
  KnowledgeResourceListItem,
  UpdateKnowledgeResourceRequest,
} from './knowledge-resource.models';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Data-access for the Knowledge Resources module. List state lives here as signals
 * (`items`/`paging`/`loading`/`error`); write operations return Observables the
 * component subscribes to and manages locally (docs/architecture.md §9).
 * `X-Tenant` is attached globally by `tenantInterceptor` — no per-call handling.
 */
@Injectable({ providedIn: 'root' })
export class KnowledgeResourcesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/knowledge-resources`;

  private readonly _items = signal<KnowledgeResourceListItem[]>([]);
  private readonly _paging = signal<PagedResult<KnowledgeResourceListItem> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Load a page of knowledge resources applying the (server-supported) filters. */
  load(filters: KnowledgeResourceFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.search?.trim()) {
      params = params.set('search', filters.search.trim());
    }

    this.http.get<PagedResult<KnowledgeResourceListItem>>(this.baseUrl, { params }).subscribe({
      next: (result) => {
        this._items.set(result.items);
        this._paging.set(result);
        this._loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this._items.set([]);
        this._paging.set(null);
        this._error.set(toMessage(error));
        this._loading.set(false);
      },
    });
  }

  /** Fetch a single knowledge resource's full detail. */
  getById(id: string): Observable<KnowledgeResourceDetail> {
    return this.http.get<KnowledgeResourceDetail>(`${this.baseUrl}/${id}`);
  }

  /** Create a new knowledge resource (starts as Draft); returns the created row. */
  create(body: CreateKnowledgeResourceRequest): Observable<KnowledgeResourceListItem> {
    return this.http.post<KnowledgeResourceListItem>(this.baseUrl, body);
  }

  /** Update a knowledge resource's editable fields including status. */
  update(id: string, body: UpdateKnowledgeResourceRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}`, body);
  }
}
