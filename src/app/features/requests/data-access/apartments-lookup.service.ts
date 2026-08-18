import { HttpClient } from '@angular/common/http';
import { HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';
import { ApartmentDto } from './apartment.models';

/**
 * Read-only lookup for the PQRS apartment filter. Backs the `app-search-select`
 * typeahead: the user types, we hit `GET /apartments?search=…` and hand back a
 * page of matches; the component turns the chosen apartment's `id` into the
 * `apartmentId` filter sent to `GET /requests`.
 *
 * X-Tenant is attached globally by tenantInterceptor. Errors resolve to `[]`
 * so a failed lookup shows "no results" rather than breaking the filter bar.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentsLookupService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/apartments`;

  /** First page of apartments matching `term` (tower/number). Empty term → first page. */
  search(term: string): Observable<ApartmentDto[]> {
    let params = new HttpParams().set('page', 1).set('pageSize', 20);
    const q = term.trim();
    if (q) params = params.set('search', q);

    return this.http.get<PagedResult<ApartmentDto>>(this.base, { params }).pipe(
      map((result) => result.items),
      catchError(() => of<ApartmentDto[]>([])),
    );
  }
}
