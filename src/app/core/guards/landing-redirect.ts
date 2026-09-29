import { inject } from '@angular/core';
import { RedirectFunction } from '@angular/router';
import { PermissionStore } from '../authz/permission.store';

/**
 * Where a user lands on `/`. The dashboard is the natural home for whoever runs
 * the conjunto, but `GET /requests/report` is gated by `tenant.info`, so sending
 * everyone there would greet a portero with a 403 right after logging in.
 *
 * Both permission checks fall back to PQRS, which is also where an account with
 * neither permission ends up on the "sin acceso" page — the behaviour this route
 * had before the dashboard existed.
 *
 * Used as a `redirectTo` function rather than a guard because a route that only
 * ever redirects has nothing to render.
 */
export const landingRedirect: RedirectFunction = () => {
  const permissions = inject(PermissionStore);

  // `authBootstrap` resolves before the router activates, so `loaded()` is
  // normally true here; the guard against it is for the degraded case where the
  // snapshot failed and the safest landing is the less privileged one.
  return permissions.loaded() && permissions.has('tenant.info') ? '/dashboard' : '/requests';
};
