import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { handoffGuard } from './core/guards/handoff.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { tenantMemberGuard } from './core/guards/tenant-member.guard';
import { tenantResolvedGuard } from './core/guards/tenant-resolved.guard';
import { landingRedirect } from './core/guards/landing-redirect';
import { HANDOFF_PURPOSE_AMENITY_RESERVATION } from './core/handoff/handoff.models';

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
  // Handoff from Domi (ADR-0017 in `dominodo.api`): redeems a one-time ticket
  // into a purpose-scoped session, isolated from the portal's own AuthStore. No
  // shell — a resident reaching this never has (or needs) a portal account.
  {
    path: 'acceso',
    canActivate: [tenantResolvedGuard],
    loadComponent: () =>
      import('./features/handoff/acceso/acceso.component').then((m) => m.AccesoComponent),
  },
  {
    path: 'reservas',
    canActivate: [tenantResolvedGuard, handoffGuard(HANDOFF_PURPOSE_AMENITY_RESERVATION)],
    loadComponent: () =>
      import('./features/reservations/reservation-availability/reservation-availability.component').then(
        (m) => m.ReservationAvailabilityComponent,
      ),
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
        path: 'dashboard',
        canActivate: [permissionGuard('tenant.info')],
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.dashboardRoutes),
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
          import('./features/announcements/announcements.routes').then(
            (m) => m.announcementsRoutes,
          ),
      },
      {
        path: 'apartments',
        canActivate: [permissionGuard('apartments.view')],
        loadChildren: () =>
          import('./features/apartments/apartments.routes').then((m) => m.apartmentsRoutes),
      },
      // Admin view of amenity bookings — distinct from the standalone `/reservas`
      // route above, which is the RESIDENT handoff booking flow (no shell).
      {
        path: 'reservations',
        canActivate: [permissionGuard('reservations.view')],
        loadChildren: () =>
          import('./features/reservations-admin/reservations-admin.routes').then(
            (m) => m.reservationsAdminRoutes,
          ),
      },
      {
        path: 'knowledge-resources',
        canActivate: [permissionGuard('knowledge.view')],
        loadChildren: () =>
          import('./features/knowledge-resources/knowledge-resources.routes').then(
            (m) => m.knowledgeResourcesRoutes,
          ),
      },
      {
        path: 'tenant-info',
        canActivate: [permissionGuard('tenant.info')],
        loadChildren: () =>
          import('./features/tenant-info/tenant-info.routes').then((m) => m.tenantInfoRoutes),
      },
      // Reached from the header user menu, not the top navbar — no permission
      // guard, since every member may see their own profile.
      {
        path: 'mi-perfil',
        loadChildren: () => import('./features/profile/profile.routes').then((m) => m.profileRoutes),
      },
      // The landing depends on what the user may see: the dashboard for whoever
      // can read the report, PQRS for everyone else. See `landingRedirect`.
      { path: '', pathMatch: 'full', redirectTo: landingRedirect },
      { path: '**', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: '' },
];
