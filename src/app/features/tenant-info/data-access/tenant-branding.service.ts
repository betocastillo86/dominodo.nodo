import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateTenantFileUploadUrlRequest,
  TenantFileUploadTicketDto,
} from '../../../core/files/tenant-file.models';
import { TenantFilesService } from '../../../core/files/tenant-files.service';
import { BrandingDto, UpdateTenantBrandingRequest } from './tenant-branding.models';

/**
 * Data-access for the branding tab of "Mi Conjunto". Like the contact info, a
 * single record scoped to the tenant resolved from `X-Tenant`, so no id travels.
 *
 * Uploading a logo is a two-step, direct-to-storage flow (ADR-0010) shared with
 * every other tenant-owned file: `TenantFilesService` mints the pre-signed URL
 * and PUTs the bytes, and the branding save "adopts" the returned key.
 */
@Injectable({ providedIn: 'root' })
export class TenantBrandingService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(TenantFilesService);
  private readonly brandingUrl = `${environment.apiBaseUrl}/tenants/branding`;

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
    return this.files.createUploadUrl(body);
  }

  /** Step 2: PUT the bytes to the pre-signed URL. */
  upload(uploadUrl: string, file: File): Observable<void> {
    return this.files.upload(uploadUrl, file, file.type);
  }
}
