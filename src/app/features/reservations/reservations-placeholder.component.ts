import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TablerIconComponent } from 'angular-tabler-icons';
import { TenantStore } from '../../core/tenant/tenant.store';

/**
 * Landing page for an `amenity-reservation` handoff session (ADR-0017). Blank
 * placeholder until the reservation form ships — its only job today is to
 * confirm the resident made it in, authenticated through their own handoff
 * token, never through the portal's admin session.
 *
 * No shell: reached only via `handoffGuard`, never from the portal's own nav.
 */
@Component({
  selector: 'app-reservations-placeholder',
  standalone: true,
  imports: [TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-center">
      <div class="container container-tight py-4">
        <div class="empty">
          <div class="empty-icon">
            <tabler-icon name="circle-check" class="text-success"></tabler-icon>
          </div>
          <p class="empty-title">¡Listo!</p>
          <p class="empty-subtitle text-secondary">
            Ya iniciaste sesión para reservar un área social en
            {{ tenant.name() ?? 'tu conjunto' }}. Muy pronto podrás elegir el área, la fecha y la
            hora desde aquí.
          </p>
        </div>
      </div>
    </div>
  `,
})
export class ReservationsPlaceholderComponent {
  readonly tenant = inject(TenantStore);
}
