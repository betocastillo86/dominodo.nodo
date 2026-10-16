import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { handoffContext } from '../../../core/handoff/handoff.context';
import { PagedResult } from '../../../core/models/paged-result';
import {
  AmenityAvailability,
  AmenityDetail,
  CreateReservationRequest,
  MyReservation,
} from './reservation-availability.models';

const MY_RESERVATIONS_PAGE_SIZE = 100;

/**
 * Data-access for the resident booking screen (ADR-0018). Every call runs as the
 * handoff session (`handoffContext()`) — never the portal's own — since this
 * feature is reachable only through a redeemed handoff ticket.
 *
 * Stateless on purpose: this screen has exactly one reader
 * (`ReservationAvailabilityComponent`), so there is no list state worth lifting
 * into signals here, unlike the paged-table convention the CRUD modules follow.
 * `create` follows that same convention — a write returns an Observable the
 * component manages.
 */
@Injectable({ providedIn: 'root' })
export class ReservationAvailabilityService {
  private readonly http = inject(HttpClient);
  private readonly amenitiesUrl = `${environment.apiBaseUrl}/amenities`;
  private readonly reservationsUrl = `${environment.apiBaseUrl}/reservations`;

  getAmenity(amenityId: string): Observable<AmenityDetail> {
    return this.http.get<AmenityDetail>(`${this.amenitiesUrl}/${amenityId}`, {
      context: handoffContext(),
    });
  }

  /** `from`/`to` are `yyyy-MM-dd` local days, inclusive — the API caps the range at 31 days. */
  getAvailability(amenityId: string, from: string, to: string): Observable<AmenityAvailability> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<AmenityAvailability>(`${this.amenitiesUrl}/${amenityId}/availability`, {
      params,
      context: handoffContext(),
    });
  }

  /**
   * The resident's own bookings, across every area — `GET /reservations/mine`
   * has no amenity or date filter, so narrowing to this amenity/month happens
   * client-side. One page comfortably covers any realistic resident history.
   */
  getMyReservations(): Observable<PagedResult<MyReservation>> {
    const params = new HttpParams().set('page', 1).set('pageSize', MY_RESERVATIONS_PAGE_SIZE);
    return this.http.get<PagedResult<MyReservation>>(`${this.reservationsUrl}/mine`, {
      params,
      context: handoffContext(),
    });
  }

  /**
   * Books the slot. The booking is born `Confirmed`, or `Pending` when the area
   * requires approval or payment (ADR-0018 §2) — the response says which, and
   * the caller shows the resident the right thing.
   */
  create(request: CreateReservationRequest): Observable<MyReservation> {
    return this.http.post<MyReservation>(this.reservationsUrl, request, {
      context: handoffContext(),
    });
  }
}
