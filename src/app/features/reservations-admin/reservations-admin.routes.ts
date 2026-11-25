import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

export const reservationsAdminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reservation-admin-list/reservation-admin-list.component').then(
        (m) => m.ReservationAdminListComponent,
      ),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('reservations.create')],
    loadComponent: () =>
      import('./reservation-admin-create/reservation-admin-create.component').then(
        (m) => m.ReservationAdminCreateComponent,
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
