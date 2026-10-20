/**
 * The sections of "Mi Conjunto" as they appear in the URL.
 *
 * They live in their own file rather than in the page component so
 * `tenant-info.routes.ts` can validate the `:section` segment without importing
 * — and therefore eagerly loading — the lazy page.
 */
export const TENANT_INFO_TABS = ['contact', 'theme', 'settings'] as const;

export type TenantInfoTab = (typeof TENANT_INFO_TABS)[number];

/** Where a bare `/tenant-info` lands, and the fallback for an unknown section. */
export const DEFAULT_TENANT_INFO_TAB: TenantInfoTab = 'contact';

export function isTenantInfoTab(value: string | null | undefined): value is TenantInfoTab {
  return !!value && (TENANT_INFO_TABS as readonly string[]).includes(value);
}

/** A single "Mi Conjunto" nav tab, rendered by `TenantInfoNavComponent`. */
export interface MiConjuntoNavTab {
  id: string;
  label: string;
  icon: string;
  /** Route segment(s) after `/tenant-info`. */
  routerLink: readonly string[];
  /** Permission code required to see this tab (omit to skip the check). */
  permission?: string;
  /** Tenant feature key required to see this tab (omit to skip the check). */
  feature?: string;
}

/**
 * Every "Mi Conjunto" tab, in display order. Unlike `TENANT_INFO_TABS` (which
 * only validates the `:section` param of the always-mounted forms), this list
 * also covers `amenities` and `knowledge-resources` — routed sub-features
 * (list/create/edit), not single mounted forms, so they live under their own
 * route branches (`tenant-info.routes.ts`) rather than the `:section` one.
 */
export const MI_CONJUNTO_NAV_TABS: readonly MiConjuntoNavTab[] = [
  { id: 'contact', label: 'Contacto', icon: 'address-book', routerLink: ['contact'] },
  { id: 'theme', label: 'Tema', icon: 'palette', routerLink: ['theme'] },
  { id: 'settings', label: 'Configuración', icon: 'settings', routerLink: ['settings'] },
  {
    id: 'amenities',
    label: 'Áreas sociales',
    icon: 'armchair',
    routerLink: ['amenities'],
    permission: 'amenities.view',
    feature: 'Amenities',
  },
  // No FeatureKey covers knowledge resources server-side, so this tab is gated
  // by permission alone.
  {
    id: 'knowledge-resources',
    label: 'Base de conocimiento',
    icon: 'book',
    routerLink: ['knowledge-resources'],
    permission: 'knowledge.view',
  },
];
