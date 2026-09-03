import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Membership } from '../../../core/auth/auth.models';
import { PagedResult } from '../../../core/models/paged-result';

/**
 * Read-only people lookup backing the `app-search-select` typeahead in this
 * module — the same UX as the PQRS resident filter.
 *
 * Two callers, one shape:
 *  - the apartment list filter, which needs a `userId` to send as
 *    `residentUserId` (the API has no phone filter on `GET /apartments`);
 *  - the "add resident" form, where finding a match means the person already
 *    holds a membership, so they are linked with `POST /apartments/{id}/residents`
 *    instead of being invited (which would 409 Membership.AlreadyExists).
 *
 * `GET /memberships?search=` matches the joined user's name, email OR phone, so
 * typing a phone number works directly. Scoped to Active members. Errors
 * resolve to `[]` so a failed lookup shows "no results", not a broken form.
 */
@Injectable({ providedIn: 'root' })
export class ResidentsLookupService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/memberships`;

  /** First page of Active members whose name/email/phone matches `term`. */
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
