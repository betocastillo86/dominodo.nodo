import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { catchError, combineLatest, finalize, map, of, startWith, switchMap, tap } from 'rxjs';
import { errorCode, toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
} from '../../../shared/ui/search-select/search-select.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  apartmentLabel,
  RELATION_LABEL,
  ResidentDto,
} from '../../apartments/data-access/apartment.models';
import { todayInReportZone } from '../../dashboard/data-access/date-range';
import type { AmenityAvailabilitySlot } from '../../reservations/data-access/reservation-availability.models';
import {
  formatCurrencyCOP,
  formatLongDate,
  formatTimeOfDay,
} from '../../reservations/data-access/reservation-format';
import type {
  AmenityDetail,
  AmenityListItem,
} from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityOptionsService } from '../data-access/amenity-options.service';
import { ApartmentOptionsService } from '../data-access/apartment-options.service';
import { RESERVATION_STATUS_LABEL } from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/**
 * The "holder" select's explicit "nobody" choice: the booking stays held by the
 * administrator, as every staff booking was before ADR-0028. A sentinel rather
 * than `''` so the control's `required` still catches an untouched select —
 * leaving the holder out must be a decision, not a forgotten field.
 */
const NO_HOLDER = 'none';

/** Codes that mean the slot picked no longer holds: reload the day and pick again. */
const STALE_SLOT_CODES = [
  'Reservation.SlotTaken',
  'Reservation.SlotBlocked',
  'Reservation.DayAlreadyBooked',
  'Reservation.StartInPast',
  'Reservation.WindowInvalid',
  'Reservation.StartNotOnTheHour',
  'Reservation.DurationNotWholeHours',
  'Reservation.DurationTooShort',
  'Reservation.DurationTooLong',
  'Reservation.CrossesMidnight',
  'Reservation.OutsideOpeningHours',
];

/** Which control a domain error code points at, so it shows under that field. */
const CODE_TO_CONTROL: Record<string, string> = {
  'Reservation.AmenityNotFound': 'amenityId',
  'Reservation.AmenityNotAvailable': 'amenityId',
  'Reservation.ApartmentRequired': 'apartmentId',
  'Reservation.ApartmentNotFound': 'apartmentId',
  'Reservation.AttendeesRequired': 'attendees',
  'Reservation.AttendeesExceedCapacity': 'attendees',
  'Reservation.BeneficiaryNotResident': 'holder',
  'Residency.NotLivingInApartment': 'holder',
};

/**
 * The catalog's copy for these speaks TO a resident ("No figuras…"); on this
 * screen the subject is the person the administrator picked.
 */
const ADMIN_COPY: Record<string, string> = {
  'Residency.NotLivingInApartment':
    'Esta persona no vive en el apartamento. Solo quien vive ahí puede ser titular de la reserva.',
};

/** Why a slot chip is disabled, as its tooltip. */
const UNAVAILABLE_REASON: Record<string, string> = {
  Past: 'Ya pasó',
  Booked: 'Ya reservado',
  DayAlreadyBooked: 'El área ya tiene una reserva ese día',
};

/**
 * "Nueva reserva": the administrator books a social area on an apartment's
 * behalf (`POST /reservations`, staff branch with `reservations.create`), and
 * names the resident who HOLDS it (`onBehalfOfUserId`, ADR-0028) — the holder
 * is who then sees it in Domi, gets its notices and can cancel it or send the
 * comprobante. Only an active resident who LIVES in the apartment can hold it;
 * the rest are listed but disabled, so the reason is visible instead of a 400.
 *
 * The window is one slot of `GET /amenities/{id}/availability` echoed back
 * verbatim, exactly as the resident screen does: the slot is the area's
 * minimum booking, and echoing it is how client and server agree on it.
 */
