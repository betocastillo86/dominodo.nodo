import { Routes } from '@angular/router';

export const apartmentsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./apartment-list/apartment-list.component').then((m) => m.ApartmentListComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./apartment-detail/apartment-detail.component').then(
        (m) => m.ApartmentDetailComponent,
      ),
  },
];
