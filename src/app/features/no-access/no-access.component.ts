import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * "Sin acceso a este conjunto" page — shown when the authenticated user has no
 * membership in the resolved tenant (permissions load returned 403).
 */
@Component({
  selector: 'app-no-access',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-center">
      <div class="container container-tight py-4">
        <div class="empty">
          <div class="empty-header">403</div>
          <p class="empty-title">Sin acceso a este conjunto</p>
          <p class="empty-subtitle text-secondary">
            Tu cuenta no tiene acceso a la administración de este conjunto residencial. Si crees que
            es un error, contacta al administrador de tu comunidad.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class NoAccessComponent {}
