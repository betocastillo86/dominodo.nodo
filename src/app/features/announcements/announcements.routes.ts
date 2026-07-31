import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { ANNOUNCEMENTS_CREATE } from './data-access/announcement.permissions';

/** Announcements feature routes (lazy children of the shell). */
export const announcementsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./announcement-list/announcement-list.component').then(
        (m) => m.AnnouncementListComponent,
      ),
  },
  {
    path: 'new',
    canActivate: [permissionGuard(ANNOUNCEMENTS_CREATE)],
    loadComponent: () =>
      import('./announcement-create/announcement-create.component').then(
        (m) => m.AnnouncementCreateComponent,
      ),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./announcement-edit/announcement-edit.component').then(
        (m) => m.AnnouncementEditComponent,
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./announcement-detail/announcement-detail.component').then(
        (m) => m.AnnouncementDetailComponent,
      ),
  },
];
