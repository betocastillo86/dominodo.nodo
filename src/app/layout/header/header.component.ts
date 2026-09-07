import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { TenantStore } from '../../core/tenant/tenant.store';
import { VersionCheckService } from '../../core/version/version-check.service';

/**
 * Tabler horizontal header: tenant logo + name (from TenantStore) on the left,
 * user menu (from AuthStore) with logout on the right.
 *
 * The bar keeps Tabler's neutral surface — the theme color shows through the
 * brand icon here and through the active nav underline in the menu below.
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [NgbDropdownModule, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'navbar navbar-expand-md d-print-none',
  },
  templateUrl: './header.component.html',
})
export class HeaderComponent {
  private readonly auth = inject(AuthService);
  readonly authStore = inject(AuthStore);
  readonly tenant = inject(TenantStore);
  readonly versions = inject(VersionCheckService);

  logout(): void {
    this.auth.logout().subscribe();
  }
}
