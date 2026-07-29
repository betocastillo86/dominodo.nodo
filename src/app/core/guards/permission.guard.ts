import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionStore } from '../authz/permission.store';

/**
 * Factory returning a route guard that requires the given permission code.
 * Permissive when permissions are not yet `loaded` (fallback stance) so the app
 * remains usable before the `/me/permissions` endpoint exists. Once loaded, a
 * missing permission redirects to the "sin acceso" page.
 *
 * Usage in a route: `canActivate: [permissionGuard('requests.view')]`.
 */
export function permissionGuard(code: string): CanActivateFn {
  return () => {
    const store = inject(PermissionStore);
    const router = inject(Router);

    // Not loaded (or fallback with empty set) → permissive until wired.
    if (!store.loaded()) {
      return true;
    }

    return store.has(code) ? true : router.createUrlTree(['/sin-acceso']);
  };
}
