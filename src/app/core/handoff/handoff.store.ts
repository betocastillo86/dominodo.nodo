import { computed, Injectable, signal } from '@angular/core';
import { HandoffRedeemResponse } from './handoff.models';

const STORAGE_KEY = 'dominodo.nodo.handoff';

/**
 * Signal-based state for a redeemed handoff session (ADR-0017). Deliberately
 * separate from `AuthStore` and backed by `sessionStorage`, not `localStorage`:
 * the two sessions share an origin, so the handoff token must never land where
 * the portal session keeps its own, nor survive the tab (ADR-0017 "Cedimos").
 *
 * There is no refresh token for this token shape (ADR-0017 §4) — `isActive`
 * is the only liveness check there is; once it goes false the resident has to
 * ask Domi for a new link.
 */
@Injectable({ providedIn: 'root' })
export class HandoffStore {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _expiresAt = signal<string | null>(null);
  private readonly _purpose = signal<string | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly purpose = this._purpose.asReadonly();

  readonly isActive = computed(() => {
    const token = this._accessToken();
    const expiresAt = this._expiresAt();
    return token !== null && expiresAt !== null && Date.parse(expiresAt) > Date.now();
  });

  constructor() {
    this.rehydrate();
  }

  /** Store a freshly redeemed session (overwrites any previous one in this tab). */
  setSession(session: HandoffRedeemResponse): void {
    this._accessToken.set(session.accessToken);
    this._expiresAt.set(session.expiresAt);
    this._purpose.set(session.purpose);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  /** Wipe the in-memory and persisted session (expired, redeemed again elsewhere, or rejected). */
  clear(): void {
    this._accessToken.set(null);
    this._expiresAt.set(null);
    this._purpose.set(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }

  private rehydrate(): void {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    let session: HandoffRedeemResponse;
    try {
      session = JSON.parse(raw) as HandoffRedeemResponse;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    // Drop a session that is missing fields or already expired (e.g. the tab
    // was reloaded long after the resident walked away).
    if (!session.accessToken || !session.expiresAt || Date.parse(session.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    this._accessToken.set(session.accessToken);
    this._expiresAt.set(session.expiresAt);
    this._purpose.set(session.purpose);
  }
}
