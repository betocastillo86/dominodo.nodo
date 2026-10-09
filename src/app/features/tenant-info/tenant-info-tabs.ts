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
