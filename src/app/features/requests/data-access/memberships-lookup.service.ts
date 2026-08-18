import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Membership } from '../../../core/auth/auth.models';
import { PagedResult } from '../../../core/models/paged-result';

/**
 * Read-only lookup for the PQRS assignee filter. Backs the `app-search-select`
 * typeahead: the user types a name, we hit `GET /memberships?search=…` and hand
 * back a page of Active members; the component turns the chosen member's
 * `userId` into the `assignedToUserId` filter sent to `GET /requests`.
 *
 * Scoped to Active memberships — only current members can hold assignments.
 * Errors resolve to `[]` so a failed lookup shows "no results", not a broken bar.
 */
@Injectable({ providedIn: 'root' })
export class MembershipsLookupService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/memberships`;

  /** First page of Active members whose name/phone matches `term`. */
  search(term: string): Observable<Membership[]> {
    let params = new HttpParams().set('page', 1).set('pageSize', 20).set('status', 'Active');
    const q = term.trim();
    if (q) params = params.set('search', q);

    return this.http.get<PagedResult<Membership>>(this.base, { params }).pipe(
      map((result) => result.items),
      catchError(() => of<Membership[]>([])),
    );
  }
}
