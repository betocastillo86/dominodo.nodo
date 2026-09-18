import { TenantThemeValue } from '../../../core/tenant/tenant-theme';

/**
 * Response of `GET /tenants/branding`. Note the deliberate asymmetry with the
 * write side: reads expose a resolved `logoUrl`, writes take a `logoKey` —
 * storage keys are internal, URLs are the public contract (ADR-0007 §3).
 */
export interface BrandingDto {
  /** `TenantTheme` name, e.g. "Blue". Never null: the API defaults to "Blue". */
  theme: string;
  logoUrl: string | null;
}

/**
 * Body of `PUT /tenants/branding`. `logoKey` covers the three cases with no
 * tri-state: re-sending the current key KEEPS the logo, a different valid key
 * REPLACES it, `null` REMOVES it.
 */
export interface UpdateTenantBrandingRequest {
  theme: TenantThemeValue;
  logoKey: string | null;
}

/** The only file purpose the Tenants module publishes today. */
export type TenantFilePurpose = 'BrandingLogo';

/** Body of `POST /tenants/files/upload-url`. */
export interface CreateTenantFileUploadUrlRequest {
  purpose: TenantFilePurpose;
  fileName: string;
  contentType: string;
}

/**
 * Response of `POST /tenants/files/upload-url`. `uploadUrl` is the short-lived
 * pre-signed PUT target (the API never sees the bytes), `key` is what the
 * branding save adopts, and `url` is the servable URL of that key — already
 * usable as a preview before saving.
 */
export interface TenantFileUploadTicketDto {
  uploadUrl: string;
  key: string;
  url: string | null;
}

/** What the logo upload accepts, mirroring the server's per-purpose policy. */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Recovers the storage key from a logo URL.
 *
 * `GET /tenants/branding` returns only `logoUrl`, but `PUT` needs the `logoKey`
 * to KEEP an existing logo while the theme changes. The server mints keys as
 * `{tenantId}/tenants/branding/{guid}.png` and validates ownership on save
 * (`TenantFileKey.BelongsTo`), so the key can be read back off the URL. Returns
 * null when the URL does not follow that convention — the caller must then treat
 * the logo as unresolved instead of silently dropping it.
 */
export function logoKeyFromUrl(logoUrl: string | null): string | null {
  if (!logoUrl) return null;

  let path: string;
  try {
    path = decodeURIComponent(new URL(logoUrl).pathname);
  } catch {
    return null;
  }

  const match = /([0-9a-fA-F-]{36}\/tenants\/branding\/[^/]+)$/.exec(path);
  return match ? match[1] : null;
}

/**
 * Normalization rewrites the blob AT THE SAME KEY, so the URL is stable and the
 * browser would keep showing the pre-upload bytes. A query string busts that
 * cache without touching the stored key.
 */
export function withCacheBuster(logoUrl: string | null, token: number): string | null {
  if (!logoUrl) return null;
  return `${logoUrl}${logoUrl.includes('?') ? '&' : '?'}v=${token}`;
}
