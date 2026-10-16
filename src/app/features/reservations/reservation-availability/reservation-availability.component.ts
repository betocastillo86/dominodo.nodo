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
  TemplateRef,
  viewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { finalize, forkJoin } from 'rxjs';
import { domiWhatsAppUrl } from '../../../core/handoff/domi-whatsapp';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { formatSchedule, parseSchedule } from '../../../shared/ui/schedule-editor/schedule.model';
import { slotsToScheduleValue } from '../../tenant-info/amenities/data-access/amenity-schedule';
import { ReservationAvailabilityService } from '../data-access/reservation-availability.service';
import { toBookingFailure } from '../data-access/reservation-errors';
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
import { ReservationSuccessComponent } from '../reservation-success/reservation-success.component';

type ViewState = 'loading' | 'error' | 'ready' | 'booked';

/**
 * Resident booking screen for a social area (ADR-0018). Reached only through a
 * redeemed handoff session (`handoffGuard` on the `/reservas` route) — every
 * call this screen makes runs as that session, never the portal's own.
 *
 * The amenity comes in via `?amenityId=` on the handoff link, a param the API
 * never carries (it only knows `/acceso?t=`, ADR-0017 §3) — Domi appends it
 * before sending the link, and `AccesoComponent` forwards it here verbatim.
 *
 * The whole flow lives here, on one screen: pick a day, pick one of that day's
 * free windows, confirm, and land on the booking's code. One window per
 * booking, always the area's minimum duration — that is the atomic bookable
 * unit the availability endpoint generates (ADR-0018 §3), so echoing a slot
 * back is the only shape the server is guaranteed to accept.
 */
