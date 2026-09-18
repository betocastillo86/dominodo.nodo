import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { resolveTenantSlug } from './tenant-resolver';
import { applyPrimaryColor, applyTenantTheme } from './tenant-theme';
import { TenantProfile } from './tenant.models';
import { TenantService } from './tenant.service';
import { TenantStore } from './tenant.store';

/** Statuses that are valid to run the app against. */
const VALID_STATUSES = ['Active'];

/**
 * App initializer step (registered via `provideAppInitializer`). Runs BEFORE
 * routes render: resolve slug → set store → load profile → apply branding.
 * On failure (unresolvable slug, unknown tenant, invalid status) sets
 * `TenantStore.error`, which routing consumes to show the not-found page.
 * See docs/architecture.md §4.3.
 */
export function tenantBootstrap(): () => Promise<void> {
  return async () => {
    const store = inject(TenantStore);
    const service = inject(TenantService);

    const slug = resolveTenantSlug();
    if (!slug) {
      console.warn('[tenant] Could not resolve a tenant slug from the host.');
      store.setError(true);
      return;
    }

    store.setSlug(slug);
    store.setLoading(true);

    try {
      const profile = await firstValueFrom(service.getCurrent(slug));
      if (!VALID_STATUSES.includes(profile.status)) {
        store.setError(true);
        return;
      }
      store.setTenant(profile);
      applyBranding(profile);
    } catch {
      // 400 Tenant.Unknown (or any load failure the service re-threw) → not-found.
      store.setError(true);
    } finally {
      store.setLoading(false);
    }
  };
}

/** Apply tenant branding to the document: title, favicon, theme palette. */
function applyBranding(profile: TenantProfile): void {
  document.title = profile.name;

  if (profile.branding.theme) {
    applyTenantTheme(profile.branding.theme);
  } else if (profile.branding.primaryColor) {
    // Legacy path: no theme saved yet, only the fallback primary color. It goes
    // through the same helper so the branded top bar still gets a readable
    // foreground instead of Tabler's default white.
    applyPrimaryColor(profile.branding.primaryColor);
  }

  if (profile.branding.logoUrl) {
    setFavicon(profile.branding.logoUrl);
  }
}

function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}
