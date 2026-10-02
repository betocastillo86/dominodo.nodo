import { Routes } from '@angular/router';

/** "Mi perfil" feature routes (lazy children of the shell). A single page, no tabs. */
export const profileRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./profile-page/profile-page.component').then((m) => m.ProfilePageComponent),
  },
];
