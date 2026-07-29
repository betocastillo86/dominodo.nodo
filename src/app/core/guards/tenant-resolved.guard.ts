import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TenantStore } from '../tenant/tenant.store';

/**
 * Blocks the app when the tenant could not be resolved/validated at bootstrap
 * (unresolvable slug, unknown/suspended tenant, invalid status) and redirects
 * to the standalone "conjunto no encontrado" page. See docs/architecture.md §4.3.
 */
export const tenantResolvedGuard: CanActivateFn = () => {
  const store = inject(TenantStore);
  const router = inject(Router);

  return store.error() ? router.createUrlTree(['/conjunto-no-encontrado']) : true;
};
