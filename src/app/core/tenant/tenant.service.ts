import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TenantCurrentResponse, TenantProfile } from './tenant.models';

/** Default primary color used when the API does not return branding yet (Tabler blue). */
const DEFAULT_PRIMARY_COLOR = '#066fd1';
/** Features assumed enabled until the API returns the `features` array. */
const DEFAULT_FEATURES = ['Requests', 'Announcements', 'KnowledgeResources'];

@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly http = inject(HttpClient);

  /**
   * Loads the tenant via `GET /tenant/current` and normalizes it to a
   * `TenantProfile`. The endpoint currently returns a reduced shape (no
   * status/branding/features) — those are defaulted here until the API ships
   * them (docs/architecture.md §3.1). If the endpoint is absent (404/network)
   * a fallback profile keeps the app running. Genuine `400 Tenant.Unknown`
   * propagates so the bootstrap can route to the not-found page.
   */
  getCurrent(slug: string): Observable<TenantProfile> {
    return this.http
      .get<TenantCurrentResponse>(`${environment.apiBaseUrl}/tenant/current`)
      .pipe(
        map((response) => normalize(response, slug)),
        catchError((error: HttpErrorResponse) => {
          // Unknown/suspended tenant — let the bootstrap route to the not-found page.
          if (error.status === 400) {
            throw error;
          }
          // Endpoint not implemented (404) or unreachable (0) → graceful fallback.
          console.warn(
            `[tenant] GET /tenant/current unavailable (status ${error.status}). ` +
              `Falling back to default branding + all features enabled. TODO: remove once the API ships the endpoint.`,
          );
          return of(fallbackProfile(slug));
        }),
      );
  }
}

/** Map the raw API response into a normalized profile, defaulting missing fields. */
function normalize(response: TenantCurrentResponse, slug: string): TenantProfile {
  return {
    tenantId: response.tenantId,
    domain: response.domain,
    slug: response.slug || slug,
    name: response.tenantName || titleize(slug),
    // API does not return status yet → treat a successful read as an active tenant.
    status: response.status ?? 'Active',
    branding: {
      logoUrl: response.branding?.logoUrl ?? null,
      primaryColor: response.branding?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
      loginText: response.branding?.loginText ?? null,
    },
    features: response.features ?? DEFAULT_FEATURES,
  };
}

function fallbackProfile(slug: string): TenantProfile {
  return {
    tenantId: '',
    domain: '',
    slug,
    name: titleize(slug),
    status: 'Active',
    branding: {
      logoUrl: null,
      primaryColor: DEFAULT_PRIMARY_COLOR,
      loginText: null,
    },
    features: DEFAULT_FEATURES,
  };
}

/** "los-almendros" → "Los Almendros" */
function titleize(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
