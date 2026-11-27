import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import { AmenityBlockDto, AmenityBlockFilters, AmenityBlockRequest } from './amenity-block.models';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Data-access for the administrative blocks of the social areas (API
 * ADR-0031). Every endpoint hangs off ONE area — there is no cross-area
 * listing — so the list always needs an `amenityId`.
 *
 * Reading needs `amenities.view`; creating, editing and cancelling need
 * `amenities.edit`: blocking is configuring the area, not booking it.
 */
@Injectable({ providedIn: 'root' })
export class AmenityBlocksService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/amenities`;

  private readonly _items = signal<AmenityBlockDto[]>([]);
  private readonly _paging = signal<PagedResult<AmenityBlockDto> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** One page of an area's blocks, latest start first (the API's only order). */
  list(
    amenityId: string,
    filters: AmenityBlockFilters,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.fromUtc) params = params.set('fromUtc', filters.fromUtc);
    if (filters.toUtc) params = params.set('toUtc', filters.toUtc);

    this.http
      .get<PagedResult<AmenityBlockDto>>(`${this.base}/${amenityId}/blocks`, { params })
      .subscribe({
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

  /** Clears the list, for when no area is picked yet. */
  clear(): void {
    this._items.set([]);
    this._paging.set(null);
    this._error.set(null);
    this._loading.set(false);
  }

  /**
   * `POST /amenities/{id}/blocks`. Fails with `AmenityBlock.ConflictsWithReservations`
   * when a pending or confirmed booking crosses the range: the block cancels
   * nothing on its own.
   */
  create(amenityId: string, body: AmenityBlockRequest): Observable<AmenityBlockDto> {
    return this.http.post<AmenityBlockDto>(`${this.base}/${amenityId}/blocks`, body);
  }

  /** `PUT /amenities/{id}/blocks/{blockId}` — an ACTIVE block only, same rules as creating one. */
  update(amenityId: string, blockId: string, body: AmenityBlockRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/${amenityId}/blocks/${blockId}`, body);
  }

  /** `POST /amenities/{id}/blocks/{blockId}/cancel` — gives the range back; the block stays as history. */
  cancel(amenityId: string, blockId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${amenityId}/blocks/${blockId}/cancel`, {});
  }
}
