import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { TenantStore } from '../tenant/tenant.store';

/**
 * Attaches `X-Tenant: <slug>` to EVERY request targeting the API base URL,
 * including `/auth/*` and `/tenant/current`. The slug comes from TenantStore,
 * set once at bootstrap. See docs/architecture.md §4.2.
 */
export const tenantInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(TenantStore);
  const slug = store.slug();

  const isApiRequest = req.url.startsWith(environment.apiBaseUrl);
  if (!slug || !isApiRequest) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'X-Tenant': slug } }));
};
