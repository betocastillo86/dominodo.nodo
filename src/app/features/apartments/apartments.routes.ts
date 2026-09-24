import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { APARTMENTS_CREATE, MEMBERSHIPS_MANAGE } from './data-access/apartment.permissions';

export const apartmentsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./apartment-list/apartment-list.component').then((m) => m.ApartmentListComponent),
  },
  // Bulk import. Declared BEFORE ':id' so the literal segment wins the match,
  // and gated by BOTH permissions — the API demands the pair (ADR-0012 §1), and
  // stacking two guards is the same AND the server applies.
  {
    path: 'import',
    canActivate: [permissionGuard(APARTMENTS_CREATE), permissionGuard(MEMBERSHIPS_MANAGE)],
    loadComponent: () =>
      import('./apartment-import/apartment-import.component').then(
        (m) => m.ApartmentImportComponent,
      ),
  },
  {
    path: 'import/:importId',
    canActivate: [permissionGuard(APARTMENTS_CREATE), permissionGuard(MEMBERSHIPS_MANAGE)],
    loadComponent: () =>
      import('./apartment-import/apartment-import.component').then(
        (m) => m.ApartmentImportComponent,
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./apartment-detail/apartment-detail.component').then(
        (m) => m.ApartmentDetailComponent,
      ),
  },
];
