import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { tenantMemberGuard } from './core/guards/tenant-member.guard';
import { tenantResolvedGuard } from './core/guards/tenant-resolved.guard';

export const routes: Routes = [
  // Standalone error pages (no shell, no tenant/auth gating).
  {
    path: 'conjunto-no-encontrado',
    loadComponent: () =>
      import('./features/tenant-error/tenant-not-found.component').then(
        (m) => m.TenantNotFoundComponent,
      ),
  },
  {
    path: 'sin-acceso',
    loadComponent: () =>
      import('./features/no-access/no-access.component').then((m) => m.NoAccessComponent),
  },
  // Public auth area (blank layout). Still gated by a resolved tenant.
  {
    path: 'auth',
    canActivate: [tenantResolvedGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.authRoutes),
  },
  // Authenticated shell. New feature modules register as children here, each
  // with its own `permissionGuard('<code>')`.
  {
    path: '',
    canActivate: [tenantResolvedGuard, authGuard, tenantMemberGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'requests',
        canActivate: [permissionGuard('requests.view')],
        loadChildren: () =>
          import('./features/requests/requests.routes').then((m) => m.requestsRoutes),
      },
      {
        path: 'announcements',
        canActivate: [permissionGuard('announcements.view')],
        loadChildren: () =>
          import('./features/announcements/announcements.routes').then((m) => m.announcementsRoutes),
      },
      { path: '', pathMatch: 'full', redirectTo: 'requests' },
      { path: '**', redirectTo: 'requests' },
    ],
  },
  { path: '**', redirectTo: '' },
];
