import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionStore } from './permission.store';

/** Shape of `GET /me/permissions` (see docs/architecture.md §3.1). */
interface PermissionsResponse {
  permissions: string[];
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(PermissionStore);

  /**
   * Loads effective permissions after login. On `403` sets `noMembership`
   * (→ tenantMemberGuard fails). If the endpoint is absent (404/network) — not
   * implemented in the API yet — falls back to an empty, LOADED set (guards
   * permissive until wired) and logs a TODO.
   */
  load(): Observable<void> {
    this.store.setLoading(true);
    return this.http.get<PermissionsResponse>(`${environment.apiBaseUrl}/me/permissions`).pipe(
      map((response) => {
        this.store.setPermissions(response.permissions ?? []);
        this.store.setNoMembership(false);
        this.finish();
      }),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 403) {
          this.store.setPermissions([]);
          this.store.setNoMembership(true);
        } else {
          console.warn(
            `[authz] GET /me/permissions unavailable (status ${error.status}). ` +
              `Falling back to permissive empty permissions. TODO: remove once the API ships the endpoint.`,
          );
          this.store.setPermissions([]);
          this.store.setNoMembership(false);
        }
        this.finish();
        return of(void 0);
      }),
    );
  }

  private finish(): void {
    this.store.setLoaded(true);
    this.store.setLoading(false);
  }
}
