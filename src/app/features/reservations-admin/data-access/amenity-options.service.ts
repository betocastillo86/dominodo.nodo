import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { PagedResult } from '../../../core/models/paged-result';
import {
  AmenityDetail,
  AmenityListItem,
} from '../../tenant-info/amenities/data-access/amenity.models';

/** Large enough to cover a conjunto's whole social-area catalog in one page. */
const MAX_AREAS = 100;

/**
 * Read-only access to the conjunto's social areas, for the screens of this
 * module that hold a BOOKING and not the catalog: the list's "área social"
 * filter, and the detail, which has to name the area it is showing.
 *
 * Deliberately separate from `AmenitiesService` (the Áreas sociales CRUD
 * screen's own `providedIn: 'root'` list state) so reading from here never
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

  /**
   * One area by id (`GET /amenities/{id}`). `[Authorize]` only on the API —
   * "amenities.view OR an active membership" — so anybody who can read a
   * booking can name its area.
   *
   * The booking's detail already carries the area's POLICY, but not its NAME:
   * `ReservationDetailDto` identifies the area by `amenityId` alone, and a GUID
   * is not an answer to "¿cuál área?".
   */
  getById(id: string): Observable<AmenityDetail> {
    return this.http.get<AmenityDetail>(`${this.base}/${id}`);
  }
}
