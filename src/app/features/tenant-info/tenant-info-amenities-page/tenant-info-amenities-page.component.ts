import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { TenantInfoNavComponent } from '../tenant-info-nav/tenant-info-nav.component';

/**
 * Parent of the "Áreas sociales" tab's own routes (list/new/:id/edit).
 *
 * Unlike the other three tabs (one form each, all mounted together behind the
 * `:section` param — see `tenant-info.routes.ts`), Amenities is a full CRUD
 * sub-feature: list → create/edit are genuinely different views, so they are
 * real child routes behind a `<router-outlet>`, not a draft worth preserving
 * across a tab switch. This wrapper repeats only the "Mi Conjunto" chrome
 * (header + tab bar) so the outlet's content still reads as a tab of the same
 * page.
 */
@Component({
  selector: 'app-tenant-info-amenities-page',
  standalone: true,
  imports: [RouterOutlet, PageHeaderComponent, TenantInfoNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-info-amenities-page.component.html',
})
export class TenantInfoAmenitiesPageComponent {
  private readonly tenant = inject(TenantStore);

  readonly tenantName = this.tenant.tenant()?.name ?? '';
}
