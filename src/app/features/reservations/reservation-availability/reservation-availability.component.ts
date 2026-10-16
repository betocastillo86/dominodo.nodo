import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { forkJoin } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { formatSchedule, parseSchedule } from '../../../shared/ui/schedule-editor/schedule.model';
import { slotsToScheduleValue } from '../../tenant-info/amenities/data-access/amenity-schedule';
import { ReservationAvailabilityService } from '../data-access/reservation-availability.service';
import { formatCurrencyCOP, formatLongDate, formatTimeOfDay } from '../data-access/reservation-format';
import {
  AmenityAvailability,
  AmenityAvailabilitySlot,
  AmenityDetail,
  BLOCKING_RESERVATION_STATUSES,
  MyReservation,
} from '../data-access/reservation-availability.models';
import { DayAvailability, MonthCalendarComponent } from '../month-calendar/month-calendar.component';
import { daysInMonth, MONTH_NAMES_ES, toIsoDate } from '../month-calendar/month-grid';

type ViewState = 'loading' | 'error' | 'ready';

/**
 * Resident booking screen for a social area (ADR-0018). Reached only through a
 * redeemed handoff session (`handoffGuard` on the `/reservas` route) — every
 * call this screen makes runs as that session, never the portal's own.
 *
 * The amenity comes in via `?amenityId=` on the handoff link, a param the API
 * never carries (it only knows `/acceso?t=`, ADR-0017 §3) — Domi appends it
 * before sending the link, and `AccesoComponent` forwards it here verbatim.
 *
 * Scope today: show the area, this month's calendar (available / unavailable /
 * the resident's own booking), and the chosen day's time ranges. Creating a
 * booking is the next phase.
 */
