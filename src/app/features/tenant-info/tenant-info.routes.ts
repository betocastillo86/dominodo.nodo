import { Routes } from '@angular/router';

/** "Mi Conjunto" feature routes (lazy children of the shell). A single page. */
export const tenantInfoRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./tenant-info-form/tenant-info-form.component').then((m) => m.TenantInfoFormComponent),
  },
];
