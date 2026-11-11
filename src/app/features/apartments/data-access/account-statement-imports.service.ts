import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, switchMap } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TenantFilesService } from '../../../core/files/tenant-files.service';
import {
  ACCOUNT_STATEMENT_CONTENT_TYPE,
  AccountStatementImportAcceptedDto,
  AccountStatementImportDto,
} from './account-statement-import.models';

/**
 * Data-access for the bulk account-statement load (API ADR-0025). Same shape as
 * `ApartmentImportsService`: no list state (the API has no listing of loads),
 * the component owns the polling, and opening a load is ticket → PUT → adopt.
 * All three load endpoints require `apartments.edit`.
 */
@Injectable({ providedIn: 'root' })
export class AccountStatementImportsService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(TenantFilesService);
  private readonly base = `${environment.apiBaseUrl}/apartments/account-statement-imports`;

  /** Uploads the CSV (pinned to `text/csv`, see the apartment import) and opens the load over it. */
  createFromFile(file: File): Observable<string> {
    return this.files
      .createUploadUrl({
        purpose: 'AccountStatementImport',
        fileName: file.name,
        contentType: ACCOUNT_STATEMENT_CONTENT_TYPE,
      })
      .pipe(
        switchMap((ticket) =>
          this.files
            .upload(ticket.uploadUrl, file, ACCOUNT_STATEMENT_CONTENT_TYPE)
            .pipe(map(() => ticket.key)),
        ),
        switchMap((fileKey) => this.create(fileKey)),
      );
  }

  /** `POST /apartments/account-statement-imports` → 202. Validation runs in the background. */
  create(fileKey: string): Observable<string> {
    return this.http
      .post<AccountStatementImportAcceptedDto>(this.base, { fileKey })
      .pipe(map((accepted) => accepted.importId));
  }

  /** `GET …/{id}` — state, live progress and report. An id from another conjunto is a 404. */
  getById(id: string): Observable<AccountStatementImportDto> {
    return this.http.get<AccountStatementImportDto>(`${this.base}/${id}`);
  }

  /**
   * `POST …/{id}/confirm` → 202. Only from `Validated` and within the TTL; a
   * second confirm is a 409. The apply is ONE transaction, run in the background.
   */
  confirm(id: string): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/confirm`, {});
  }
}
