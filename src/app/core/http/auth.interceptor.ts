import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';

/** Endpoints that must NOT carry the Authorization header. */
const SKIP_AUTH = ['/auth/login', '/auth/refresh'];

/**
 * Attaches `Authorization: Bearer <accessToken>` to requests targeting OUR API.
 * Third-party hosts are skipped on purpose: direct-to-storage uploads
 * (`PUT <uploadUrl>` against Azure Blob) authenticate with the SAS in the URL,
 * and an extra Bearer header makes Blob reject the request — besides leaking
 * the session token to a host that has no business seeing it.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(AuthStore);
  const token = store.accessToken();
  const shouldSkip =
    SKIP_AUTH.some((path) => req.url.includes(path)) ||
    !req.url.startsWith(environment.apiBaseUrl);

  if (!token || shouldSkip) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
