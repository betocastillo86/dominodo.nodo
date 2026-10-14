import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { toMessage } from '../../../../core/http/problem-details';
import { PagedResult } from '../../../../core/models/paged-result';
import { TenantFilesService } from '../../../../core/files/tenant-files.service';
import {
  AmenityDetail,
  AmenityFilters,
  AmenityListItem,
  AmenityPhotoUploadTicket,
  CreateAmenityPhotoUploadUrlRequest,
  CreateAmenityRequest,
  UpdateAmenityRequest,
} from './amenity.models';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Data-access for the Amenities module ("Áreas sociales", ADR-0016). List
 * state lives here as signals (`items`/`paging`/`loading`/`error`); write
 * operations return Observables the component subscribes to and manages
 * locally. `X-Tenant` is attached globally by `tenantInterceptor`.
 *
 * Photos travel the same two-step, direct-to-storage flow as the branding logo
 * (`TenantBrandingService`), but mint their ticket from the aggregate's OWN
 * endpoint (`/amenities/photos/upload-url`, not the generic `/tenants/files`
 * one) — ADR-0016 §5. Only the PUT step is shared, via `TenantFilesService`.
 */
@Injectable({ providedIn: 'root' })
export class AmenitiesService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(TenantFilesService);
  private readonly baseUrl = `${environment.apiBaseUrl}/amenities`;

  private readonly _items = signal<AmenityListItem[]>([]);
  private readonly _paging = signal<PagedResult<AmenityListItem> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Load a page of amenities applying the (server-supported) filters. */
  load(filters: AmenityFilters, page = 1, pageSize = DEFAULT_PAGE_SIZE): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.name.trim()) {
      params = params.set('name', filters.name.trim());
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }

    this.http.get<PagedResult<AmenityListItem>>(this.baseUrl, { params }).subscribe({
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

  /** Fetch a single amenity's full detail (policy + photos). */
  getById(id: string): Observable<AmenityDetail> {
    return this.http.get<AmenityDetail>(`${this.baseUrl}/${id}`);
  }

  /** Configure a new amenity; starts `Active`. */
  create(body: CreateAmenityRequest): Observable<AmenityDetail> {
    return this.http.post<AmenityDetail>(this.baseUrl, body);
  }

  /** Edit an amenity. `photoKeys` replaces the whole set. */
  update(id: string, body: UpdateAmenityRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${id}`, body);
  }

  /** Idempotent: puts the amenity back in circulation. */
  activate(id: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/activate`, {});
  }

  /** Idempotent: takes the amenity out of circulation. */
  markOutOfService(id: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${id}/out-of-service`, {});
  }

  /** Step 1: ask the API where to upload a photo and under which key. */
  createPhotoUploadUrl(
    body: CreateAmenityPhotoUploadUrlRequest,
  ): Observable<AmenityPhotoUploadTicket> {
    return this.http.post<AmenityPhotoUploadTicket>(`${this.baseUrl}/photos/upload-url`, body);
  }

  /** Step 2: PUT the bytes to the pre-signed URL (transport is purpose-agnostic). */
  uploadPhoto(uploadUrl: string, file: File): Observable<void> {
    return this.files.upload(uploadUrl, file, file.type);
  }
}
