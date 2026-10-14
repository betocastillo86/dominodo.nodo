import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { PermissionStore } from '../../../core/authz/permission.store';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { MiConjuntoNavTab, MI_CONJUNTO_NAV_TABS } from '../tenant-info-tabs';

/**
 * "Mi Conjunto" tab bar, shared by the always-mounted-forms page
 * (`TenantInfoPageComponent`) and the routed sub-features (e.g. Áreas
 * sociales), so both look like tabs of the same page. `routerLinkActive`
 * (non-exact) highlights `amenities` for its `new`/`:id/edit` sub-routes too.
 */
@Component({
  selector: 'app-tenant-info-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-info-nav.component.html',
})
export class TenantInfoNavComponent {
  private readonly permissions = inject(PermissionStore);
  private readonly tenant = inject(TenantStore);

  readonly visibleTabs = computed(() =>
    MI_CONJUNTO_NAV_TABS.filter(
      (tab) =>
        (!tab.permission || this.permissions.has(tab.permission)) &&
        (!tab.feature || this.tenant.hasFeature(tab.feature)),
    ),
  );

  /** Angular template expressions cannot spread an array, hence this helper. */
  fullLink(tab: MiConjuntoNavTab): string[] {
    return ['/tenant-info', ...tab.routerLink];
  }
}
