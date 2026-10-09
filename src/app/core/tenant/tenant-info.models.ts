/**
 * Contract of `GET/PUT /tenants/info` — the self-service settings of the
 * conjunto resolved from `X-Tenant`, grouped by concern exactly as the API
 * shapes them. Typed as the API returns them (camelCase); do not rename.
 */
export interface TenantInfoDto {
  contactInfo: TenantContactInfoDto;
  requests: TenantRequestsSettingsDto;
  apartments: TenantApartmentsSettingsDto;
}

/** The contact block. Every field is nullable. */
export interface TenantContactInfoDto {
  phone: string | null;
  address: string | null;
  additionalInfo: string | null;
  schedules: string | null;
  administratorName: string | null;
}

/**
 * The PQRS block. `autoCloseDays` is the window a resolved request stays
 * reopenable before closing by itself; `0` means the automatic close is OFF for
 * this conjunto. The GET always returns the EFFECTIVE value (the server's own
 * default when the tenant never set one), so the client never has to know it.
 */
export interface TenantRequestsSettingsDto {
  autoCloseDays: number;
}

/**
 * The units block. The API stores the towers as the comma-separated text the
 * administrator typed and hands back BOTH shapes: `towers` is that raw text
 * (and the only shape the PUT accepts), `towerList` is the same list already
 * split, trimmed and de-duplicated. Read `towerList` — never parse `towers`.
 */
export interface TenantApartmentsSettingsDto {
  towers: string | null;
  towerList: string[];
}

/**
 * Body of `PUT /tenants/info`. `contactInfo` is REPLACED wholesale (so every
 * field travels on each save) while `requests` and `apartments` are optional —
 * a group the body does not carry is left untouched.
 *
 * Server rules: `phone` required (max 50), `schedules` required (max 1000),
 * `address` max 300, `additionalInfo` max 1000, `administratorName` max 200,
 * `autoCloseDays` between 0 and 365, `towers` max 1000 chars / 200 entries /
 * 50 chars each / no repeats. The form additionally requires
 * `administratorName` — a client-only rule the API does not enforce.
 */
export interface UpdateTenantInfoRequest {
  contactInfo: UpdateTenantContactInfoRequest;
  requests?: UpdateTenantRequestsSettingsRequest;
  apartments?: UpdateTenantApartmentsSettingsRequest;
}

export interface UpdateTenantContactInfoRequest {
  phone: string | null;
  address: string | null;
  additionalInfo: string | null;
  schedules: string | null;
  administratorName: string | null;
}

export interface UpdateTenantRequestsSettingsRequest {
  autoCloseDays: number;
}

export interface UpdateTenantApartmentsSettingsRequest {
  /**
   * Comma-separated. An EMPTY string is a deliberate "this conjunto declares no
   * towers" and clears the list — only omitting the whole group leaves it alone.
   */
  towers: string;
}

/** Bounds the API enforces on `autoCloseDays` (0 disables the automatic close). */
export const AUTO_CLOSE_DAYS_MIN = 0;
export const AUTO_CLOSE_DAYS_MAX = 365;

/** Bounds the API enforces on the tower list (`TowerList` in the Tenants domain). */
export const MAX_TOWERS = 200;
export const MAX_TOWER_LENGTH = 50;

/**
 * Splits a tower CSV the same way the server does: trim each entry, drop the
 * blanks, keep first-seen order and drop case-insensitive repeats.
 *
 * Only needed to keep the cached snapshot in step after a save — a READ always
 * has `towerList` already parsed by the API.
 */
export function parseTowers(csv: string | null): string[] {
  if (!csv) return [];

  const towers: string[] = [];
  const seen = new Set<string>();

  for (const raw of csv.split(',')) {
    const tower = raw.trim();
    if (!tower) continue;

    const key = tower.toLocaleLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    towers.push(tower);
  }

  return towers;
}

/** Joins the towers back into the CSV the PUT expects. */
export function formatTowers(towers: readonly string[]): string {
  return towers.join(',');
}
