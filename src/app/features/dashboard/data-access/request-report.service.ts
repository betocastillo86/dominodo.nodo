import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { DateRange, toFromUtc, toToUtc } from './date-range';
import { RequestReportDto } from './request-report.models';

/**
 * Data-access for the admin dashboard. One coarse call returns the whole
 * document; state lives here as signals. X-Tenant is attached globally by
 * `tenantInterceptor` — the report is single-tenant by construction server-side.
 *
 * The API already caches the hydrated document per (tenant, range), so a repeat
 * of the same range is cheap and no client-side cache is warranted.
 */
@Injectable({ providedIn: 'root' })
export class RequestReportService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/requests/report`;

  private readonly _report = signal<RequestReportDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _loadedRange = signal<DateRange | null>(null);

  readonly report = this._report.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  /** Range the current `report()` actually describes — not the one being typed. */
  readonly loadedRange = this._loadedRange.asReadonly();

  /**
   * Ranges are switched faster than they load (a user clicking through presets),
   * so the in-flight request is cancelled rather than raced: without this, a slow
   * 90-day answer can land after a fast 7-day one and repaint stale numbers.
   */
  private inFlight: Subscription | null = null;

  load(range: DateRange): void {
    this.inFlight?.unsubscribe();

    this._loading.set(true);
    this._error.set(null);

    const params = new HttpParams()
      .set('fromUtc', toFromUtc(range.from))
      .set('toUtc', toToUtc(range.to));

    this.inFlight = this.http.get<RequestReportDto>(this.url, { params }).subscribe({
      next: (report) => {
        this._report.set(report);
        this._loadedRange.set(range);
        this._loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        // Keep the previous document on screen: a failed refresh should not blank
        // a dashboard that was already showing valid numbers.
        this._error.set(toMessage(error));
        this._loading.set(false);
      },
    });
  }

  /** Drop everything (logout / tenant switch). */
  clear(): void {
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this._report.set(null);
    this._loadedRange.set(null);
    this._error.set(null);
    this._loading.set(false);
  }
}
