import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Marks a request as belonging to the handoff session (ADR-0017) so the auth
 * interceptor sends the handoff token for it — and ONLY for it.
 *
 * The caller declares the intent because the axis cannot be inferred from the
 * URL: `GET /auth/current` is reachable under both sessions (it is in the
 * server's `[AllowsHandoff]` allowlist, ADR-0017 §5), so a path-based rule
 * would send the resident's token for the portal's own bootstrap and load the
 * wrong identity into `PermissionStore`.
 */
export const HANDOFF_REQUEST = new HttpContextToken<boolean>(() => false);

/** `this.http.get(url, { context: handoffContext() })` — see `HANDOFF_REQUEST`. */
export function handoffContext(): HttpContext {
  return new HttpContext().set(HANDOFF_REQUEST, true);
}
