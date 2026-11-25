import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import {
  ApartmentDetailDto,
  ApartmentDto,
  ApartmentSort,
  AssignResidentRequest,
  EndResidencyRequest,
  InviteResidentRequest,
  InviteResidentResponse,
  ResidentDto,
  UpdateAccountStatementRequest,
  UpdateApartmentAnnexesRequest,
} from './apartment.models';

/**
 * Data-access for the Apartments module. List state lives here as signals;
 * writes return Observables the component manages. X-Tenant is attached
 * globally by tenantInterceptor — no per-call handling.
 *
 * Apartments themselves are READ-ONLY in this portal: the API exposes create /
 * update / status endpoints, but they are deliberately not surfaced here. Only
 * the resident links, the account statement and the annexes are mutable.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/apartments`;
  private readonly membershipsBase = `${environment.apiBaseUrl}/memberships`;

  private readonly _items = signal<ApartmentDto[]>([]);
  private readonly _paging = signal<PagedResult<ApartmentDto> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Load a page of apartments (`GET /apartments`, requires apartments.view).
   *
   * `search` matches the apartment NUMBER or any of its annexes — a vehicle
   * plate, parking spot or storage unit (API ADR-0029 §1), partially and
   * ignoring case, spaces and hyphens. It does not touch the tower or any
   * resident field. `tower` is an exact
   * match against one of the conjunto's declared towers. Filtering by a
   * resident is done with `residentUserId`, which only matches ACTIVE
   * residencies; the caller resolves a phone → userId beforehand (see
   * `ResidentsLookupService`), because the API has no phone filter.
   */
  list(
    page: number,
    pageSize: number,
    search: string,
    residentUserId: string | null,
    tower: string | null,
    sort: ApartmentSort,
  ): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('sortBy', sort.sortBy)
      .set('direction', sort.direction);
    if (search.trim()) params = params.set('search', search.trim());
    if (residentUserId) params = params.set('residentUserId', residentUserId);
    if (tower) params = params.set('tower', tower);

    this.http.get<PagedResult<ApartmentDto>>(this.base, { params }).subscribe({
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
   * Every apartment matching the list filters as a CSV (`GET /apartments/export`,
   * requires apartments.view) — unpaged, `torre;apto;en_mora;saldo_en_mora`,
   * the same header the account-statement load reads, so the download doubles
   * as a pre-filled template. Fetched through HttpClient (not a plain link) so
   * the interceptors attach X-Tenant and the bearer token.
   */
  export(
    search: string,
    residentUserId: string | null,
    tower: string | null,
  ): Observable<HttpResponse<Blob>> {
    let params = new HttpParams();
    if (search.trim()) params = params.set('search', search.trim());
    if (residentUserId) params = params.set('residentUserId', residentUserId);
    if (tower) params = params.set('tower', tower);

    return this.http.get(`${this.base}/export`, {
      params,
      responseType: 'blob',
      observe: 'response',
    });
  }

  /** One apartment (`GET /apartments/{id}`). Residents come from `listResidents`. */
  getById(id: string): Observable<ApartmentDetailDto> {
    return this.http.get<ApartmentDetailDto>(`${this.base}/${id}`);
  }

  /**
   * Residents of an apartment (`GET /apartments/{id}/residents`, requires
   * apartments.view). A bare array — NOT paged — carrying active and ended rows.
   */
  listResidents(apartmentId: string): Observable<ResidentDto[]> {
    return this.http.get<ResidentDto[]>(`${this.base}/${apartmentId}/residents`);
  }

  /**
   * Link an EXISTING user to the apartment (`POST /apartments/{id}/residents`,
   * requires apartments.edit). Use this when the person already holds a
   * membership in the conjunto — inviting them again would 409.
   */
  assignResident(apartmentId: string, body: AssignResidentRequest): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/${apartmentId}/residents`, body);
  }

  /**
   * Invite a NEW person as a resident (`POST /memberships/invite`, requires
   * memberships.manage). For an unknown phone the server creates the user and
   * an Active membership; the apartment link is written asynchronously, so the
   * resident may not appear in an immediate refetch.
   */
  inviteResident(body: InviteResidentRequest): Observable<InviteResidentResponse> {
    return this.http.post<InviteResidentResponse>(`${this.membershipsBase}/invite`, body);
  }

  /**
   * Disable a residency (`PUT /apartments/{id}/residents/{residentId}/end`,
   * requires apartments.edit): sets `isActive = false` and stamps `endDate`,
   * keeping the row as history. The person's membership in the conjunto is NOT
   * touched — the API deactivates it on its own when that is warranted.
   */
  endResidency(
    apartmentId: string,
    residentId: string,
    body: EndResidencyRequest,
  ): Observable<void> {
    return this.http.put<void>(`${this.base}/${apartmentId}/residents/${residentId}/end`, body);
  }

  /**
   * Set the unit's account statement by hand (`PUT /apartments/{id}/account-statement`,
   * requires apartments.edit) → 204. Replaces whatever the last bulk load left;
   * the two fields are independent, so both are always sent.
   */
  updateAccountStatement(
    apartmentId: string,
    body: UpdateAccountStatementRequest,
  ): Observable<void> {
    return this.http.put<void>(`${this.base}/${apartmentId}/account-statement`, body);
  }

  /**
   * Replace the unit's vehicles, parking spots and storage units
   * (`PUT /apartments/{id}/annexes`, requires apartments.edit) → 204. A full
   * replace, so the three lists are always sent; an empty one clears it.
   */
  updateAnnexes(apartmentId: string, body: UpdateApartmentAnnexesRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/${apartmentId}/annexes`, body);
  }
}
