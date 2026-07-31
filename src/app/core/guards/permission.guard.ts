import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionStore } from '../authz/permission.store';

/**
 * Factory returning a route guard that requires the given permission code.
 * Permissive only during the brief window before `GET /auth/current` has loaded
 * (so a hard refresh doesn't flash the no-access page); once loaded, a missing
 * permission redirects to the "sin acceso" page.
 *
 * Usage in a route: `canActivate: [permissionGuard('requests.view')]`.
 */
export function permissionGuard(code: string): CanActivateFn {
  return () => {
    const store = inject(PermissionStore);
    const router = inject(Router);

    // Not loaded yet → permissive until the current-user snapshot resolves.
    if (!store.loaded()) {
      return true;
    }

    return store.has(code) ? true : router.createUrlTree(['/sin-acceso']);
  };
}
