import { Routes } from '@angular/router';

export const reservationsAdminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reservation-admin-list/reservation-admin-list.component').then(
        (m) => m.ReservationAdminListComponent,
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./reservation-admin-detail/reservation-admin-detail.component').then(
        (m) => m.ReservationAdminDetailComponent,
      ),
  },
];
