/**
 * Raw response of `GET /tenant/current`, typed EXACTLY as the API returns it
 * (camelCase; do not rename). `status` is still absent from the payload and is
 * defaulted by `TenantService`.
 */
export interface TenantCurrentResponse {
  tenantId: string;
  domain: string;
  slug: string;
  tenantName: string;
  status?: string;
  branding?: Partial<TenantBranding> | null;
  /** Enabled `FeatureKey` names. Note the API's own spelling — not `features`. */
  enabledFeatures?: string[] | null;
}

/**
 * Normalized tenant profile the store + UI consume. Derived from
 * `TenantCurrentResponse` by `TenantService`, filling defaults for the fields
 * the API does not return yet.
 */
export interface TenantProfile {
  tenantId: string;
  domain: string;
  slug: string;
  name: string;
  status: string;
  branding: TenantBranding;
  /** Enabled TenantFeature keys — gate nav sections. */
  features: string[];
}

export interface TenantBranding {
  /**
   * `TenantTheme` name as the API returns it ("Blue", "Teal", …) — the palette
   * the whole app paints with. Null until the conjunto saves branding.
   */
  theme: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  loginText: string | null;
}
