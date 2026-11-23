import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import { TenantFilesService } from '../../../core/files/tenant-files.service';
import {
  ChangeVisitVehiclePlateRequest,
  CheckInVisitRequest,
  CreateVisitRequest,
  VisitPhotoUploadTicket,
  VisitDetailDto,
  VisitDto,
  VisitEntryDto,
  VisitFilters,
} from './visit.models';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Data-access for the admin Visits module: list + detail + manual check-in.
 * List state lives as signals; `X-Tenant` is attached globally by
 * `tenantInterceptor`. The API orders the list newest-first by `validFrom` and
 * offers no sort parameter.
 */
@Injectable({ providedIn: 'root' })
export class VisitsService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(TenantFilesService);
  private readonly base = `${environment.apiBaseUrl}/visits`;

  private readonly _items = signal<VisitDto[]>([]);
  private readonly _paging = signal<PagedResult<VisitDto> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  list(filters: VisitFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.kind) params = params.set('kind', filters.kind);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.apartmentId) params = params.set('apartmentId', filters.apartmentId);
    if (filters.validOn) params = params.set('validOn', filters.validOn);
    const search = filters.search.trim();
    if (search) params = params.set('search', search);

    this.http.get<PagedResult<VisitDto>>(this.base, { params }).subscribe({
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

  /** `GET /visits/{id}` — the visit with its entries and a short-lived photo URL. */
  getById(id: string): Observable<VisitDetailDto> {
    return this.http.get<VisitDetailDto>(`${this.base}/${id}`);
  }

  /** Pre-authorize a visit on an apartment's behalf (`POST /visits`, `visits.create`). */
  create(body: CreateVisitRequest): Observable<VisitDto> {
    return this.http.post<VisitDto>(this.base, body);
  }

  /** Step 1 of the photo upload: a PRIVATE write URL + key (`visits.create` or `visits.checkin`). */
  createPhotoUploadUrl(contentType: string): Observable<VisitPhotoUploadTicket> {
    return this.http.post<VisitPhotoUploadTicket>(`${this.base}/photos/upload-url`, { contentType });
  }

  /** Step 2: PUT the bytes straight to Blob Storage — the SAS in the URL is the credential. */
  uploadPhoto(uploadUrl: string, file: File): Observable<void> {
    return this.files.upload(uploadUrl, file, file.type);
  }

  /** Set or clear (null) the visit's plate (`PUT /visits/{id}/vehicle-plate`). */
  changeVehiclePlate(id: string, vehiclePlate: string | null): Observable<void> {
    const body: ChangeVisitVehiclePlateRequest = { vehiclePlate };
    return this.http.put<void>(`${this.base}/${id}/vehicle-plate`, body);
  }

  /**
   * Check the visitor in (`POST /visits/{id}/entries`, requires
   * `visits.checkin`). The apartment's residents are notified by the API. An
   * empty note goes as null.
   */
  checkIn(id: string, guardNote: string): Observable<VisitEntryDto> {
    const body: CheckInVisitRequest = { guardNote: guardNote.trim() || null };
    return this.http.post<VisitEntryDto>(`${this.base}/${id}/entries`, body);
  }
}
