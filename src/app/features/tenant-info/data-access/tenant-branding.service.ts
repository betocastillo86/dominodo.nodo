import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  BrandingDto,
  CreateTenantFileUploadUrlRequest,
  TenantFileUploadTicketDto,
  UpdateTenantBrandingRequest,
} from './tenant-branding.models';

/**
 * Data-access for the branding tab of "Mi Conjunto". Like the contact info, a
 * single record scoped to the tenant resolved from `X-Tenant`, so no id travels.
 *
 * Uploading a logo is a two-step, direct-to-storage flow (ADR-0010): the API
 * mints a pre-signed URL, the browser PUTs the bytes straight to Blob Storage,
 * and the branding save "adopts" the returned key.
 */
@Injectable({ providedIn: 'root' })
export class TenantBrandingService {
  private readonly http = inject(HttpClient);
  private readonly brandingUrl = `${environment.apiBaseUrl}/tenants/branding`;
  private readonly filesUrl = `${environment.apiBaseUrl}/tenants/files`;

  /** Read the branding of the caller's own conjunto. */
  get(): Observable<BrandingDto> {
    return this.http.get<BrandingDto>(this.brandingUrl);
  }

  /** Replace the branding (theme + adopted logo key) of the caller's conjunto. */
  update(body: UpdateTenantBrandingRequest): Observable<void> {
    return this.http.put<void>(this.brandingUrl, body);
  }

  /** Step 1: ask the API where to upload and under which key. */
  createUploadUrl(body: CreateTenantFileUploadUrlRequest): Observable<TenantFileUploadTicketDto> {
    return this.http.post<TenantFileUploadTicketDto>(`${this.filesUrl}/upload-url`, body);
  }

  /**
   * Step 2: PUT the bytes to the pre-signed URL. `x-ms-blob-type` is required by
   * the Azure Blob PUT API; the SAS in the URL is the credential, which is why
   * `authInterceptor` deliberately skips non-API hosts.
   */
  upload(uploadUrl: string, file: File): Observable<void> {
    return this.http.put<void>(uploadUrl, file, {
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': file.type,
      },
    });
  }
}
