import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { toMessage } from '../../../core/http/problem-details';
import { ReservationDto } from '../../reservations-admin/data-access/reservation.models';
import { ReservationsAdminService } from '../../reservations-admin/data-access/reservations-admin.service';
import {
  ReservationTodayView,
  todayViewDates,
  todayViewSort,
} from '../../reservations-admin/data-access/today-views';

/**
 * How many rows the inbox holds. A glance, not a list: what does not fit is
 * counted in the footer, which links to the module that can page through it.
 *
 * It is also what the card RESERVES room for — the component sizes its pane
 * from this number — so an empty shortcut takes exactly as much height as a
 * full one and switching tabs never moves the page under the cursor.
 */
export const INBOX_PAGE_SIZE = 5;

/**
 * List state for the dashboard's «Requiere atención» inbox.
 *
 * It reads bookings through `ReservationsAdminService.query()` — the
 * state-free sibling of its `list()` — precisely so the dashboard never
 * clobbers what the Reservas screen has loaded: both services are
 * `providedIn: 'root'`, and the administrator walks from one to the other.
 */
@Injectable({ providedIn: 'root' })
export class AttentionInboxService {
  private readonly reservations = inject(ReservationsAdminService);

  private readonly _items = signal<ReservationDto[]>([]);
  /** Everything the filter matched, which is usually more than fits here. */
  private readonly _total = signal(0);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly total = this._total.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Which request is the current one. Flipping between the two shortcuts fires
   * two overlapping calls, and nothing guarantees they come back in order —
   * a late answer to an abandoned filter would otherwise paint the wrong rows.
   */
  private requestId = 0;

  /** Load the bookings one shortcut means, replacing whatever is shown. */
  loadReservations(view: ReservationTodayView): void {
    const id = ++this.requestId;
    this._loading.set(true);
    this._error.set(null);

    this.reservations
      .query(
        {
          amenityId: null,
          apartmentId: null,
          status: null,
          paymentUploaded: null,
          ...todayViewDates(view),
        },
        todayViewSort(view),
        1,
        INBOX_PAGE_SIZE,
      )
      .subscribe({
        next: (result) => {
          if (id !== this.requestId) return;
          this._items.set(result.items);
          this._total.set(result.totalCount);
          this._loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          if (id !== this.requestId) return;
          this._items.set([]);
          this._total.set(0);
          this._error.set(toMessage(error));
          this._loading.set(false);
        },
      });
  }
}
