import { Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';

/** Knowledge Resources feature routes (lazy children of the shell). */
export const knowledgeResourcesRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./knowledge-resource-list/knowledge-resource-list.component').then(
        (m) => m.KnowledgeResourceListComponent,
      ),
  },
  {
    path: 'new',
    canActivate: [permissionGuard('knowledge.edit')],
    loadComponent: () =>
      import('./knowledge-resource-create/knowledge-resource-create.component').then(
        (m) => m.KnowledgeResourceCreateComponent,
      ),
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard('knowledge.edit')],
    loadComponent: () =>
      import('./knowledge-resource-edit/knowledge-resource-edit.component').then(
        (m) => m.KnowledgeResourceEditComponent,
      ),
  },
];