@Component({
  selector: 'app-reservation-availability',
  standalone: true,
  imports: [TablerIconComponent, SpinnerComponent, EmptyStateComponent, MonthCalendarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-availability.component.html',
  styles: `
    /* Sized for a thumb from the start — these become the booking tap targets
       in the next phase, and a Tabler badge is far below 44px. */
    .slot-chip {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      font-size: 0.9375rem;
      white-space: nowrap;
    }
  `,
})
export class ReservationAvailabilityComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reservations = inject(ReservationAvailabilityService);
  readonly tenant = inject(TenantStore);

  readonly state = signal<ViewState>('loading');
  readonly errorMessage = signal<string | null>(null);

  readonly amenity = signal<AmenityDetail | null>(null);
  readonly availability = signal<AmenityAvailability | null>(null);
  readonly myReservations = signal<MyReservation[]>([]);

  private readonly now = new Date();
  readonly year = signal(this.now.getFullYear());
  readonly month = signal(this.now.getMonth() + 1);
  readonly selectedDate = signal<string | null>(null);
  readonly today = toIsoDate(this.now.getFullYear(), this.now.getMonth() + 1, this.now.getDate());

  readonly monthLabel = computed(() => `${MONTH_NAMES_ES[this.month() - 1]} ${this.year()}`);

  readonly canGoPrev = computed(
    () =>
      this.year() > this.now.getFullYear() ||
      (this.year() === this.now.getFullYear() && this.month() > this.now.getMonth() + 1),
  );

  /** The area's opening hours, rendered as the same sentence the admin schedule editor would show. */
  readonly scheduleText = computed(() => {
    const policy = this.amenity()?.policy;
    if (!policy) return null;
    const schedule = parseSchedule(slotsToScheduleValue(policy.openingHours));
    return schedule ? formatSchedule(schedule) : null;
  });

  private readonly ownReservationDates = computed(() => {
    const amenityId = this.amenity()?.id;
    const dates = new Set<string>();
    if (!amenityId) return dates;
    for (const reservation of this.myReservations()) {
      if (
        reservation.amenityId === amenityId &&
        BLOCKING_RESERVATION_STATUSES.includes(reservation.status)
      ) {
        dates.add(reservation.dateLocal);
      }
    }
    return dates;
  });

  readonly dayAvailability = computed<ReadonlyMap<string, DayAvailability>>(() => {
    const map = new Map<string, DayAvailability>();
    const availability = this.availability();
    if (!availability) return map;

    const ownDates = this.ownReservationDates();
    for (const day of availability.days) {
      map.set(day.date, {
        hasAvailability: day.slots.some((slot) => slot.isAvailable),
        hasOwnReservation: ownDates.has(day.date),
      });
    }
    return map;
  });

  readonly selectedDaySlots = computed<AmenityAvailabilitySlot[]>(() => {
    const date = this.selectedDate();
    const availability = this.availability();
    if (!date || !availability) return [];
    return availability.days.find((day) => day.date === date)?.slots ?? [];
  });

  readonly selectedDayOwnReservations = computed<MyReservation[]>(() => {
    const date = this.selectedDate();
    const amenityId = this.amenity()?.id;
    if (!date || !amenityId) return [];
    return this.myReservations().filter(
      (reservation) =>
        reservation.dateLocal === date &&
        reservation.amenityId === amenityId &&
        BLOCKING_RESERVATION_STATUSES.includes(reservation.status),
    );
  });

  private amenityId: string | null = null;

  private readonly dayPanel = viewChild<ElementRef<HTMLElement>>('dayPanel');

  constructor() {
    // On a phone the day panel renders below a full-height calendar, so without
    // this a tap looks like it did nothing. `block: 'nearest'` makes it a no-op
    // when the panel is already on screen, which is the desktop case.
    effect(() => {
      const panel = this.dayPanel();
      if (panel && this.selectedDate()) {
        panel.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  ngOnInit(): void {
    this.amenityId = this.route.snapshot.queryParamMap.get('amenityId');
    if (!this.amenityId) {
      this.fail('No se especificó un área social. Vuelve a intentarlo desde el enlace que te compartieron.');
      return;
    }
    this.loadAmenity(this.amenityId);
  }

  prevMonth(): void {
    if (this.canGoPrev()) {
      this.shiftMonth(-1);
    }
  }

  nextMonth(): void {
    this.shiftMonth(1);
  }

  selectDay(date: string): void {
    this.selectedDate.set(this.selectedDate() === date ? null : date);
  }

  retry(): void {
    if (this.amenityId) {
      this.loadAmenity(this.amenityId);
    }
  }

  formatTime(time: string): string {
    return formatTimeOfDay(time);
  }

  formatDate(isoDate: string): string {
    return formatLongDate(isoDate);
  }

  formatPrice(amount: number): string {
    return formatCurrencyCOP(amount);
  }

  private shiftMonth(delta: number): void {
    const next = new Date(this.year(), this.month() - 1 + delta, 1);
    this.year.set(next.getFullYear());
    this.month.set(next.getMonth() + 1);
    this.selectedDate.set(null);
    if (this.amenityId) {
      this.loadAvailabilityAndReservations(this.amenityId);
    }
  }

  private loadAmenity(amenityId: string): void {
    this.state.set('loading');
    this.reservations.getAmenity(amenityId).subscribe({
      next: (amenity) => {
        this.amenity.set(amenity);
        this.loadAvailabilityAndReservations(amenityId);
      },
      error: (error: unknown) => this.onError(error, 'No encontramos esta área social.'),
    });
  }

  private loadAvailabilityAndReservations(amenityId: string): void {
    const { from, to } = this.monthRange();
    forkJoin({
      availability: this.reservations.getAvailability(amenityId, from, to),
      mine: this.reservations.getMyReservations(),
    }).subscribe({
      next: ({ availability, mine }) => {
        this.availability.set(availability);
        this.myReservations.set(mine.items);
        this.state.set('ready');
      },
      error: (error: unknown) =>
        this.onError(error, 'Esta área no está disponible para reservar en este momento.'),
    });
  }

  private monthRange(): { from: string; to: string } {
    const year = this.year();
    const month = this.month();
    return { from: toIsoDate(year, month, 1), to: toIsoDate(year, month, daysInMonth(year, month)) };
  }

  private onError(error: unknown, notFoundMessage: string): void {
    if (error instanceof HttpErrorResponse) {
      // Missing area, another conjunto's area, or one Out of Service all answer
      // 404 here (ADR-0018 §8 keeps this read's known inconsistency with the
      // rest of the module, which answers 403 inside the conjunto).
      this.fail(error.status === 404 ? notFoundMessage : toMessage(error));
      return;
    }
    this.fail('No pudimos cargar la información. Verifica tu conexión e intenta de nuevo.');
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.state.set('error');
  }
}
