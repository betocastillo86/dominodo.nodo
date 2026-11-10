import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type NotificationType = 'error' | 'success' | 'info';

export interface AppNotification {
  id: number;
  type: NotificationType;
  message: string;
}

/**
 * How long a toast stays on screen before it dismisses itself. Long enough to
 * read a Spanish error sentence without hurrying, short enough that the corner
 * is clear again by the time the next action answers.
 */
const NOTIFICATION_TTL_MS = 7_000;

/**
 * The ceiling on the stack, because the clock alone does not stop a pile-up:
 * a failing screen can push several messages within one second, and five
 * alerts in the corner of a 360px phone cover the page they are talking about.
 * The oldest go first — the newest is the one the resident just caused.
 */
const MAX_VISIBLE_NOTIFICATIONS = 4;

/**
 * Minimal signal-based notification bus. The error interceptor pushes messages
 * here; the toast component (shared/ui/notifications) renders `items`.
 *
 * Nothing on this surface closes a toast on the user's behalf — a resident on
 * a phone will not hunt for an × — so every message carries its own timer and
 * leaves on its own. The × stays for whoever wants the corner back sooner.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _items = signal<AppNotification[]>([]);
  readonly items = this._items.asReadonly();

  private sequence = 0;
  /** id → its expiry timer, so dismissing early does not leave one pending. */
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();
    });
  }

  error(message: string): void {
    this.push('error', message);
  }

  success(message: string): void {
    this.push('success', message);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this._items.update((list) => list.filter((n) => n.id !== id));
  }

  private push(type: NotificationType, message: string): void {
    const id = ++this.sequence;
    this._items.update((list) => [...list, { id, type, message }]);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), NOTIFICATION_TTL_MS),
    );

    // Trimmed through `dismiss()` rather than by slicing the list, so a dropped
    // message takes its timer with it instead of leaving one to fire later.
    for (const stale of this._items().slice(0, -MAX_VISIBLE_NOTIFICATIONS)) {
      this.dismiss(stale.id);
    }
  }
}
