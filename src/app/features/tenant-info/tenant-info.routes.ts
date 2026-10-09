import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { DEFAULT_TENANT_INFO_TAB, isTenantInfoTab } from './tenant-info-tabs';

/**
 * Keeps the URL honest: without this an unknown section would quietly render
 * the default tab under a path that does not describe it.
 */
const knownSectionGuard: CanActivateFn = (route) =>
  isTenantInfoTab(route.paramMap.get('section')) ||
  inject(Router).createUrlTree(['/tenant-info', DEFAULT_TENANT_INFO_TAB]);

/**
 * "Mi Conjunto" feature routes (lazy children of the shell). One page, but each
 * tab owns a URL so it can be linked, reloaded and reached with the browser's
 * back button.
 *
 * The section travels as a ROUTE PARAM instead of as three sibling routes on
 * purpose: Angular reuses the component when only a param changes, so all tabs
 * stay mounted and an unsaved draft survives a jump to another tab — the
 * behaviour the page had before it became routable. Three sibling routes would
 * destroy and rebuild the page on every tab click.
 */
export const tenantInfoRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: DEFAULT_TENANT_INFO_TAB },
  {
    path: ':section',
    canActivate: [knownSectionGuard],
    loadComponent: () =>
      import('./tenant-info-page/tenant-info-page.component').then(
        (m) => m.TenantInfoPageComponent,
      ),
  },
];
