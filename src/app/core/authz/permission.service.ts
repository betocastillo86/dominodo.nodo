import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CurrentUserResponse } from '../auth/auth.models';
import { AuthStore } from '../auth/auth.store';
import { PermissionStore } from './permission.store';

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(PermissionStore);
  private readonly authStore = inject(AuthStore);

  /**
   * Loads the current-user snapshot from `GET /auth/current` (called after login
   * and at startup). It populates:
   *  - effective permission codes → `PermissionStore` (drives nav + guards),
   *  - the caller's Active membership in this tenant → `noMembership` when absent
   *    (`tenantMemberGuard` routes to `/sin-acceso`),
   *  - the profile (name/email/role) → `AuthStore` for the header.
   *
   * The endpoint returns `200` even with no membership (permissions come back
   * empty), so membership is derived from the returned list rather than a `403`.
   * On a genuine failure we fail closed (empty permissions) and log.
   */
  load(): Observable<void> {
    this.store.setLoading(true);
    return this.http.get<CurrentUserResponse>(`${environment.apiBaseUrl}/auth/current`).pipe(
      map((response) => {
        const activeMembership = (response.memberships ?? []).find((m) => m.status === 'Active');
        this.store.setPermissions(response.permissions ?? []);
        this.store.setNoMembership(!activeMembership);
        this.authStore.setProfile({
          name: `${response.user.firstName} ${response.user.lastName}`.trim(),
          email: response.user.email,
          roleName: activeMembership?.roleName ?? null,
        });
        this.finish();
      }),
      catchError((error: HttpErrorResponse) => {
        console.warn(
          `[authz] GET /auth/current failed (status ${error.status}). ` +
            `Falling back to no permissions (fail closed).`,
        );
        this.store.setPermissions([]);
        this.store.setNoMembership(false);
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