@Component({
  selector: 'app-reservation-admin-create',
  standalone: true,
  imports: [
    PageHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    SearchSelectComponent,
    SpinnerComponent,
    TablerIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-admin-create.component.html',
})
export class ReservationAdminCreateComponent {
  private readonly service = inject(ReservationsAdminService);
  private readonly amenityOptions = inject(AmenityOptionsService);
  private readonly apartmentOptions = inject(ApartmentOptionsService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly today = todayInReportZone();
  readonly noHolder = NO_HOLDER;
  readonly relationLabel = RELATION_LABEL;
  readonly unavailableReason = UNAVAILABLE_REASON;
  readonly formatTime = formatTimeOfDay;

  readonly form = new FormGroup({
    amenityId: new FormControl<string | null>(null, [Validators.required]),
    apartmentId: new FormControl<string | null>(null, [Validators.required]),
    holder: new FormControl<string | null>(null, [Validators.required]),
    date: new FormControl(this.today, { nonNullable: true, validators: [Validators.required] }),
    attendees: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
  });

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  // ── Área social ────────────────────────────────────────────────────────────

  /** Only areas in service can be booked; an out-of-service one 404s on create. */
  readonly areas = toSignal(
    this.amenityOptions.list().pipe(
      map((items) => items.filter((a) => a.status === 'Active')),
      catchError(() => of<AmenityListItem[]>([])),
    ),
    { initialValue: null },
  );

  private readonly amenityId = toSignal(this.form.controls.amenityId.valueChanges, {
    initialValue: null,
  });

  /** The chosen area in full — the list row has no policy (price, payment, limits). */
  readonly amenity = toSignal(
    this.form.controls.amenityId.valueChanges.pipe(
      switchMap((id) =>
        id
          ? this.amenityOptions.getById(id).pipe(catchError(() => of<AmenityDetail | null>(null)))
          : of(null),
      ),
    ),
    { initialValue: null },
  );

  /** What the booking will be born as, so a Pendiente is not a surprise. */
  readonly outcome = computed(() => {
    const amenity = this.amenity();
    if (!amenity) return null;
    const pending = amenity.requiresApproval || amenity.policy.paymentRequired;
    return RESERVATION_STATUS_LABEL[pending ? 'Pending' : 'Confirmed'];
  });

  readonly priceLabel = computed(() => {
    const price = this.amenity()?.policy.price;
    return price == null ? null : formatCurrencyCOP(price);
  });

  // ── Apartamento y titular ──────────────────────────────────────────────────

  readonly searchApartments: SearchSelectFn = (term) =>
    this.apartmentOptions
      .search(term)
      .pipe(map((items) => items.map((a) => ({ value: a.id, label: apartmentLabel(a) }))));

  readonly residentsLoading = signal(false);
  readonly residentsError = signal<string | null>(null);

  /** The apartment's ACTIVE residents, those who live there first. */
  readonly residents = toSignal(
    this.form.controls.apartmentId.valueChanges.pipe(
      tap(() => {
        this.residentsError.set(null);
        this.form.controls.holder.reset(null);
      }),
      switchMap((id) => {
        if (!id) return of<ResidentDto[]>([]);
        this.residentsLoading.set(true);
        return this.apartmentOptions.residents(id).pipe(
          // One person can hold several active rows here; living there through any counts.
          map((rows) =>
            rows
              .filter((r) => r.isActive)
              .sort((a, b) => Number(b.livesHere) - Number(a.livesHere))
              .filter((r, i, all) => all.findIndex((o) => o.userId === r.userId) === i),
          ),
          catchError((error: HttpErrorResponse) => {
            this.residentsError.set(toMessage(error));
            return of<ResidentDto[]>([]);
          }),
          finalize(() => this.residentsLoading.set(false)),
        );
      }),
      // The only resident who can hold it is the obvious choice; preselect it.
      tap((rows) => {
        const dwellers = rows.filter((r) => r.livesHere);
        if (dwellers.length === 1) this.form.controls.holder.setValue(dwellers[0].userId);
      }),
    ),
    { initialValue: [] as ResidentDto[] },
  );

  readonly hasApartment = toSignal(
    this.form.controls.apartmentId.valueChanges.pipe(map((id) => !!id)),
    { initialValue: false },
  );

  // ── Fecha y horario ────────────────────────────────────────────────────────

  readonly selectedSlot = signal<AmenityAvailabilitySlot | null>(null);
  readonly slotsLoading = signal(false);
  readonly slotsError = signal<string | null>(null);
  /** Bumped to re-read the day after a create that found the slot gone. */
  private readonly reloadSlots = signal(0);

  private readonly date = toSignal(this.form.controls.date.valueChanges, {
    initialValue: this.form.controls.date.value,
  });

  readonly slots = toSignal(
    combineLatest([
      this.form.controls.amenityId.valueChanges.pipe(startWith(this.form.controls.amenityId.value)),
      this.form.controls.date.valueChanges.pipe(startWith(this.form.controls.date.value)),
      toObservable(this.reloadSlots),
    ]).pipe(
      tap(() => {
        this.selectedSlot.set(null);
        this.slotsError.set(null);
      }),
      switchMap(([amenityId, date]) => {
        if (!amenityId || !date) return of<AmenityAvailabilitySlot[]>([]);
        this.slotsLoading.set(true);
        return this.service.getDayAvailability(amenityId, date).pipe(
          map((availability) => availability.days.find((d) => d.date === date)?.slots ?? []),
          catchError((error: HttpErrorResponse) => {
            this.slotsError.set(toMessage(error));
            return of<AmenityAvailabilitySlot[]>([]);
          }),
          finalize(() => this.slotsLoading.set(false)),
        );
      }),
    ),
    { initialValue: [] as AmenityAvailabilitySlot[] },
  );

  readonly dateLabel = computed(() => {
    const date = this.date();
    return date ? formatLongDate(date) : null;
  });

  readonly canPickSlots = computed(() => !!this.amenityId() && !!this.date());
  readonly slotMissing = computed(() => this.submitted() && !this.selectedSlot());

  /** The area's capacity, the attendees' ceiling — checked on submit; the API checks it too. */
  readonly maxOccupancy = computed(() => {
    const id = this.amenityId();
    return this.areas()?.find((a) => a.id === id)?.maxOccupancy ?? null;
  });

  residentLabel(resident: ResidentDto): string {
    const name = resident.user?.fullName || resident.user?.phone || 'Residente sin nombre';
    const relation = RELATION_LABEL[resident.relationType];
    return resident.livesHere ? `${name} · ${relation}` : `${name} · ${relation} (no vive aquí)`;
  }

  selectSlot(slot: AmenityAvailabilitySlot): void {
    if (!slot.isAvailable) return;
    this.error.set(null);
    this.selectedSlot.set(this.isSelected(slot) ? null : slot);
  }

  isSelected(slot: AmenityAvailabilitySlot): boolean {
    return this.selectedSlot()?.startsAtUtc === slot.startsAtUtc;
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (this.submitted() || control.touched);
  }

  /** The Spanish message for one control's first error. */
  message(name: keyof typeof this.form.controls): string {
    const errors = this.form.controls[name].errors ?? {};
    if (errors['server']) return errors['server'];
    if (errors['required']) return 'Este campo es obligatorio.';
    if (errors['min']) return 'Debe ser al menos 1.';
    if (errors['overCapacity']) return `El aforo del área es de ${errors['overCapacity']} personas.`;
    return 'Revisa este campo.';
  }

  submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.form.markAllAsTouched();

    const max = this.maxOccupancy();
    const attendees = this.form.controls.attendees;
    if (max != null && (attendees.value ?? 0) > max) {
      attendees.setErrors({ overCapacity: max });
    }

    const slot = this.selectedSlot();
    if (this.form.invalid || !slot) return;

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service
      .create({
        amenityId: v.amenityId!,
        apartmentId: v.apartmentId!,
        onBehalfOfUserId: v.holder === NO_HOLDER ? null : v.holder,
        startsAtUtc: slot.startsAtUtc,
        endsAtUtc: slot.endsAtUtc,
        attendees: v.attendees!,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (reservation) => {
          this.notifications.success(
            `Reserva ${reservation.code} creada (${RESERVATION_STATUS_LABEL[reservation.status].toLowerCase()})`,
          );
          this.router.navigate(['/reservations', reservation.id]);
        },
        error: (error: unknown) => this.handleError(error),
      });
  }

  private handleError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.error.set('No pudimos crear la reserva. Inténtalo de nuevo en un momento.');
      return;
    }

    const code = errorCode(error);
    const message = ADMIN_COPY[code] ?? toMessage(error);

    if (STALE_SLOT_CODES.includes(code)) {
      this.error.set(`${message} Actualizamos los horarios del día.`);
      this.reloadSlots.update((n) => n + 1);
      return;
    }

    const target = CODE_TO_CONTROL[code];
    if (target) {
      this.form.get(target)?.setErrors({ server: message });
      return;
    }
    this.error.set(message);
  }
}
