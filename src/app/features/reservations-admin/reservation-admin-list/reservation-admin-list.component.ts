import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { DataTableComponent, TableColumn } from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
  SearchSelectResolveFn,
} from '../../../shared/ui/search-select/search-select.component';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { formatDay, todayInReportZone, toFromUtc, toToUtc } from '../../dashboard/data-access/date-range';
import { formatInstantAsTimeOfDay } from '../../reservations/data-access/reservation-format';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityOptionsService } from '../data-access/amenity-options.service';
import { ApartmentOptionsService } from '../data-access/apartment-options.service';
import {
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUSES,
  ReservationDto,
  ReservationSort,
  ReservationStatus,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';
import { ReservationRespondComponent } from '../reservation-respond/reservation-respond.component';
import { ReservationStatusSelectComponent } from '../reservation-status-select/reservation-status-select.component';

/**
 * Soonest first: the point of this screen is what is about to happen, not what
 * was booked last. The API defaults to the opposite, so the sort is explicit.
 */
const SORT: ReservationSort = { sortBy: 'StartDate', direction: 'Asc' };

/** Newest request first — the order "Creadas hoy" is about. */
const CREATED_SORT: ReservationSort = { sortBy: 'CreatedDate', direction: 'Desc' };

/**
 * Now, on the wire. The other boundaries this screen sends are civil days in
 * the reporting zone and go through `toFromUtc`/`toToUtc`; this one is a true
 * instant ("todavía no ha vencido"), so it needs no zone at all.
 */
function nowAsInstant(): string {
  return new Date().toISOString();
}

/** The shortcuts offered above the filter bar. */
type QuickView = 'startsToday' | 'createdToday' | 'expiresToday';

interface QuickViewDef {
  key: QuickView;
  label: string;
  /** What it narrows to, as the button's tooltip. */
  hint: string;
}

const QUICK_VIEWS: readonly QuickViewDef[] = [
  { key: 'startsToday', label: 'Entrega hoy', hint: 'Las reservas cuya ventana cae hoy' },
  { key: 'createdToday', label: 'Creadas hoy', hint: 'Las que los residentes solicitaron hoy' },
  {
    key: 'expiresToday',
    label: 'Expiran hoy',
    hint: 'Pendientes cuyo plazo de respuesta vence hoy',
  },
];

/**
 * Admin reservations list: upcoming bookings across every area, soonest first,
 * each answerable in place — the "Estado" cell is a select
 * (`ReservationStatusSelectComponent`), and picking a state opens
 * `ReservationRespondComponent`, the dialog this screen shares with the detail,
 * already on that state. There is no separate "responder" button: the column
 * that SHOWS the state is the one that changes it.
 *
 * Defaults to "desde hoy" on the reservation WINDOW (`sortBy=StartDate`,
 * `fromUtc`), never the creation date — an admin who clears the "desde" filter
 * can still look back at past bookings.
 */
@Component({
  selector: 'app-reservation-admin-list',
  standalone: true,
  imports: [
    PageHeaderComponent,
    DataTableComponent,
    ReactiveFormsModule,
    SearchSelectComponent,
    ReservationRespondComponent,
    ReservationStatusSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-admin-list.component.html',
})
export class ReservationAdminListComponent {
  private readonly service = inject(ReservationsAdminService);
  private readonly amenityOptions = inject(AmenityOptionsService);
  private readonly apartmentOptions = inject(ApartmentOptionsService);

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly areas = signal<AmenityListItem[]>([]);

  readonly quickViews = QUICK_VIEWS;

  /** The shortcut currently applied, or null for the plain filter bar. */
  readonly quickView = signal<QuickView | null>(null);

  /** `yyyy-MM-dd` in the conjunto's reporting zone — never the browser's own. */
  readonly fromControl = new FormControl(todayInReportZone(), { nonNullable: true });
  readonly toControl = new FormControl('', { nonNullable: true });
  readonly amenityControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl<ReservationStatus | ''>('', { nonNullable: true });

  /** Options for the status filter, with their Spanish labels. */
  readonly statuses = RESERVATION_STATUSES;
  readonly statusLabel = RESERVATION_STATUS_LABEL;

  /**
   * Holds the chosen apartment's id → sent as `apartmentId` to
   * `GET /reservations`. A typeahead rather than the area filter's `<select>`:
   * a conjunto has a handful of social areas and hundreds of apartments, and
   * only one of those two fits in a dropdown.
   */
  readonly apartmentControl = new FormControl<string | null>(null);

  /** Remote lookup behind that typeahead, in the shape `app-search-select` expects. */
  readonly searchApartments: SearchSelectFn = (term) =>
    this.apartmentOptions
      .search(term)
      .pipe(map((items) => items.map((a) => ({ value: a.id, label: apartmentLabel(a) }))));

  /** Turns an id set from outside — a shared URL — back into something readable. */
  readonly resolveApartment: SearchSelectResolveFn = (id) =>
    this.apartmentOptions
      .getById(id)
      .pipe(map((a) => (a ? { value: a.id, label: apartmentLabel(a) } : null)));

  /**
   * Template for the "Estado" cell — the status select, which is interactive
   * and so cannot be expressed as a `TableColumn`'s plain value. Optional on
   * purpose: the column falls back to the badge for the first render, before
   * the query resolves.
   */
  private readonly statusCell = viewChild<TemplateRef<{ $implicit: ReservationDto }>>('statusCell');

  readonly columns = computed<readonly TableColumn<ReservationDto>[]>(() => [
    // The code leads where the row's eye icon does: it is what identifies the
    // booking, so it is what a reader tries to click first.
    {
      header: 'Código',
      value: (r) => r.code,
      class: 'w-1 text-nowrap fw-medium',
      link: (r) => this.detailLink(r),
    },
    { header: 'Fecha de reserva', value: (r) => this.windowLabel(r), class: 'text-nowrap' },
    {
      header: 'Pago',
      value: (r) => (r.paymentUploaded ? 'Sí' : 'No'),
      badgeClass: (r) => (r.paymentUploaded ? 'badge bg-green-lt' : 'badge bg-red-lt'),
    },
    { header: 'Apartamento', value: (r) => apartmentLabel(r.apartment) },
    // A control, not a value: the badge below is only what shows if the
    // template has not resolved yet.
    {
      header: 'Estado',
      value: (r) => RESERVATION_STATUS_LABEL[r.status],
      badgeClass: (r) => RESERVATION_STATUS_BADGE[r.status],
      cellTemplate: this.statusCell(),
    },
  ]);

  readonly rowKey = (r: ReservationDto): string => r.id;
  readonly detailLink = (r: ReservationDto): unknown[] => ['/reservations', r.id];

  private readonly pageSize = 20;

  constructor() {
    this.amenityOptions.list().subscribe({
      next: (areas) => this.areas.set(areas),
      // The filter just stays empty — the list itself does not depend on it.
      error: () => this.areas.set([]),
    });

    // A hand-edited window is no longer the quick view that wrote it. Subscribed
    // BEFORE the reload below so the flag is already down when the reload reads it
    // (`toggleQuickView` writes the controls silently, so it never lands here).
    for (const control of [this.fromControl, this.toControl]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.quickView.set(null));
    }

    const filters = [
      this.fromControl,
      this.toControl,
      this.amenityControl,
      this.apartmentControl,
      this.statusControl,
    ];
    for (const control of filters) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    }

    this.reload(1);
  }

  onPageChange(page: number): void {
    this.reload(page);
  }

  /**
   * Quick views are shortcuts OVER the filter bar, not a mode beside it: each
   * writes the date window it means, so the administrator sees what it did and
   * can adjust from there — and editing a date by hand drops the shortcut.
   *
   * Only "Entrega hoy" is about that window. The other two ask about instants
   * with no field in the bar — when the resident requested the booking, when an
   * unanswered one lapses — and what came in or lapses today can be booked for
   * ANY date, so they CLEAR the window and `reload` sends their own range.
   */
  toggleQuickView(key: QuickView): void {
    const next = this.quickView() === key ? null : key;
    this.quickView.set(next);

    const today = todayInReportZone();
    const [from, to] =
      next === 'startsToday'
        ? [today, today]
        : next !== null
          ? ['', ''] // "Creadas hoy" / "Expiran hoy": the window must not narrow them.
          : // Back to the screen's own default: from today, open-ended.
            [today, ''];

    this.fromControl.setValue(from, { emitEvent: false });
    this.toControl.setValue(to, { emitEvent: false });
    this.reload(1);
  }

  /**
   * Answering changes the booking's state, and the state is a column — refetch
   * the page the administrator is standing on rather than patching the row.
   */
  onResponded(): void {
    this.reload(this.paging()?.page ?? 1);
  }

  /** `"20 oct 2026 · 8:00 a. m.–10:00 a. m."` — the booked WINDOW, not when it was requested. */
  private windowLabel(r: ReservationDto): string {
    const day = formatDay(r.dateLocal);
    const start = formatInstantAsTimeOfDay(r.startsAtUtc);
    const end = formatInstantAsTimeOfDay(r.endsAtUtc);
    return `${day} · ${start}–${end}`;
  }

  private reload(page: number): void {
    const view = this.quickView();
    const createdToday = view === 'createdToday';
    const expiresToday = view === 'expiresToday';
    const today = todayInReportZone();

    this.service.list(
      {
        amenityId: this.amenityControl.value || null,
        apartmentId: this.apartmentControl.value || null,
        status: this.statusControl.value || null,
        // `GET /reservations` does not accept a payment filter yet — the column
        // reports it, but narrowing by it has to happen server-side.
        paymentUploaded: null,
        // The booked window, straight off the two date fields.
        fromUtc: this.fromControl.value ? toFromUtc(this.fromControl.value) : null,
        toUtc: this.toControl.value ? toToUtc(this.toControl.value) : null,
        // A DIFFERENT instant: when the resident asked. No field of its own —
        // only "Creadas hoy" sets it, and it leaves the window open, because
        // today's intake can be for any date.
        createdFromUtc: createdToday ? toFromUtc(today) : null,
        createdToUtc: createdToday ? toToUtc(today) : null,
        // A third instant: `pendingDeadlineUtc`, which the domain nulls out the
        // moment a booking is confirmed, rejected, cancelled or expired — so
        // this range narrows to the still-PENDING ones on its own, no status
        // filter needed. It opens at NOW, not at midnight: a deadline earlier
        // today has already passed, and what this view is for is what can still
        // be saved before it does.
        expiresFromUtc: expiresToday ? nowAsInstant() : null,
        expiresToUtc: expiresToday ? toToUtc(today) : null,
      },
      // Today's intake reads newest request first; everything else, soonest
      // window first — which for "Expiran hoy" is also near enough to soonest
      // deadline, since a deadline is trimmed to its own window's start
      // (`Reservation.Reschedule`) and `sortBy` has no deadline key anyway.
      createdToday ? CREATED_SORT : SORT,
      page,
      this.pageSize,
    );
  }
}
