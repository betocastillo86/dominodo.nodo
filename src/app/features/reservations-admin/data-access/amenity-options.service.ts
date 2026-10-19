import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';

/** Large enough to cover a conjunto's whole social-area catalog in one page. */
const MAX_AREAS = 100;

/**
 * Read-only options for the "área social" filter dropdown (`GET /amenities`).
 * Deliberately separate from `AmenitiesService` (the Áreas sociales CRUD
 * screen's own `providedIn: 'root'` list state) so loading this filter never
 * clobbers whatever that screen has loaded — same reasoning as
 * `ApartmentRequestsService` in the Apartments module.
 */
@Injectable({ providedIn: 'root' })
export class AmenityOptionsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/amenities`;

  /** Every area regardless of status — an out-of-service one may still have past/future bookings. */
  list(): Observable<AmenityListItem[]> {
    const params = new HttpParams().set('page', 1).set('pageSize', MAX_AREAS);
    return this.http
      .get<PagedResult<AmenityListItem>>(this.base, { params })
      .pipe(map((result) => result.items));
  }
}
