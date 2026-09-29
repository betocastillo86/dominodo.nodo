import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TenantFilesService } from '../../../core/files/tenant-files.service';
import {
  ApartmentImportAcceptedDto,
  ApartmentImportDto,
  IMPORT_CONTENT_TYPE,
} from './apartment-import.models';

/**
 * Data-access for the bulk apartment/resident import (API ADR-0012).
 *
 * No list state lives here: the API exposes no listing of imports, only the
 * three verbs of one import's life cycle. The component owns the polling, since
 * how often to ask depends on which stage it is watching.
 *
 * Opening an import is a THREE-call sequence, and the first two belong to the
 * generic tenant-file upload: ticket → PUT the bytes to storage → adopt the key.
 */
@Injectable({ providedIn: 'root' })
export class ApartmentImportsService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(TenantFilesService);
  private readonly base = `${environment.apiBaseUrl}/apartments/imports`;

  /**
   * Uploads the CSV and opens the import over it, answering the new import's id.
   *
   * The content type is pinned to `text/csv` on both the ticket and the PUT: the
   * server's allowlist for this purpose accepts nothing else, and the browser
   * reports `application/vnd.ms-excel` for a .csv often enough that trusting
   * `file.type` would reject good files.
   */
  createFromFile(file: File): Observable<string> {
    return this.files
      .createUploadUrl({
        purpose: 'ApartmentImport',
        fileName: file.name,
        contentType: IMPORT_CONTENT_TYPE,
      })
      .pipe(
        switchMap((ticket) =>
          this.files
            .upload(ticket.uploadUrl, file, IMPORT_CONTENT_TYPE)
            .pipe(map(() => ticket.key)),
        ),
        switchMap((fileKey) => this.create(fileKey)),
      );
  }

  /**
   * `POST /apartments/imports` → 202. Requires apartments.create AND
   * memberships.manage. Nothing of the file has been read yet: the validation
   * runs in the background and is observed through `getById`.
   */
  create(fileKey: string): Observable<string> {
    return this.http
      .post<ApartmentImportAcceptedDto>(this.base, { fileKey })
      .pipe(map((accepted) => accepted.importId));
  }

  /**
   * `GET /apartments/imports/{id}` — state, live progress and report. A validated
   * import past its 24h deadline reads as `Expired`; an id from another conjunto
   * is a 404.
   */
  getById(id: string): Observable<ApartmentImportDto> {
    return this.http.get<ApartmentImportDto>(`${this.base}/${id}`);
  }

  /**
   * `POST /apartments/imports/{id}/confirm` → 202. Accepted only from
   * `Validated` and only within the TTL; a second confirm is a 409 and
   * duplicates nothing. The apply itself runs in the background.
   */
  confirm(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/confirm`, {});
  }
}
