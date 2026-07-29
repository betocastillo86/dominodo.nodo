import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionStore } from '../authz/permission.store';

/**
 * Passes unless the permissions load returned 403 (no membership in this
 * tenant), in which case it redirects to the "sin acceso" page.
 */
export const tenantMemberGuard: CanActivateFn = () => {
  const store = inject(PermissionStore);
  const router = inject(Router);

  return store.noMembership() ? router.createUrlTree(['/sin-acceso']) : true;
};
