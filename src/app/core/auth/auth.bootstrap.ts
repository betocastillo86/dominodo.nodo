import { inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PermissionService } from '../authz/permission.service';
import { AuthStore } from './auth.store';

/**
 * App initializer step (registered via `provideAppInitializer`, AFTER the tenant
 * bootstrap so the tenant slug — and thus `X-Tenant` — is already set). When a
 * session was rehydrated from storage, it loads the current-user snapshot from
 * `GET /auth/current` so permissions, membership and profile survive a hard
 * refresh (otherwise the nav would render empty and guards would block).
 */
export function authBootstrap(): () => Promise<void> {
  return async () => {
    const auth = inject(AuthStore);
    const permissions = inject(PermissionService);

    if (!auth.isAuthenticated()) {
      return;
    }

    // Never let an auth-snapshot failure block app startup; PermissionService
    // already fails closed and logs.
    await firstValueFrom(permissions.load()).catch(() => undefined);
  };
}
