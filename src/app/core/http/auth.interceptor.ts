import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';
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
 * A redeemed handoff session takes over this tab's API calls while active: it
 * is deliberately isolated from — and takes precedence over — the portal's own
 * `AuthStore` session, which may coexist in the same browser (ADR-0017 "Cedimos").
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

  const token = handoffStore.isActive() ? handoffStore.accessToken() : authStore.accessToken();
  if (!token) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
