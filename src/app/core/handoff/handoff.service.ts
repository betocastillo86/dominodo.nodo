import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { HandoffRedeemRequest, HandoffRedeemResponse } from './handoff.models';
import { HandoffStore } from './handoff.store';

/** Exchanges a Domi handoff ticket for a purpose-scoped access token (ADR-0017). */
@Injectable({ providedIn: 'root' })
export class HandoffService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(HandoffStore);
  private readonly base = `${environment.apiBaseUrl}/auth/handoff`;

  /**
   * Anonymous and reusable while the ticket lives (ADR-0017 §6), so calling it
   * again on retry is safe. `X-Tenant` still goes out via the global
   * interceptor; the ticket already carries its own tenant and a mismatch is
   * rejected server-side as the same `Handoff.InvalidTicket`.
   */
  redeem(ticket: string): Observable<HandoffRedeemResponse> {
    const body: HandoffRedeemRequest = { ticket };
    return this.http
      .post<HandoffRedeemResponse>(`${this.base}/redeem`, body)
      .pipe(tap((session) => this.store.setSession(session)));
  }
}
