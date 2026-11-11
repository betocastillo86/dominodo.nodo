import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import {
  ACCOUNT_STATEMENT_IMPORT_PERMISSIONS,
  APARTMENTS_CREATE,
  MEMBERSHIPS_MANAGE,
} from './data-access/apartment.permissions';

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
  // Bulk account-statement load (ADR-0025). Two segments, so it cannot be
  // mistaken for ':id', but it sits with its sibling for the same reason.
  // Guards stacked = the AND the portal needs (see ACCOUNT_STATEMENT_IMPORT_PERMISSIONS).
  {
    path: 'account-statements/import',
    canActivate: ACCOUNT_STATEMENT_IMPORT_PERMISSIONS.map((code) => permissionGuard(code)),
    loadComponent: () =>
      import('./account-statement-import/account-statement-import.component').then(
        (m) => m.AccountStatementImportComponent,
      ),
  },
  {
    path: 'account-statements/import/:importId',
    canActivate: ACCOUNT_STATEMENT_IMPORT_PERMISSIONS.map((code) => permissionGuard(code)),
    loadComponent: () =>
      import('./account-statement-import/account-statement-import.component').then(
        (m) => m.AccountStatementImportComponent,
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
