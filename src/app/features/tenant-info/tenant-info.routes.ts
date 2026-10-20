import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { AMENITIES_CREATE, AMENITIES_VIEW } from './amenities/data-access/amenity.permissions';
import {
  KNOWLEDGE_EDIT,
  KNOWLEDGE_VIEW,
} from './knowledge-resources/data-access/knowledge-resource.permissions';
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
  // Áreas sociales: a routed CRUD sub-feature, not a `:section` form — see
  // `TenantInfoAmenitiesPageComponent`'s doc comment for why it branches here
  // instead of joining the param below.
  {
    path: 'amenities',
    canActivate: [permissionGuard(AMENITIES_VIEW)],
    loadComponent: () =>
      import('./tenant-info-amenities-page/tenant-info-amenities-page.component').then(
        (m) => m.TenantInfoAmenitiesPageComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./amenities/amenity-list/amenity-list.component').then(
            (m) => m.AmenityListComponent,
          ),
      },
      {
        path: 'new',
        canActivate: [permissionGuard(AMENITIES_CREATE)],
        loadComponent: () =>
          import('./amenities/amenity-form/amenity-form.component').then(
            (m) => m.AmenityFormComponent,
          ),
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./amenities/amenity-form/amenity-form.component').then(
            (m) => m.AmenityFormComponent,
          ),
      },
    ],
  },
  // Base de conocimiento: the other routed CRUD sub-feature, same shape as
  // Áreas sociales above — see `TenantInfoKnowledgePageComponent`.
  {
    path: 'knowledge-resources',
    canActivate: [permissionGuard(KNOWLEDGE_VIEW)],
    loadComponent: () =>
      import('./tenant-info-knowledge-page/tenant-info-knowledge-page.component').then(
        (m) => m.TenantInfoKnowledgePageComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import(
            './knowledge-resources/knowledge-resource-list/knowledge-resource-list.component'
          ).then((m) => m.KnowledgeResourceListComponent),
      },
      {
        path: 'new',
        canActivate: [permissionGuard(KNOWLEDGE_EDIT)],
        loadComponent: () =>
          import(
            './knowledge-resources/knowledge-resource-create/knowledge-resource-create.component'
          ).then((m) => m.KnowledgeResourceCreateComponent),
      },
      {
        path: ':id/edit',
        canActivate: [permissionGuard(KNOWLEDGE_EDIT)],
        loadComponent: () =>
          import(
            './knowledge-resources/knowledge-resource-edit/knowledge-resource-edit.component'
          ).then((m) => m.KnowledgeResourceEditComponent),
      },
    ],
  },
  {
    path: ':section',
    canActivate: [knownSectionGuard],
    loadComponent: () =>
      import('./tenant-info-page/tenant-info-page.component').then(
        (m) => m.TenantInfoPageComponent,
      ),
  },
];
