/**
 * The "hoy" shortcuts over `GET /reservations`, expressed as filters.
 *
 * Shared by the two screens that ask the same questions: the Reservas list,
 * where they sit as buttons over the filter bar, and the dashboard's attention
 * inbox, where two of them ARE the query. One definition because the thing they
 * encapsulate is easy to get subtly wrong twice — each view asks about a
 * DIFFERENT instant on the booking:
 *  - «Entrega hoy» — the booked WINDOW (`fromUtc`/`toUtc`), when the area is used;
 *  - «Creadas hoy» — when the resident ASKED (`createdFromUtc`/`createdToUtc`);
 *  - «Expiran hoy» — `pendingDeadlineUtc`, when an unanswered pending booking lapses.
 *
 * The last two must leave the window OPEN: what came in or lapses today can be
 * booked for any date at all.
 */
import { toFromUtc, todayInReportZone, toToUtc } from '../../dashboard/data-access/date-range';
import { RESERVATIONS_HELP } from './help-text';
import type { ReservationFilters, ReservationSort } from './reservation.models';

export type ReservationTodayView = 'startsToday' | 'createdToday' | 'expiresToday';

export interface ReservationTodayViewDef {
  key: ReservationTodayView;
  label: string;
  /** What it narrows to, as the button's tooltip. */
  hint: string;
}

export const RESERVATION_TODAY_VIEWS: readonly ReservationTodayViewDef[] = [
  { key: 'startsToday', label: 'Entrega hoy', hint: RESERVATIONS_HELP.startsToday },
  { key: 'createdToday', label: 'Creadas hoy', hint: RESERVATIONS_HELP.createdToday },
  { key: 'expiresToday', label: 'Expiran hoy', hint: RESERVATIONS_HELP.expiresToday },
];

/** The six date filters of {@link ReservationFilters} — the only ones a view touches. */
export type ReservationDateFilters = Pick<
  ReservationFilters,
  'fromUtc' | 'toUtc' | 'createdFromUtc' | 'createdToUtc' | 'expiresFromUtc' | 'expiresToUtc'
>;

/** Every date filter off: no window, no intake range, no deadline range. */
export const NO_DATE_FILTERS: ReservationDateFilters = {
  fromUtc: null,
  toUtc: null,
  createdFromUtc: null,
  createdToUtc: null,
  expiresFromUtc: null,
  expiresToUtc: null,
};

/**
 * Soonest window first. The API defaults to the latest first, so this is always
 * sent explicitly: both screens are about what is coming up next.
 */
export const RESERVATION_WINDOW_SORT: ReservationSort = { sortBy: 'StartDate', direction: 'Asc' };

/** Newest request first — the order «Creadas hoy» is about. */
export const RESERVATION_CREATED_SORT: ReservationSort = {
  sortBy: 'CreatedDate',
  direction: 'Desc',
};

/**
 * Now, on the wire. The day boundaries around it are civil days in the
 * reporting zone and go through `toFromUtc`/`toToUtc`; this one is a true
 * instant ("todavía no ha vencido"), so it needs no zone at all.
 */
function nowAsInstant(): string {
  return new Date().toISOString();
}

/** Every date filter one view means; the ones it does not use stay null. */
export function todayViewDates(
  view: ReservationTodayView,
  today = todayInReportZone(),
): ReservationDateFilters {
  switch (view) {
    case 'startsToday':
      return { ...NO_DATE_FILTERS, fromUtc: toFromUtc(today), toUtc: toToUtc(today) };
    case 'createdToday':
      return { ...NO_DATE_FILTERS, createdFromUtc: toFromUtc(today), createdToUtc: toToUtc(today) };
    case 'expiresToday':
      // Opens at NOW, not at midnight: a deadline earlier today has already
      // passed, and this view is for what can still be saved before it does.
      return { ...NO_DATE_FILTERS, expiresFromUtc: nowAsInstant(), expiresToUtc: toToUtc(today) };
  }
}

/**
 * How a view is ordered. «Expiran hoy» rides the window sort too: a deadline is
 * trimmed to its own window's start (`Reservation.Reschedule`), so soonest
 * window is near enough to soonest deadline — and `sortBy` has no deadline key.
 */
export function todayViewSort(view: ReservationTodayView): ReservationSort {
  return view === 'createdToday' ? RESERVATION_CREATED_SORT : RESERVATION_WINDOW_SORT;
}

/**
 * The civil-day window a view writes into a date filter bar, as `[desde, hasta]`.
 * Empty strings for the two views that must not narrow the window.
 */
export function todayViewWindow(
  view: ReservationTodayView,
  today = todayInReportZone(),
): [string, string] {
  return view === 'startsToday' ? [today, today] : ['', ''];
}
