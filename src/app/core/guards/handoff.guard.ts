import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HandoffStore } from '../handoff/handoff.store';

/**
 * Factory returning a route guard that requires an active, non-expired handoff
 * session scoped to the given purpose (ADR-0017). Redirects to `/acceso`,
 * which — reached with no `t` query param — renders the same "invalid or
 * expired link" state that fits here too: there is no refresh for this token
 * shape, so a missing/expired session always means asking Domi for a new link.
 *
 * Usage in a route: `canActivate: [handoffGuard(HANDOFF_PURPOSE_AMENITY_RESERVATION)]`.
 */
export function handoffGuard(purpose: string): CanActivateFn {
  return () => {
    const store = inject(HandoffStore);
    const router = inject(Router);

    return store.isActive() && store.purpose() === purpose ? true : router.createUrlTree(['/acceso']);
  };
}
