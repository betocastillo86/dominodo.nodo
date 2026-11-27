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
  // Before `:id`, which would otherwise swallow the literal segment. Listing blocks is
  // `amenities.view` on the API (ADR-0031 §5), not a reservations permission.
  {
    path: 'blocks',
    canActivate: [permissionGuard('amenities.view')],
    loadComponent: () =>
      import('./amenity-block-list/amenity-block-list.component').then(
        (m) => m.AmenityBlockListComponent,
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
