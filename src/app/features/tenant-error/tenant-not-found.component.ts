import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Standalone "conjunto no encontrado" page — shown (no shell) when the tenant
 * slug is unresolvable, unknown/suspended, or the profile status is invalid.
 * See docs/architecture.md §4.3.
 */
@Component({
  selector: 'app-tenant-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-center">
      <div class="container container-tight py-4">
        <div class="empty">
          <div class="empty-header">404</div>
          <p class="empty-title">Conjunto no encontrado</p>
          <p class="empty-subtitle text-secondary">
            No pudimos identificar el conjunto residencial para esta dirección. Verifica el enlace o
            contacta al administrador de tu comunidad.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class TenantNotFoundComponent {}
