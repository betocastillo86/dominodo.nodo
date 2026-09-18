/**
 * Raw response of `GET /tenant/current`, typed EXACTLY as the API returns it
 * (camelCase; do not rename). The endpoint currently returns a reduced shape;
 * `status`/`branding`/`features` are the proposed additions (docs/architecture.md
 * §3.1) and arrive as `undefined` until the API ships them.
 */
export interface TenantCurrentResponse {
  tenantId: string;
  domain: string;
  slug: string;
  tenantName: string;
  status?: string;
  branding?: Partial<TenantBranding> | null;
  features?: string[] | null;
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
