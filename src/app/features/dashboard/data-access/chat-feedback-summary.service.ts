import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { ChatFeedbackSummaryDto } from './chat-feedback-summary.models';
import { DateRange, toFromUtc, toToUtc } from './date-range';

/**
 * Data-access for the dashboard's «Respuestas de Domi» block. Loaded apart
 * from the PQRS report on purpose: the API only proxies it to Domi, so Domi
 * being down must cost this one block, never the rest of the dashboard.
 *
 * The tenant is never sent as a filter — `X-Tenant` already pins an
 * administrator to its own conjunto, and the server rejects any other slug.
 */
@Injectable({ providedIn: 'root' })
export class ChatFeedbackSummaryService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/chat-feedback/summary`;

  private readonly _summary = signal<ChatFeedbackSummaryDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly summary = this._summary.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Same reason as the report: a slow range must not land after a fast one. */
  private inFlight: Subscription | null = null;

  load(range: DateRange): void {
    this.inFlight?.unsubscribe();

    this._loading.set(true);
    this._error.set(null);

    const params = new HttpParams().set('from', toFromUtc(range.from)).set('to', toToUtc(range.to));

    this.inFlight = this.http.get<ChatFeedbackSummaryDto>(this.url, { params }).subscribe({
      next: (summary) => {
        this._summary.set(summary);
        this._loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        // 502: the API is up but Domi is not — its own detail is not written
        // for an administrator.
        this._error.set(
          error.status === 502
            ? 'Domi no está disponible en este momento. Intenta de nuevo en unos minutos.'
            : toMessage(error),
        );
        this._loading.set(false);
      },
    });
  }

  /** Drop everything (logout / tenant switch). */
  clear(): void {
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this._summary.set(null);
    this._error.set(null);
    this._loading.set(false);
  }
}
