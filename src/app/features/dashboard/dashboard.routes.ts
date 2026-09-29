import { Routes } from '@angular/router';

export const dashboardRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard-page/dashboard-page.component').then((m) => m.DashboardPageComponent),
  },
];
