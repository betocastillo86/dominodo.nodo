import { Routes } from '@angular/router';

export const requestsRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./request-list/request-list.component').then((m) => m.RequestListComponent),
  },
];
