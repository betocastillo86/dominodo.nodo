import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionService } from '../authz/permission.service';
import { PermissionStore } from '../authz/permission.store';
import { AuthTokens, LoginRequest } from './auth.models';
import { AuthStore } from './auth.store';

/** Handles the authentication lifecycle against `/auth/*`. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);
  private readonly permissions = inject(PermissionService);
  private readonly permissionStore = inject(PermissionStore);
  private readonly router = inject(Router);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  /**
   * Authenticate by phone + password. The JWT is tenant-agnostic and carries no
   * permissions — there is NO role gate here. After establishing the session,
   * load the effective permissions for this tenant (drives nav + guards).
   */
  login(credentials: LoginRequest): Observable<void> {
    return this.http.post<AuthTokens>(`${this.base}/login`, credentials).pipe(
      tap((tokens) => this.store.setSession(tokens)),
      switchMap(() => this.permissions.load()),
    );
  }

  /** Exchange the refresh token for a fresh token set (rotates the refresh token). */
  refresh(): Observable<AuthTokens> {
    const token = this.store.refreshToken();
    if (!token) {
      return throwError(() => new Error('No hay refresh token disponible'));
    }
    return this.http
      .post<AuthTokens>(`${this.base}/refresh`, { token })
      .pipe(tap((tokens) => this.store.setSession(tokens)));
  }

  /** Best-effort server logout, then clear the session and go to `/auth`. */
  logout(): Observable<void> {
    const token = this.store.refreshToken();
    return this.http.post<void>(`${this.base}/logout`, { token }).pipe(
      catchError(() => of(void 0)),
      tap(() => {
        this.store.clear();
        this.permissionStore.clear();
        void this.router.navigate(['/auth']);
      }),
      map(() => void 0),
    );
  }
}
