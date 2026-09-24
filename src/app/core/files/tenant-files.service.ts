import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateTenantFileUploadUrlRequest, TenantFileUploadTicketDto } from './tenant-file.models';

/**
 * Client of the Tenants module's single upload endpoint (API ADR-0010 §1).
 *
 * Every tenant-owned file travels the same two steps: the API mints a
 * short-lived pre-signed URL, and the browser PUTs the bytes STRAIGHT to Blob
 * Storage. The API never touches the payload, so the adoption of the returned
 * key is each feature's own domain call — branding saves it, the apartment
 * import opens an import with it.
 */
@Injectable({ providedIn: 'root' })
export class TenantFilesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/tenants/files`;

  /** Step 1: ask the API where to upload and under which key. */
  createUploadUrl(body: CreateTenantFileUploadUrlRequest): Observable<TenantFileUploadTicketDto> {
    return this.http.post<TenantFileUploadTicketDto>(`${this.base}/upload-url`, body);
  }

  /**
   * Step 2: PUT the bytes to the pre-signed URL. `x-ms-blob-type` is required by
   * the Azure Blob PUT API; the SAS in the URL is the credential, which is why
   * `authInterceptor` deliberately skips non-API hosts.
   *
   * `contentType` is passed in rather than read off the file: it must match the
   * one the ticket was minted with, and the browser's guess for a .csv is not
   * dependable.
   */
  upload(uploadUrl: string, file: File, contentType: string): Observable<void> {
    return this.http.put<void>(uploadUrl, file, {
      headers: {
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': contentType,
      },
    });
  }
}
