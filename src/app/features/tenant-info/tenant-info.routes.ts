import { Routes } from '@angular/router';

/** "Mi Conjunto" feature routes (lazy children of the shell). A single page with tabs. */
export const tenantInfoRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./tenant-info-page/tenant-info-page.component').then((m) => m.TenantInfoPageComponent),
  },
];
