import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { PermissionStore } from '../../core/authz/permission.store';
import { TenantStore } from '../../core/tenant/tenant.store';

/**
 * A single top-level navigation entry. A nav item renders only when BOTH its
 * `permission` is granted (PermissionStore) AND its `feature` is enabled
 * (TenantStore). Either gate may be omitted to skip that check.
 */
export interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Permission code required to see this item (PermissionStore.has). */
  permission?: string;
  /** Tenant feature key required to see this item (TenantStore.hasFeature). */
  feature?: string;
}

/**
 * Tabler horizontal navigation menu. Ships EMPTY — no feature modules exist yet.
 * When the first module lands, add its entry to `navItems` below, e.g.:
 *
 *   { label: 'PQRS', path: '/requests', icon: 'list-details',
 *     permission: 'requests.view', feature: 'Requests' },
 *
 * and register `IconListDetails` in app.config.ts. The template renders nothing
 * gracefully while the list is empty.
 */
@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'navbar-expand-md',
  },
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  private readonly permissions = inject(PermissionStore);
  private readonly tenant = inject(TenantStore);

  /** Add the first module's entry here (see class doc). */
  private readonly navItems = signal<readonly NavItem[]>([
    {
      label: 'Anuncios',
      path: '/announcements',
      icon: 'speakerphone',
      permission: 'announcements.view',
      feature: 'Announcements',
    },
  ]);

  /** Items the current user + tenant are allowed to see. */
  readonly visibleItems = computed(() =>
    this.navItems().filter(
      (item) =>
        (!item.permission || this.permissions.has(item.permission)) &&
        (!item.feature || this.tenant.hasFeature(item.feature)),
    ),
  );
}
