import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';
import { HANDOFF_REQUEST } from '../handoff/handoff.context';
import { HandoffStore } from '../handoff/handoff.store';

/** Endpoints that must NOT carry the Authorization header. */
const SKIP_AUTH = ['/auth/login', '/auth/refresh', '/auth/handoff/redeem'];

/**
 * Attaches `Authorization: Bearer <accessToken>` to requests targeting OUR API.
 * Third-party hosts are skipped on purpose: direct-to-storage uploads
 * (`PUT <uploadUrl>` against Azure Blob) authenticate with the SAS in the URL,
 * and an extra Bearer header makes Blob reject the request — besides leaking
 * the session token to a host that has no business seeing it.
 *
 * The two sessions share an origin but never share a request. A handoff session
 * (ADR-0017) authenticates ONLY calls that opted in through `HANDOFF_REQUEST`;
 * everything else keeps using the portal's own `AuthStore` session. Letting an
 * active handoff take over the tab instead would hand the resident's identity
 * to the portal's bootstrap — `GET /auth/current` answers under both sessions —
 * and paint an admin's shell with someone else's profile and permissions.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authStore = inject(AuthStore);
  const handoffStore = inject(HandoffStore);
  const shouldSkip =
    SKIP_AUTH.some((path) => req.url.includes(path)) ||
    !req.url.startsWith(environment.apiBaseUrl);

  if (shouldSkip) {
    return next(req);
  }

  // A handoff request never falls back to the portal token: an expired handoff
  // session must fail as itself (401 → "ask Domi for a new link"), not silently
  // continue as whoever else happens to be signed in on this browser.
  const token = req.context.get(HANDOFF_REQUEST)
    ? (handoffStore.isActive() ? handoffStore.accessToken() : null)
    : authStore.accessToken();

  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