@Component({
  selector: 'app-reservation-availability',
  standalone: true,
  imports: [
    TablerIconComponent,
    SpinnerComponent,
    EmptyStateComponent,
    MonthCalendarComponent,
    ReservationSuccessComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-availability.component.html',
  styles: `
    /* Sized for a thumb: these are the booking's tap targets, and a Tabler
       badge is far below 44px. */
    .slot-chip {
      display: inline-flex;
      align-items: center;
      min-height: 2.75rem;
      font-size: 0.9375rem;
      white-space: nowrap;
      border: 1px solid transparent;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    .slot-chip:not(:disabled):active {
      filter: brightness(0.94);
    }
    @media (hover: hover) {
      .slot-chip:not(:disabled):hover {
        filter: brightness(0.97);
      }
    }
    .book-btn {
      min-height: 2.75rem;
      touch-action: manipulation;
    }
  `,
})
export class ReservationAvailabilityComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reservations = inject(ReservationAvailabilityService);
  private readonly modal = inject(NgbModal);
  private readonly notifications = inject(NotificationService);
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

  // ── Booking ────────────────────────────────────────────────────────────────

  readonly selectedSlot = signal<AmenityAvailabilitySlot | null>(null);
  readonly attendees = signal(1);
  readonly booking = signal(false);
  readonly bookingError = signal<string | null>(null);
  readonly createdReservation = signal<MyReservation | null>(null);

  readonly whatsAppUrl = domiWhatsAppUrl();

  readonly maxAttendees = computed(() => this.amenity()?.maxOccupancy ?? 1);

  readonly attendeesValid = computed(() => {
    const value = this.attendees();
    return Number.isInteger(value) && value >= 1 && value <= this.maxAttendees();
  });

  /**
   * What the resident has to know BEFORE confirming: whether the booking is
   * born `Confirmed` or `Pending` (ADR-0018 §2). Finding that out afterwards is
   * how a resident walks away believing a slot is theirs when it is not.
   */
  readonly bookingNotice = computed(() => {
    const amenity = this.amenity();
    if (!amenity) return null;

    const needsApproval = amenity.requiresApproval;
    const needsPayment = amenity.policy.paymentRequired;

    if (needsApproval && needsPayment) {
      return 'Esta área requiere pago y aprobación de la administración, así que tu reserva quedará pendiente.';
    }
    if (needsPayment) {
      return 'Esta área requiere pago, así que tu reserva quedará pendiente hasta que la administración lo confirme.';
    }
    if (needsApproval) {
      return 'Esta área requiere aprobación de la administración, así que tu reserva quedará pendiente.';
    }
    return null;
  });

  readonly selectedDateLabel = computed(() => {
    const date = this.selectedDate();
    return date ? formatLongDate(date) : '';
  });

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

  readonly hasFreeSlots = computed(() => this.selectedDaySlots().some((slot) => slot.isAvailable));

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
  private readonly bookAction = viewChild<ElementRef<HTMLElement>>('bookAction');

  /**
   * Held so the component closes the confirmation itself. The template
   * context's `$implicit` is the NgbActiveModal, so handing `modal.close` to a
   * handler would strip its `this` — keep the ref here instead.
   */
  private confirmModal: NgbModalRef | null = null;

  constructor() {
    // The screen follows the resident down the flow, because each step renders
    // BELOW the one that triggered it: on a phone the day's windows sit under a
    // full-height calendar, and a tap whose result is off-screen reads as broken.
    effect(() => {
      const panel = this.dayPanel();
      if (panel && this.selectedDate()) {
        this.reveal(panel.nativeElement);
      }
    });

    // Same problem one step later, and worse the more windows the day has: the
    // Reservar button is born under a list that can be taller than the screen.
    effect(() => {
      const action = this.bookAction();
      if (action && this.selectedSlot()) {
        this.reveal(action.nativeElement);
      }
    });
  }

  /**
   * Brings an element into view, and leaves the page alone when it already is.
   *
   * Not `scrollIntoView({ block: 'nearest' })`: that stops as soon as the
   * nearest EDGE is visible, so a button one pixel below the fold — or a long
   * list of windows — stays half-hidden, which is exactly the case this screen
   * hits on a phone. The 16px margin keeps something sitting flush against a
   * browser toolbar from counting as visible.
   */
  private reveal(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top >= 0 && rect.bottom <= viewport - 16) {
      return;
    }
    // Centred where it fits; anchored to its top where it cannot, so a tall
    // panel shows its heading and first rows instead of its bottom edge.
    element.scrollIntoView({
      behavior: 'smooth',
      block: rect.height > viewport ? 'start' : 'center',
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
    this.selectedSlot.set(null);
  }

  selectSlot(slot: AmenityAvailabilitySlot): void {
    if (!slot.isAvailable) return;
    const current = this.selectedSlot();
    this.selectedSlot.set(current?.startsAtUtc === slot.startsAtUtc ? null : slot);
  }

  isSelected(slot: AmenityAvailabilitySlot): boolean {
    return this.selectedSlot()?.startsAtUtc === slot.startsAtUtc;
  }

  openConfirm(tpl: TemplateRef<unknown>): void {
    if (!this.selectedSlot()) return;
    this.bookingError.set(null);
    this.attendees.set(1);
    // Scrollable as well as centered: on a 360×640 screen the details, the
    // attendee field and the pending-booking notice together can outgrow the
    // viewport, and a modal that cannot scroll hides its own confirm button.
    this.confirmModal = this.modal.open(tpl, { centered: true, scrollable: true });
    this.confirmModal.result.then(
      () => (this.confirmModal = null),
      () => (this.confirmModal = null),
    );
  }

  setAttendees(event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.attendees.set(Number.isNaN(value) ? 0 : Math.trunc(value));
  }

  confirmBooking(): void {
    const amenityId = this.amenityId;
    const slot = this.selectedSlot();
    if (!amenityId || !slot || !this.attendeesValid() || this.booking()) return;

    this.booking.set(true);
    this.bookingError.set(null);

    this.reservations
      .create({
        amenityId,
        startsAtUtc: slot.startsAtUtc,
        endsAtUtc: slot.endsAtUtc,
        attendees: this.attendees(),
      })
      .pipe(finalize(() => this.booking.set(false)))
      .subscribe({
        next: (reservation) => {
          this.createdReservation.set(reservation);
          this.closeConfirm();
          this.state.set('booked');
        },
        error: (error: unknown) => this.onBookingError(error),
      });
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

  /**
   * A rejected booking is either the resident's own situation — which they read
   * inside the dialog and can act on — or proof that the calendar on screen is
   * already stale, and then the dialog has to get out of the way so they can
   * see the corrected calendar underneath (ADR-0018 §8: a free-looking slot can
   * still be refused).
   */
  private onBookingError(error: unknown): void {
    const failure = toBookingFailure(error);

    if (!failure.staleAvailability) {
      this.bookingError.set(failure.message);
      return;
    }

    this.closeConfirm();
    this.notifications.error(failure.message);
    this.selectedSlot.set(null);
    if (this.amenityId) {
      this.loadAvailabilityAndReservations(this.amenityId);
    }
  }

  private closeConfirm(): void {
    this.confirmModal?.close();
    this.confirmModal = null;
  }

  private shiftMonth(delta: number): void {
    const next = new Date(this.year(), this.month() - 1 + delta, 1);
    this.year.set(next.getFullYear());
    this.month.set(next.getMonth() + 1);
    this.selectedDate.set(null);
    this.selectedSlot.set(null);
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
    this.closeConfirm();
    this.errorMessage.set(message);
    this.state.set('error');
  }
}
