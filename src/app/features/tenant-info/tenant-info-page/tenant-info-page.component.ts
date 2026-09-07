import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TablerIconComponent } from 'angular-tabler-icons';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { TenantBrandingFormComponent } from '../tenant-branding-form/tenant-branding-form.component';
import { TenantInfoFormComponent } from '../tenant-info-form/tenant-info-form.component';

type TenantInfoTab = 'contact' | 'branding';

/**
 * "Mi Conjunto" shell: page header plus the two self-service surfaces the API
 * exposes for the tenant resolved from `X-Tenant` — contact info
 * (`/tenants/info`) and branding (`/tenants/branding`).
 *
 * Both tabs stay mounted and the inactive one is hidden, so switching tabs never
 * discards unsaved edits nor re-fetches. Each child owns its own load/save.
 */
@Component({
  selector: 'app-tenant-info-page',
  standalone: true,
  imports: [
    TablerIconComponent,
    PageHeaderComponent,
    TenantInfoFormComponent,
    TenantBrandingFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-info-page.component.html',
})
export class TenantInfoPageComponent {
  private readonly tenant = inject(TenantStore);

  /** Shown as the page pretitle so the admin sees which conjunto they are editing. */
  readonly tenantName = this.tenant.tenant()?.name ?? '';

  readonly activeTab = signal<TenantInfoTab>('contact');
}
