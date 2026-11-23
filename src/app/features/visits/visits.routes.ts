import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { VISITS_CREATE } from './data-access/visit.permissions';

export const visitsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./visit-list/visit-list.component').then((m) => m.VisitListComponent),
  },
  {
    path: 'new',
    canActivate: [permissionGuard(VISITS_CREATE)],
    loadComponent: () =>
      import('./visit-create/visit-create.component').then((m) => m.VisitCreateComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./visit-detail/visit-detail.component').then((m) => m.VisitDetailComponent),
  },
];
