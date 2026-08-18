import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { forkJoin, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import {
  BOARD_STATUSES,
  compareByPriorityThenDate,
  RequestDto,
  RequestPriority,
  RequestStatus,
} from './request.models';

const BOARD_PAGE_SIZE = 50;

/**
 * Data-access for the Requests (PQRS) module. List state lives here as signals;
 * X-Tenant is attached globally by tenantInterceptor — no per-call handling.
 *
 * Board state is loaded separately via forkJoin (one request per status column).
 */
@Injectable({ providedIn: 'root' })
export class RequestsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/requests`;

  // ── List view ────────────────────────────────────────────────────────────
  private readonly _items = signal<RequestDto[]>([]);
  private readonly _paging = signal<PagedResult<RequestDto> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  // ── Board view ───────────────────────────────────────────────────────────
  private readonly _boardColumns = signal<Record<RequestStatus, RequestDto[]>>({
    New: [],
    InProgress: [],
    Resolved: [],
    Closed: [],
  });
  private readonly _boardTotals = signal<Record<RequestStatus, number>>({
    New: 0,
    InProgress: 0,
    Resolved: 0,
    Closed: 0,
  });
  private readonly _boardLoading = signal(false);
  private readonly _boardError = signal<string | null>(null);

  readonly boardColumns = this._boardColumns.asReadonly();
  readonly boardTotals = this._boardTotals.asReadonly();
  readonly boardLoading = this._boardLoading.asReadonly();
  readonly boardError = this._boardError.asReadonly();

  /** Load a page of requests with optional filters. Pushes state into signals. */
  list(
    page: number,
    pageSize: number,
    statuses: RequestStatus[],
    priority: RequestPriority | null,
    search: string,
    apartmentId: string | null,
    participantUserId: string | null,
  ): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    for (const status of statuses) {
      params = params.append('statuses', status);
    }
    if (priority) params = params.set('priority', priority);
    if (search.trim()) params = params.set('search', search.trim());
    if (apartmentId) params = params.set('apartmentId', apartmentId);
    if (participantUserId) params = params.set('participantUserId', participantUserId);

    this.http.get<PagedResult<RequestDto>>(this.base, { params }).subscribe({
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

  /**
   * Load all 4 status columns in parallel for the board view.
   * Each column fetches up to BOARD_PAGE_SIZE items; totalCount drives the
   * "showing X of Y" footer when there are more items than the page size.
   */
  loadBoard(): void {
    this._boardLoading.set(true);
    this._boardError.set(null);

    const requests = BOARD_STATUSES.map((status) => {
      // Board columns are ordered by priority (High → Low) server-side; the API
      // applies a newest-first tiebreaker on equal priority.
      const params = new HttpParams()
        .set('page', 1)
        .set('pageSize', BOARD_PAGE_SIZE)
        .append('statuses', status)
        .set('sortBy', 'Priority')
        .set('direction', 'Desc');
      return this.http.get<PagedResult<RequestDto>>(this.base, { params });
    });

    forkJoin(requests).subscribe({
      next: (results) => {
        const columns: Record<RequestStatus, RequestDto[]> = {
          New: [],
          InProgress: [],
          Resolved: [],
          Closed: [],
        };
        const totals: Record<RequestStatus, number> = {
          New: 0,
          InProgress: 0,
          Resolved: 0,
          Closed: 0,
        };
        BOARD_STATUSES.forEach((status, i) => {
          columns[status] = results[i].items;
          totals[status] = results[i].totalCount;
        });
        this._boardColumns.set(columns);
        this._boardTotals.set(totals);
        this._boardLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this._boardError.set(toMessage(error));
        this._boardLoading.set(false);
      },
    });
  }

  /** Persist a lifecycle status change (`PUT /requests/{id}/status`, requires requests.edit). */
  changeStatus(id: string, status: RequestStatus): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}/status`, { status, note: null });
  }

  /**
   * Optimistically move a card between board columns: drop from `from`, prepend
   * to `to` with its status rewritten, and adjust column totals. Immutable
   * updates (new arrays/records) so the signal notifies OnPush consumers.
   * Call it again with (from, to) swapped to revert a failed persist.
   */
  moveInBoard(item: RequestDto, from: RequestStatus, to: RequestStatus): void {
    if (from === to) return;

    const columns = { ...this._boardColumns() };
    columns[from] = columns[from].filter((r) => r.id !== item.id);
    // Insert respecting the column's priority-desc ordering (not just prepend),
    // so the optimistic drop matches what a board reload would return.
    columns[to] = [{ ...item, status: to }, ...columns[to]].sort(compareByPriorityThenDate);
    this._boardColumns.set(columns);

    const totals = { ...this._boardTotals() };
    totals[from] = Math.max(0, totals[from] - 1);
    totals[to] = totals[to] + 1;
    this._boardTotals.set(totals);
  }
}
