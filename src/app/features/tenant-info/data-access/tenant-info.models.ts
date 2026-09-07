/**
 * Response of `GET /tenants/info` — the contact info of the conjunto resolved
 * from `X-Tenant`. Typed exactly as the API returns it (every field nullable).
 */
export interface TenantContactInfoDto {
  phone: string | null;
  address: string | null;
  additionalInfo: string | null;
  schedules: string | null;
  administratorName: string | null;
}

/**
 * Body of `PUT /tenants/info`. The endpoint REPLACES the whole contact-info
 * group, so every field travels on each save. Server rules: `phone` required
 * (max 50), `schedules` required (max 1000), `address` max 300,
 * `additionalInfo` max 1000, `administratorName` max 200. The form additionally
 * requires `administratorName` — a client-only rule the API does not enforce.
 */
export interface UpdateTenantInfoRequest {
  phone: string | null;
  address: string | null;
  additionalInfo: string | null;
  schedules: string | null;
  administratorName: string | null;
}
