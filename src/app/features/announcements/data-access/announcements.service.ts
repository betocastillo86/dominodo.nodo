import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import {
  AnnouncementDetail,
  AnnouncementFilters,
  AnnouncementListItem,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
} from './announcement.models';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Data-access for the Announcements module. List state lives here as signals
 * (`items`/`paging`/`loading`/`error`); write operations return Observables the
 * component subscribes to and manages locally (docs/architecture.md §9).
 * `X-Tenant` is attached globally by `tenantInterceptor` — no per-call handling.
 */
@Injectable({ providedIn: 'root' })
export class AnnouncementsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/announcements`;

  private readonly _items = signal<AnnouncementListItem[]>([]);
  private readonly _paging = signal<PagedResult<AnnouncementListItem> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Load a page of announcements applying the (server-supported) filters. */
  load(filters: AnnouncementFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    for (const id of filters.categoryIds) {
      params = params.append('categoryIds', id);
    }

    this.http.get<PagedResult<AnnouncementListItem>>(this.baseUrl, { params }).subscribe({
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

  /** Fetch a single announcement's full detail. */
  getById(id: string): Observable<AnnouncementDetail> {
    return this.http.get<AnnouncementDetail>(`${this.baseUrl}/${id}`);
  }

  /** Create a new announcement (starts as Draft); returns the created row. */
  create(body: CreateAnnouncementRequest): Observable<AnnouncementListItem> {
    return this.http.post<AnnouncementListItem>(this.baseUrl, body);
  }

  /** Update an announcement's editable fields. */
  update(id: string, body: UpdateAnnouncementRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}`, body);
  }

  /** Transition Draft → Published (triggers resident notifications server-side). */
  publish(id: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}/publish`, {});
  }

  /** Transition → Archived. */
  archive(id: string): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}/archive`, {});
  }
}
