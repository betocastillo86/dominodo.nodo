import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';
import { RequestDto } from '../../requests/data-access/request.models';

/**
 * Read-only view of the PQRS raised for one apartment, for the apartment detail
 * screen (`GET /requests?apartmentId=…`, requires requests.view).
 *
 * Deliberately separate from `RequestsService`: that one is `providedIn: 'root'`
 * and holds the PQRS module's list state in signals, so reusing it here would
 * clobber whatever the PQRS screen had loaded. This returns an Observable and
 * lets the component own its own state.
 *
 * The DTO and its label maps are imported from the requests module rather than
 * duplicated — they are frozen constants mirroring the API enums, and a second
 * copy would be free to drift out of sync.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentRequestsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/requests`;

  /**
   * One page of the apartment's PQRS. The API already defaults to
   * `sortBy=Date&direction=Desc`, so these come back newest-first.
   */
  list(apartmentId: string, page: number, pageSize: number): Observable<PagedResult<RequestDto>> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('apartmentId', apartmentId);

    return this.http.get<PagedResult<RequestDto>>(this.base, { params });
  }
}
