import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { HandoffService } from '../../../core/handoff/handoff.service';
import { HANDOFF_PURPOSE_ROUTES } from '../../../core/handoff/handoff.models';
import { TenantStore } from '../../../core/tenant/tenant.store';

type AccesoState = 'redeeming' | 'redirecting' | 'error';

/**
 * The extra query params Domi may append to a link, forwarded verbatim to the
 * landing route. An ALLOWLIST, never the whole query string: `t` must not be
 * copied into the next URL, which is the entire reason the redeem is a POST
 * fired from here (ADR-0017).
 */
const FORWARDED_PARAMS = ['amenityId', 'date', 'time'] as const;

/**
 * Landing page for a Domi handoff link (ADR-0017): `/acceso?t=<ticket>`. The
 * `GET` that loads this page authenticates nothing — it only reads `t` from
 * the query string. The redeem itself is a `POST`, fired from here, so the
 * Bearer token it returns never touches browser history, the `Referer` or a
 * proxy log — only the opaque ticket does.
 *
 * No shell: a resident reaching this almost never has (or needs) a portal
 * account, and this route is never reachable from the app's own navigation.
 *
 * `amenityId`, `date` and `time` are optional extra query params the API never
 * puts in the link (it only ever mints `/acceso?t=…`, ADR-0017 §3) — Domi
 * appends them itself once the chat has settled which area the resident wants
 * and, often, which day and hour. This component forwards them verbatim to
 * wherever the redeemed `purpose` lands; interpreting them is that screen's
 * job, not this one's.
 */
@Component({
  selector: 'app-acceso',
  standalone: true,
  imports: [TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './acceso.component.html',
})
export class AccesoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly handoff = inject(HandoffService);
  readonly tenant = inject(TenantStore);

  readonly state = signal<AccesoState>('redeeming');
  readonly errorMessage = signal<string | null>(null);
  readonly canRetry = signal(false);

  private ticket: string | null = null;
  private forwarded: Record<string, string> = {};

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.ticket = params.get('t');

    for (const key of FORWARDED_PARAMS) {
      const value = params.get(key);
      if (value) {
        this.forwarded[key] = value;
      }
    }

    this.redeem();
  }

  retry(): void {
    this.state.set('redeeming');
    this.errorMessage.set(null);
    this.redeem();
  }

  private redeem(): void {
    if (!this.ticket) {
      this.fail('Este enlace no es válido. Pídele uno nuevo a Domi.', false);
      return;
    }

    this.handoff.redeem(this.ticket).subscribe({
      next: (response) => this.onRedeemed(response.purpose),
      error: (error: unknown) => this.onRedeemError(error),
    });
  }

  private onRedeemed(purpose: string): void {
    const landing = HANDOFF_PURPOSE_ROUTES[purpose];
    if (!landing) {
      // Defensive: the API knows a purpose this build hasn't shipped a landing
      // page for yet (ADR-0017 §3 — the nodo, not the API, owns this table).
      this.fail('No reconocemos este tipo de enlace. Contacta a tu administrador.', false);
      return;
    }

    this.state.set('redirecting');
    void this.router.navigate([landing], {
      queryParams: Object.keys(this.forwarded).length ? this.forwarded : undefined,
      replaceUrl: true,
    });
  }

  private onRedeemError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 429) {
        this.fail('Demasiados intentos. Espera un momento e intenta de nuevo.', true);
        return;
      }
      if (error.status === 400) {
        // Unknown, expired, revoked or wrong-tenant ticket — the API answers
        // with the SAME `Handoff.InvalidTicket` for all four on purpose
        // (ADR-0017 §1), so the client doesn't try to tell them apart either.
        this.fail(
          'Este enlace ya no es válido. Es posible que haya expirado o que ya se haya usado. Pídele uno nuevo a Domi.',
          false,
        );
        return;
      }
      this.fail(toMessage(error), true);
      return;
    }
    this.fail('No pudimos validar tu enlace. Verifica tu conexión e intenta de nuevo.', true);
  }

  private fail(message: string, retryable: boolean): void {
    this.errorMessage.set(message);
    this.canRetry.set(retryable);
    this.state.set('error');
  }
}
