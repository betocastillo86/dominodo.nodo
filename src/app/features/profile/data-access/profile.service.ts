import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CurrentUserResponse } from '../../../core/auth/auth.models';
import { ChangePasswordRequest } from './profile.models';

/**
 * Data-access for "Mi perfil". A single record, not a list — the caller's own
 * profile, resolved from the token (+ `X-Tenant`, attached globally), so
 * neither call takes an id.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  /**
   * Read the caller's own profile, permissions and memberships. Independent
   * from `PermissionService.load()` (which drives authz bootstrap) — this is a
   * plain read for display, with no side effects on the stores.
   */
  getCurrent(): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(`${this.base}/current`);
  }

  /** Change the caller's own password, proving the current one. */
  changePassword(body: ChangePasswordRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/password`, body);
  }
}
