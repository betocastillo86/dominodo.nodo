import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { HANDOFF_REQUEST } from '../handoff/handoff.context';
import { HandoffStore } from '../handoff/handoff.store';
import { NotificationService } from '../notifications/notification.service';
import { toMessage } from './problem-details';

/** Auth endpoints are excluded from the 401 refresh-and-retry logic. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/handoff/redeem'];

/**
 * On 401 (for non-auth requests) attempts a SINGLE refresh and retries the
 * original request; if that fails, clears the session and redirects to `/auth`.
 * All other errors are mapped from RFC 9457 ProblemDetails to a user message
 * via the shared `toMessage` helper.
 *
 * A handoff request (ADR-0017) is checked FIRST: that token has no refresh, so
 * its 401 means the session is simply over — retrying with the portal's own
 * refresh token would silently answer with the wrong identity. The check is on
 * the REQUEST, not merely on having a live handoff session, so a portal 401
 * never tears down a handoff the resident is still using in this tab.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const store = inject(AuthStore);
  const handoffStore = inject(HandoffStore);
  const router = inject(Router);
  const notifications = inject(NotificationService);

  const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));

  // Non-API traffic (direct-to-storage uploads) carries neither our session nor
  // ProblemDetails, so neither the refresh dance nor the toast applies: the
  // caller handles the failure inline.
  if (!req.url.startsWith(environment.apiBaseUrl)) {
    return next(req);
  }

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && req.context.get(HANDOFF_REQUEST)) {
        handoffStore.clear();
        notifications.error('Tu enlace para reservar expiró. Pídele uno nuevo por WhatsApp.');
        void router.navigateByUrl('/acceso');
        return throwError(() => error);
      }

      const canRefresh = error.status === 401 && !isAuthEndpoint && !!store.refreshToken();

      if (canRefresh) {
        return auth.refresh().pipe(
          switchMap((tokens) =>
            next(req.clone({ setHeaders: { Authorization: `Bearer ${tokens.accessToken}` } })),
          ),
          catchError(() => {
            store.clear();
            notifications.error('Tu sesión expiró. Inicia sesión nuevamente.');
            void router.navigate(['/auth']);
            return throwError(() => error);
          }),
        );
      }

      notifications.error(toMessage(error));
      return throwError(() => error);
    }),
  );
};
