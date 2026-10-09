import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  parseTowers,
  TenantInfoDto,
  UpdateTenantApartmentsSettingsRequest,
  UpdateTenantContactInfoRequest,
  UpdateTenantRequestsSettingsRequest,
} from './tenant-info.models';

/**
 * Single owner of `GET/PUT /tenants/info` — the self-service settings of the
 * conjunto resolved from `X-Tenant` (attached globally by `tenantInterceptor`,
 * so no call takes an id).
 *
 * It lives in `core/` rather than inside a feature because more than one reads
 * it: "Mi Conjunto" edits every block, and the apartment list needs the
 * declared towers to paint its filter. One cache is the point — a second one
 * would still be showing the old towers right after the admin edited them.
 *
 * `PUT /tenants/info` rewrites `contactInfo` wholesale and its validator
 * rejects an empty phone or schedule, so a caller that only means to change the
 * settings still has to resend the contact block. That is why the last server
 * state is kept here and refreshed by every successful save: it is what stops a
 * save on one tab from reverting another.
 *
 * Reads need the `tenant.info` permission; callers that may not hold it should
 * check before loading rather than swallow a 403 on every visit.
 */
@Injectable({ providedIn: 'root' })
export class TenantInfoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tenants/info`;

  private readonly _info = signal<TenantInfoDto | null>(null);
  /** Last known server state. Null until the first successful load. */
  readonly info = this._info.asReadonly();

  /** The conjunto's declared towers, already parsed by the API. Empty until loaded. */
  readonly towers = computed<readonly string[]>(() => this._info()?.apartments.towerList ?? []);

  /** The shared GET while it is still running, so two callers make one request. */
  private pending: Observable<TenantInfoDto> | null = null;

  /**
   * Read the settings of the caller's own conjunto, once per session. Callers
   * that mount together share the in-flight request; later ones get the cache.
   */
  load(): Observable<TenantInfoDto> {
    const cached = this._info();
    if (cached) return of(cached);
    if (this.pending) return this.pending;

    this.pending = this.http.get<TenantInfoDto>(this.baseUrl).pipe(
      tap((info) => this._info.set(info)),
      // Cleared on failure too, so a later mount retries instead of replaying
      // the error forever.
      finalize(() => (this.pending = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.pending;
  }

  /**
   * Replace the contact block. The other groups are deliberately omitted: the
   * API leaves a group it did not receive untouched, so the contact tab can
   * never clobber settings it does not show.
   */
  saveContactInfo(contactInfo: UpdateTenantContactInfoRequest): Observable<void> {
    return this.http
      .put<void>(this.baseUrl, { contactInfo })
      .pipe(tap(() => this.cache({ contactInfo })));
  }

  /**
   * Replace one or more settings groups. The contact block travels along
   * because the endpoint always rewrites it — taken from the cached server
   * state, not from whatever the contact tab currently has on screen, so an
   * unsaved draft over there is never persisted by a save over here.
   */
  saveSettings(settings: {
    requests?: UpdateTenantRequestsSettingsRequest;
    apartments?: UpdateTenantApartmentsSettingsRequest;
  }): Observable<void> {
    const info = this._info();
    if (!info) {
      return throwError(() => new Error('Tenant info has not been loaded yet.'));
    }

    return this.http.put<void>(this.baseUrl, { contactInfo: info.contactInfo, ...settings }).pipe(
      tap(() =>
        this.cache({
          ...(settings.requests ? { requests: settings.requests } : {}),
          // The server re-parses the CSV it was handed; mirror that here so the
          // towers everyone else reads match what was actually stored.
          ...(settings.apartments
            ? {
                apartments: {
                  towers: settings.apartments.towers || null,
                  towerList: parseTowers(settings.apartments.towers),
                },
              }
            : {}),
        }),
      ),
    );
  }

  /** Keeps the snapshot in step with what the server now holds. */
  private cache(patch: Partial<TenantInfoDto>): void {
    const info = this._info();
    if (!info) return;
    this._info.set({ ...info, ...patch });
  }
}
