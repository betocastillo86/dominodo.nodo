/** Request body for `POST /auth/handoff/redeem` (ADR-0017 in `dominodo.api`). */
export interface HandoffRedeemRequest {
  ticket: string;
}

/**
 * Response of `POST /auth/handoff/redeem`, typed exactly as the API returns it.
 * No refresh token by design — when `expiresAt` passes, the resident asks Domi
 * for a new link (ADR-0017 §4). `purpose` is what the client routes on: the API
 * knows nothing about the nodo's route topology (ADR-0017 §3).
 */
export interface HandoffRedeemResponse {
  accessToken: string;
  expiresAt: string;
  purpose: string;
}

/** Known handoff purposes — mirrors the API's `HandoffPurposes` (`Shared.Kernel`). */
export const HANDOFF_PURPOSE_AMENITY_RESERVATION = 'amenity-reservation';

/**
 * Where a redeemed session lands, by purpose. The nodo owns this table, not the
 * API (ADR-0017 §3) — a purpose with no entry here is one this build does not
 * know how to serve yet.
 */
export const HANDOFF_PURPOSE_ROUTES: Record<string, string> = {
  [HANDOFF_PURPOSE_AMENITY_RESERVATION]: '/reservas',
};
