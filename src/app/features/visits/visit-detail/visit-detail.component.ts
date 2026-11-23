import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { finalize } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { formatDay } from '../../dashboard/data-access/date-range';
import { formatInstant } from '../../reservations/data-access/reservation-format';
import { VISITS_CHECKIN, VISITS_EDIT } from '../data-access/visit.permissions';
import {
  normalizeVehiclePlate,
  VISIT_KIND_LABEL,
  VISIT_STATUS_BADGE,
  VISIT_STATUS_LABEL,
  VISIT_VEHICLE_PLATE_MAX_LENGTH,
  VisitDetailDto,
  visitDisplayName,
} from '../data-access/visit.models';
import { VisitsService } from '../data-access/visits.service';
import { VisitCheckInComponent } from '../visit-check-in/visit-check-in.component';

/**
 * Visit detail: who is expected, where, when it is valid, and its entries
 * (check-ins) newest first. A Scheduled visit can be checked in from here
 * through `VisitCheckInComponent`.
 *
 * The vehicle plate is the one field editable in place (`PUT
 * /visits/{id}/vehicle-plate`, in any status): the guard is the one who sees the
 * car, so `visits.checkin` may correct it as well as `visits.edit`.
 */
@Component({
  selector: 'app-visit-detail',
  standalone: true,
  imports: [
    PageHeaderComponent,
    SpinnerComponent,
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    VisitCheckInComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit-detail.component.html',
})
export class VisitDetailComponent {
  private readonly service = inject(VisitsService);
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);

  readonly visit = signal<VisitDetailDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly kindLabel = VISIT_KIND_LABEL;
  readonly statusLabel = VISIT_STATUS_LABEL;
  readonly statusBadge = VISIT_STATUS_BADGE;
  readonly formatInstant = formatInstant;
  readonly formatDay = formatDay;

  readonly title = computed(() => {
    const v = this.visit();
    return v ? visitDisplayName(v) : 'Visita';
  });
  readonly apartment = computed(() => {
    const a = this.visit()?.apartment;
    return a ? apartmentLabel(a) : '—';
  });
  /** Newest first, whatever order the API sends. */
  readonly entries = computed(() =>
    [...(this.visit()?.entries ?? [])].sort((a, b) => b.enteredAtUtc.localeCompare(a.enteredAtUtc)),
  );

  /** Hiding the pencil is UX; the API answers 404 to a caller who may not edit. */
  readonly canEditPlate = computed(
    () =>
      !this.permissions.loaded() ||
      this.permissions.has(VISITS_EDIT) ||
      this.permissions.has(VISITS_CHECKIN),
  );
  readonly editingPlate = signal(false);
  readonly savingPlate = signal(false);
  readonly plateError = signal<string | null>(null);
  readonly plateControl = new FormControl('', {
    nonNullable: true,
    validators: [plateLength],
  });
  readonly plateMaxLength = VISIT_VEHICLE_PLATE_MAX_LENGTH;

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() {
    this.load();
  }

  /** After a check-in the status and the entries both changed — refetch quietly. */
  onCheckedIn(): void {
    this.load();
  }

  startPlateEdit(): void {
    this.plateControl.reset(this.visit()?.vehiclePlate ?? '');
    this.plateError.set(null);
    this.editingPlate.set(true);
  }

  cancelPlateEdit(): void {
    this.editingPlate.set(false);
    this.plateError.set(null);
  }

  /** An empty field clears the plate (null). */
  savePlate(): void {
    if (this.savingPlate()) return;
    this.plateControl.markAsTouched();
    if (this.plateControl.invalid) return;

    const plate = normalizeVehiclePlate(this.plateControl.value);
    const visit = this.visit();
    if (!visit) return;
    if (plate === visit.vehiclePlate) {
      this.editingPlate.set(false);
      return;
    }

    this.savingPlate.set(true);
    this.plateError.set(null);
    this.service
      .changeVehiclePlate(visit.id, plate)
      .pipe(finalize(() => this.savingPlate.set(false)))
      .subscribe({
        next: () => {
          // 204 with no body: patch the row with the same normalization the API applies.
          this.visit.update((v) => (v ? { ...v, vehiclePlate: plate } : v));
          this.editingPlate.set(false);
          this.notifications.success(plate ? 'Placa actualizada' : 'Placa eliminada');
        },
        error: (e: HttpErrorResponse) => this.plateError.set(toMessage(e)),
      });
  }

  validity(v: VisitDetailDto): string {
    return v.validFrom === v.validUntil
      ? formatDay(v.validFrom)
      : `${formatDay(v.validFrom)} – ${formatDay(v.validUntil)}`;
  }

  private load(): void {
    this.service
      .getById(this.id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (v) => this.visit.set(v),
        error: (e: HttpErrorResponse) => this.error.set(toMessage(e)),
      });
  }
}

/** The domain caps the NORMALIZED plate, so dashes and spaces typed in do not count. */
function plateLength(control: AbstractControl<string>): ValidationErrors | null {
  const plate = normalizeVehiclePlate(control.value);
  return plate && plate.length > VISIT_VEHICLE_PLATE_MAX_LENGTH ? { plateLength: true } : null;
}
