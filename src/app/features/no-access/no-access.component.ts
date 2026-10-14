import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TablerIconComponent } from 'angular-tabler-icons';
import { AuthService } from '../../core/auth/auth.service';

/**
 * "Sin acceso a este conjunto" page — shown when the authenticated user has no
 * membership in the resolved tenant (permissions load returned 403).
 *
 * Offers a logout action: this page sits outside the shell, so without it a
 * user signed in with the wrong account would be stuck here with no way back
 * to the login screen.
 */
@Component({
  selector: 'app-no-access',
  standalone: true,
  imports: [TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page page-center">
      <div class="container container-tight py-4">
        <div class="empty">
          <div class="empty-header">403</div>
          <p class="empty-title">Sin acceso a este conjunto</p>
          <p class="empty-subtitle text-secondary">
            Tu cuenta no tiene acceso a la administración de este conjunto residencial. Si crees que
            es un error, contacta al administrador de tu comunidad o inicia sesión con otra cuenta.
          </p>
          <div class="empty-action">
            <button
              type="button"
              class="btn btn-primary"
              [disabled]="pending()"
              (click)="logout()"
            >
              <tabler-icon name="logout" class="me-2" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NoAccessComponent {
  private readonly auth = inject(AuthService);

  readonly pending = signal(false);

  logout(): void {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.auth.logout().subscribe({
      error: () => this.pending.set(false),
    });
  }
}
