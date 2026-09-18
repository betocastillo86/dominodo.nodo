import { computed, Injectable, signal } from '@angular/core';
import { TenantBranding, TenantProfile } from './tenant.models';

/**
 * Root signal store for the resolved tenant. Written ONLY by the bootstrap step
 * (tenant.bootstrap.ts); read-only to features. The tenant is fixed for the
 * lifetime of the tab — never re-resolved on navigation. See §4.4.
 */
@Injectable({ providedIn: 'root' })
export class TenantStore {
  private readonly _slug = signal<string | null>(null);
  private readonly _tenant = signal<TenantProfile | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly slug = this._slug.asReadonly();
  readonly tenant = this._tenant.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly name = computed(() => this._tenant()?.name ?? null);
  readonly logoUrl = computed(() => this._tenant()?.branding.logoUrl ?? null);
  readonly theme = computed(() => this._tenant()?.branding.theme ?? null);
  readonly loginText = computed(() => this._tenant()?.branding.loginText ?? null);

  /** True when the resolved tenant enables the given feature key. */
  hasFeature(key: string): boolean {
    return this._tenant()?.features.includes(key) ?? false;
  }

  // --- Write API (bootstrap-only) ---

  setSlug(slug: string | null): void {
    this._slug.set(slug);
  }

  setTenant(tenant: TenantProfile | null): void {
    this._tenant.set(tenant);
  }

  setLoading(loading: boolean): void {
    this._loading.set(loading);
  }

  setError(error: boolean): void {
    this._error.set(error);
  }

  /**
   * Refreshes branding after the "Mi Conjunto → Tema" tab saves it, so the
   * header logo and the palette follow without a reload. The only write the
   * bootstrap does not own — everything else about the tenant stays fixed.
   */
  setBranding(branding: TenantBranding): void {
    const tenant = this._tenant();
    if (!tenant) return;
    this._tenant.set({ ...tenant, branding });
  }
}
