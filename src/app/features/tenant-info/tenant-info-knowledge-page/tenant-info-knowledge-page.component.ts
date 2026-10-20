import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { TenantInfoNavComponent } from '../tenant-info-nav/tenant-info-nav.component';

/**
 * Parent of the "Base de conocimiento" tab's own routes (list/new/:id/edit).
 *
 * Same shape as `TenantInfoAmenitiesPageComponent`, and for the same reason:
 * unlike the three form tabs (all mounted together behind the `:section`
 * param), this is a full CRUD sub-feature whose views are genuinely different,
 * so they are real child routes behind a `<router-outlet>`. This wrapper
 * repeats only the "Mi Conjunto" chrome (header + tab bar) so the outlet's
 * content still reads as a tab of the same page.
 */
@Component({
  selector: 'app-tenant-info-knowledge-page',
  standalone: true,
  imports: [RouterOutlet, PageHeaderComponent, TenantInfoNavComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-info-knowledge-page.component.html',
})
export class TenantInfoKnowledgePageComponent {
  private readonly tenant = inject(TenantStore);

  readonly tenantName = this.tenant.tenant()?.name ?? '';
}
