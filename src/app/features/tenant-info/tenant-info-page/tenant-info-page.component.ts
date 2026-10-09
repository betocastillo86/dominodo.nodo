import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { TenantBrandingFormComponent } from '../tenant-branding-form/tenant-branding-form.component';
import { TenantContactFormComponent } from '../tenant-contact-form/tenant-contact-form.component';
import { TenantSettingsFormComponent } from '../tenant-settings-form/tenant-settings-form.component';
import { DEFAULT_TENANT_INFO_TAB, isTenantInfoTab, TenantInfoTab } from '../tenant-info-tabs';

interface TenantInfoTabLink {
  readonly id: TenantInfoTab;
  readonly label: string;
  readonly icon: string;
}

/**
 * "Mi Conjunto" shell: page header plus the self-service surfaces the API
 * exposes for the tenant resolved from `X-Tenant` — contact details and module
 * settings (both blocks of `/tenants/info`) and branding
 * (`/tenants/branding`).
 *
 * The visible tab comes from the `:section` route param, so every tab is a real
 * URL. All tabs stay mounted and the inactive ones are hidden, which is why the
 * section is a param and not three sibling routes (see `tenant-info.routes.ts`):
 * switching tabs never discards unsaved edits nor re-fetches. Each child owns
 * its own load/save; the two that share `/tenants/info` coordinate through
 * `TenantInfoService`, which issues one GET and keeps one snapshot.
 */
@Component({
  selector: 'app-tenant-info-page',
  standalone: true,
  imports: [
    RouterLink,
    TablerIconComponent,
    PageHeaderComponent,
    TenantContactFormComponent,
    TenantBrandingFormComponent,
    TenantSettingsFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-info-page.component.html',
})
export class TenantInfoPageComponent {
  private readonly tenant = inject(TenantStore);
  private readonly route = inject(ActivatedRoute);

  /** Shown as the page pretitle so the admin sees which conjunto they are editing. */
  readonly tenantName = this.tenant.tenant()?.name ?? '';

  readonly tabs: readonly TenantInfoTabLink[] = [
    { id: 'contact', label: 'Contacto', icon: 'address-book' },
    { id: 'theme', label: 'Tema', icon: 'palette' },
    { id: 'settings', label: 'Configuración', icon: 'settings' },
  ];

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** The URL is the single source of truth for which tab is showing. */
  readonly activeTab = computed<TenantInfoTab>(() => {
    const section = this.params().get('section');
    // `knownSectionGuard` already rejected anything else; this only narrows the type.
    return isTenantInfoTab(section) ? section : DEFAULT_TENANT_INFO_TAB;
  });
}
