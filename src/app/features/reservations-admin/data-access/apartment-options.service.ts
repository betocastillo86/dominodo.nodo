import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';
import { ApartmentDetailDto, ApartmentDto } from '../../apartments/data-access/apartment.models';

/** One page is plenty for a typeahead: the resident narrows by typing, not by scrolling. */
const LOOKUP_PAGE_SIZE = 20;

/**
 * Read-only apartment lookup backing the list's apartment filter — the same
 * typeahead shape the PQRS filter bar uses (`app-search-select`): the admin
 * types, `GET /apartments?search=…` answers a page of matches, and the chosen
 * apartment's `id` becomes the `apartmentId` sent to `GET /reservations`.
 *
 * Its own service rather than `ApartmentsService`, for the reason
 * `AmenityOptionsService` states: that one keeps the Apartments screen's paged
 * list in root-provided signals, and filling a dropdown must never overwrite
 * what that screen is showing.
 *
 * Both reads swallow their errors — `[]` and `null` — so a lookup that fails
 * degrades the filter instead of breaking the page it sits on.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentOptionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/apartments`;

  /** Apartments matching `term` (tower/number). An empty term returns the first page. */
  search(term: string): Observable<ApartmentDto[]> {
    let params = new HttpParams().set('page', 1).set('pageSize', LOOKUP_PAGE_SIZE);
    const query = term.trim();
    if (query) {
      params = params.set('search', query);
    }

    return this.http.get<PagedResult<ApartmentDto>>(this.base, { params }).pipe(
      map((result) => result.items),
      catchError(() => of<ApartmentDto[]>([])),
    );
  }

  /**
   * One apartment by id, to label a filter that arrived as a bare id — from a
   * shared URL, say, where "a9f3…" says nothing on screen.
   */
  getById(id: string): Observable<ApartmentDetailDto | null> {
    return this.http
      .get<ApartmentDetailDto>(`${this.base}/${id}`)
      .pipe(catchError(() => of<ApartmentDetailDto | null>(null)));
  }
}
