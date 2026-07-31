import { computed, inject, Injectable, signal } from '@angular/core';
import { AuthTokens, AuthUser } from './auth.models';
import { decodeToken, extractRoles, isExpired, normalizeRoles } from './jwt.util';
import { TokenStorageService } from './token-storage.service';

/**
 * Signal-based session state. Rehydrates from storage on construction and is
 * the single source of truth for authentication across the app. This portal
 * has NO SuperAdmin gate — access is decided by tenant membership + permissions
 * (see authz/), not by a JWT role.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly storage = inject(TokenStorageService);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _refreshToken = signal<string | null>(null);
  private readonly _user = signal<AuthUser | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();
  readonly user = this._user.asReadonly();

  readonly isAuthenticated = computed(() => this._accessToken() !== null);

  constructor() {
    this.rehydrate();
  }

  /** Store a fresh token set and derive the current user from its claims. */
  setSession(tokens: AuthTokens): void {
    const claims = decodeToken(tokens.accessToken);
    this._accessToken.set(tokens.accessToken);
    this._refreshToken.set(tokens.refreshToken);
    this._user.set(claims ? { id: claims.sub, roles: normalizeRoles(extractRoles(claims)) } : null);
    this.storage.save(tokens);
  }

  /** Enrich the current user with the profile from `GET /auth/current`. */
  setProfile(profile: { name: string; email: string | null; roleName: string | null }): void {
    this._user.update((user) => (user ? { ...user, ...profile } : user));
  }

  /** Wipe the in-memory session and persisted tokens. */
  clear(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this._user.set(null);
    this.storage.clear();
  }

  private rehydrate(): void {
    const tokens = this.storage.read();
    if (!tokens) {
      return;
    }
    const claims = decodeToken(tokens.accessToken);
    // Drop invalid or already-expired sessions on startup.
    if (!claims || isExpired(claims)) {
      this.storage.clear();
      return;
    }
    this._accessToken.set(tokens.accessToken);
    this._refreshToken.set(tokens.refreshToken);
    this._user.set({ id: claims.sub, roles: normalizeRoles(extractRoles(claims)) });
  }
}
