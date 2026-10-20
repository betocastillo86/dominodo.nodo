import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { DataTableComponent, TableColumn } from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
  SearchSelectResolveFn,
} from '../../../shared/ui/search-select/search-select.component';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { formatDay, todayInReportZone, toFromUtc, toToUtc } from '../../dashboard/data-access/date-range';
import {
  formatCurrencyCOP,
  formatInstantAsTimeOfDay,
} from '../../reservations/data-access/reservation-format';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityOptionsService } from '../data-access/amenity-options.service';
import { ApartmentOptionsService } from '../data-access/apartment-options.service';
import {
  availableReservationActions,
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUSES,
  ReservationDto,
  ReservationSort,
  ReservationStatus,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';
import { ReservationRespondComponent } from '../reservation-respond/reservation-respond.component';

/**
 * Soonest first: the point of this screen is what is about to happen, not what
 * was booked last. The API defaults to the opposite, so the sort is explicit.
 */
const SORT: ReservationSort = { sortBy: 'StartDate', direction: 'Asc' };

/**
 * Admin reservations list: upcoming bookings across every area, soonest first,
 * each answerable in place — the "responder" action opens
 * `ReservationRespondComponent`, the dialog this screen shares with the detail.
 * Which rows offer it mirrors the API's own guards (see
 * `availableReservationActions`).
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-admin-list.component.html',
})
export class ReservationAdminListComponent {
  private readonly service = inject(ReservationsAdminService);
  private readonly amenityOptions = inject(AmenityOptionsService);
  private readonly apartmentOptions = inject(ApartmentOptionsService);
  private readonly permissions = inject(PermissionStore);

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly areas = signal<AmenityListItem[]>([]);

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
   * Permissive only while `GET /auth/current` is still in flight, as everywhere
   * else in the portal — the server stays authoritative either way.
   */
  private readonly canEdit = computed(
    () => !this.permissions.loaded() || this.permissions.has('reservations.edit'),
  );
  private readonly canCancel = computed(
    () => !this.permissions.loaded() || this.permissions.has('reservations.cancel'),
  );

  readonly columns: readonly TableColumn<ReservationDto>[] = [
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
      header: 'Valor',
      value: (r) => (r.price == null ? '—' : formatCurrencyCOP(r.price)),
      class: 'text-nowrap',
    },
    {
      header: 'Pago',
      value: (r) => (r.paymentUploaded ? 'Sí' : 'No'),
      badgeClass: (r) => (r.paymentUploaded ? 'badge bg-green-lt' : 'badge bg-red-lt'),
    },
    { header: 'Apartamento', value: (r) => apartmentLabel(r.apartment) },
    {
      header: 'Estado',
      value: (r) => RESERVATION_STATUS_LABEL[r.status],
      badgeClass: (r) => RESERVATION_STATUS_BADGE[r.status],
    },
  ];

  readonly rowKey = (r: ReservationDto): string => r.id;
  readonly detailLink = (r: ReservationDto): unknown[] => ['/reservations', r.id];

  /** Only rows that still have a move available get the respond button. */
  readonly canRespond = (r: ReservationDto): boolean =>
    availableReservationActions(r, this.canEdit(), this.canCancel()).length > 0;

  private readonly pageSize = 20;

  constructor() {
    this.amenityOptions.list().subscribe({
      next: (areas) => this.areas.set(areas),
      // The filter just stays empty — the list itself does not depend on it.
      error: () => this.areas.set([]),
    });

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
    this.service.list(
      {
        amenityId: this.amenityControl.value || null,
        apartmentId: this.apartmentControl.value || null,
        status: this.statusControl.value || null,
        // `GET /reservations` does not accept a payment filter yet — the column
        // reports it, but narrowing by it has to happen server-side.
        paymentUploaded: null,
        fromUtc: this.fromControl.value ? toFromUtc(this.fromControl.value) : null,
        toUtc: this.toControl.value ? toToUtc(this.toControl.value) : null,
      },
      SORT,
      page,
      this.pageSize,
    );
  }
}
