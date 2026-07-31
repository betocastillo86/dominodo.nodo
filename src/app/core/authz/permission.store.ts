import { computed, Injectable, signal } from '@angular/core';

/**
 * Root store of the effective permissions for (current user, resolved tenant),
 * loaded from `GET /auth/current` after login and at startup. Drives nav
 * visibility and route guards. The server is authoritative on every write; this
 * only shapes UI.
 */
@Injectable({ providedIn: 'root' })
export class PermissionStore {
  private readonly _permissions = signal<string[]>([]);
  private readonly _loading = signal(false);
  private readonly _loaded = signal(false);
  /** Set when the caller has no Active membership in this tenant. */
  private readonly _noMembership = signal(false);

  readonly permissions = this._permissions.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly noMembership = this._noMembership.asReadonly();

  readonly count = computed(() => this._permissions().length);

  /** True when the given permission code is present in the effective set. */
  has(code: string): boolean {
    return this._permissions().includes(code);
  }

  // --- Write API (PermissionService-only) ---

  setPermissions(permissions: string[]): void {
    this._permissions.set(permissions);
  }

  setLoading(loading: boolean): void {
    this._loading.set(loading);
  }

  setLoaded(loaded: boolean): void {
    this._loaded.set(loaded);
  }

  setNoMembership(noMembership: boolean): void {
    this._noMembership.set(noMembership);
  }

  /** Reset on logout. */
  clear(): void {
    this._permissions.set([]);
    this._loaded.set(false);
    this._loading.set(false);
    this._noMembership.set(false);
  }
}
