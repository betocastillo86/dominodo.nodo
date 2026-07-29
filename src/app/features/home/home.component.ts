import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TenantStore } from '../../core/tenant/tenant.store';
import { PageHeaderComponent } from '../../shared/ui/page-header/page-header.component';

/**
 * Placeholder landing shown as the shell's default route until feature modules
 * (PQRS, Announcements) are added.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [title]="'Inicio'" [pretitle]="tenant.name() ?? 'Dominodo'" />
    <div class="card">
      <div class="card-body">
        <h3 class="card-title">Bienvenido a {{ tenant.name() ?? 'la administración de tu conjunto' }}</h3>
        <p class="text-secondary mb-0">
          Desde aquí administrarás tu comunidad. Los módulos de PQRS y anuncios aparecerán en el menú
          superior una vez habilitados.
        </p>
      </div>
    </div>
  `,
})
export class HomeComponent {
  readonly tenant = inject(TenantStore);
}
