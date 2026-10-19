import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
  TemplateRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../../core/http/problem-details';
import { NotificationService } from '../../../../core/notifications/notification.service';
import { ScheduleEditorComponent } from '../../../../shared/ui/schedule-editor/schedule-editor.component';
import { SpinnerComponent } from '../../../../shared/ui/spinner/spinner.component';
import { AmenityPhotosEditorComponent } from '../amenity-photos-editor/amenity-photos-editor.component';
import { AmenitiesService } from '../data-access/amenities.service';
import {
  scheduleValueToSlots,
  slotsToScheduleValue,
} from '../data-access/amenity-schedule';
import {
  AMENITY_DEFAULT_CANCEL_BEFORE_DAYS,
  AMENITY_MAX_CANCEL_BEFORE_DAYS,
  AMENITY_MIN_PHOTOS,
  AMENITY_NAME_MAX_LENGTH,
  AMENITY_POLICY_TEXT_MAX_LENGTH,
  AmenityPhoto,
  AmenityStatus,
  CreateAmenityRequest,
} from '../data-access/amenity.models';

type FormMode = 'create' | 'edit';

/** `maxHours` (when present) may not be shorter than `minHours` — mirrors `ReservationPolicy.Create`. */
function hoursRangeValidator(group: AbstractControl): ValidationErrors | null {
  const min = group.get('minHours')?.value;
  const max = group.get('maxHours')?.value;
  return max != null && min != null && max < min ? { hoursRange: true } : null;
}

/**
 * Create/edit form for an amenity ("área social", ADR-0016) — one component for
 * both modes, mirroring the rest of the portal's CRUD forms. Unlike those, the
 * status transitions (`activate` / `out-of-service`) are NOT part of the save:
 * they are their own endpoints, so the toggle only appears once editing an
 * existing amenity and acts immediately (confirmed, like Announcements'
 * publish/archive).
 *
 * The schedule reuses the SAME control as "Mi Conjunto → Contacto"
 * (`shared/ui/schedule-editor`) — day switches, several ranges per day, "copiar
 * a…" and the resident-facing preview — mounted without holidays and without
 * the "at least one open day" rule, the two points where the Amenity contract
 * differs (see `amenity-schedule.ts`). Photos stay outside the form, like the
 * branding logo: they are uploaded as they are picked, and only their keys ride
 * along on save.
 */
@Component({
  selector: 'app-amenity-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
    SpinnerComponent,
    AmenityPhotosEditorComponent,
    ScheduleEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amenity-form.component.html',
})
export class AmenityFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AmenitiesService);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);
  private readonly destroyRef = inject(DestroyRef);

  protected id = '';
  protected mode: FormMode = 'create';

  readonly loadingDetail = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly amenityName = signal('');
  readonly status = signal<AmenityStatus>('Active');
  readonly togglingStatus = signal(false);

  readonly initialPhotos = signal<readonly AmenityPhoto[]>([]);
  readonly photoKeys = signal<string[]>([]);

  readonly nameMaxLength = AMENITY_NAME_MAX_LENGTH;
  readonly textMaxLength = AMENITY_POLICY_TEXT_MAX_LENGTH;
  readonly minPhotos = AMENITY_MIN_PHOTOS;
  readonly maxCancelBeforeDays = AMENITY_MAX_CANCEL_BEFORE_DAYS;

  /**
   * The area's pending-expiry window. This portal does not edit it, but a save
   * replaces the whole policy document, so it is held here and sent back
   * untouched instead of being reset to "never expires".
   */
  private pendingExpiryHours: number | null = null;

  readonly form = this.fb.group(
    {
      name: this.fb.nonNullable.control('', [
        Validators.required,
        Validators.maxLength(AMENITY_NAME_MAX_LENGTH),
      ]),
      maxOccupancy: this.fb.nonNullable.control(1, [Validators.required, Validators.min(1)]),
      requiresApproval: this.fb.nonNullable.control(false),
      allowsMultiplePerDay: this.fb.nonNullable.control(false),
      minHours: this.fb.control<number | null>(1, [Validators.min(1)]),
      maxHours: this.fb.control<number | null>(null, [Validators.min(1)]),
      paymentRequired: this.fb.nonNullable.control(false),
      price: this.fb.control<number | null>(null),
      maxPerDayPerApartment: this.fb.control<number | null>(null, [Validators.min(1)]),
      usageRules: this.fb.nonNullable.control('', [
        Validators.maxLength(AMENITY_POLICY_TEXT_MAX_LENGTH),
      ]),
      additionalServices: this.fb.nonNullable.control('', [
        Validators.maxLength(AMENITY_POLICY_TEXT_MAX_LENGTH),
      ]),
      requiresGoodStanding: this.fb.nonNullable.control(false),
      // Required and never null: an omitted value does not mean "no window" on
      // the server, it means the default of seven days.
      cancelBeforeTotalDays: this.fb.nonNullable.control(AMENITY_DEFAULT_CANCEL_BEFORE_DAYS, [
        Validators.required,
        Validators.min(0),
        Validators.max(AMENITY_MAX_CANCEL_BEFORE_DAYS),
      ]),
      // The JSON envelope <app-schedule-editor> produces; mapped to/from the
      // API's `openingHours` slots by `amenity-schedule.ts`.
      schedules: this.fb.control<string | null>(null),
    },
    { validators: hoursRangeValidator },
  );

  /** Gates the inline "falta una foto" / schedule errors until the first save attempt. */
  readonly submitted = signal(false);

  readonly missingPhotos = computed(
    () => this.submitted() && this.photoKeys().length < this.minPhotos,
  );

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.mode = this.id ? 'edit' : 'create';

    this.form.controls.paymentRequired.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((required) => this.applyPriceRule(required));

    if (this.mode === 'edit') {
      this.fetch();
    }
  }

  onPhotoKeysChange(keys: string[]): void {
    this.photoKeys.set(keys);
  }

  submit(): void {
    if (this.saving()) return;
    this.submitted.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.photoKeys().length < this.minPhotos) {
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const request = this.toRequest();

    if (this.mode === 'create') {
      this.service.create(request).subscribe({
        next: () => this.onSaved('Área social creada.'),
        error: (error: HttpErrorResponse) => this.onSaveError(error),
      });
    } else {
      this.service.update(this.id, request).subscribe({
        next: () => this.onSaved('Área social actualizada.'),
        error: (error: HttpErrorResponse) => this.onSaveError(error),
      });
    }
  }

  confirmActivate(tpl: TemplateRef<unknown>): void {
    this.modal.open(tpl).result.then(
      () => this.runTransition(this.service.activate(this.id), 'Active', 'Área reactivada.'),
      () => undefined,
    );
  }

  confirmMarkOutOfService(tpl: TemplateRef<unknown>): void {
    this.modal.open(tpl).result.then(
      () =>
        this.runTransition(
          this.service.markOutOfService(this.id),
          'OutOfService',
          'Área puesta fuera de servicio.',
        ),
      () => undefined,
    );
  }

  private runTransition(
    action: ReturnType<AmenitiesService['activate']>,
    next: AmenityStatus,
    message: string,
  ): void {
    this.togglingStatus.set(true);
    action.subscribe({
      next: () => {
        this.togglingStatus.set(false);
        this.status.set(next);
        this.notifications.success(message);
      },
      error: (error: HttpErrorResponse) => {
        this.togglingStatus.set(false);
        this.notifications.error(toMessage(error));
      },
    });
  }

  private onSaved(message: string): void {
    this.notifications.success(message);
    void this.router.navigate(['/tenant-info/amenities']);
  }

  private onSaveError(error: HttpErrorResponse): void {
    this.saving.set(false);
    this.formError.set(toMessage(error));
    this.applyServerErrors(error);
  }

  /** Maps `errors[]` (PascalCase, possibly `Policy.X`) onto the matching control. */
  private applyServerErrors(error: HttpErrorResponse): void {
    const problem = error.error as { errors?: { property: string; message: string }[] } | undefined;
    for (const fieldError of problem?.errors ?? []) {
      const segment = fieldError.property.split('.').pop() ?? fieldError.property;
      const controlName = segment.charAt(0).toLowerCase() + segment.slice(1);
      const control = this.form.get(controlName);
      control?.setErrors({ server: fieldError.message });
    }
  }

  private applyPriceRule(required: boolean): void {
    const control = this.form.controls.price;
    if (required) {
      control.addValidators([Validators.required, Validators.min(0.01)]);
    } else {
      control.removeValidators([Validators.required, Validators.min(0.01)]);
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  private toRequest(): CreateAmenityRequest {
    const v = this.form.getRawValue();
    return {
      name: v.name.trim(),
      maxOccupancy: v.maxOccupancy,
      requiresApproval: v.requiresApproval,
      policy: {
        allowsMultiplePerDay: v.allowsMultiplePerDay,
        minHours: v.minHours,
        maxHours: v.maxHours,
        price: v.paymentRequired ? v.price : null,
        paymentRequired: v.paymentRequired,
        maxPerDayPerApartment: v.maxPerDayPerApartment,
        usageRules: v.usageRules.trim() ? v.usageRules.trim() : null,
        additionalServices: v.additionalServices.trim() ? v.additionalServices.trim() : null,
        requiresGoodStanding: v.requiresGoodStanding,
        pendingExpiryHours: this.pendingExpiryHours,
        cancelBeforeTotalDays: v.cancelBeforeTotalDays,
        openingHours: scheduleValueToSlots(v.schedules),
      },
      photoKeys: this.photoKeys(),
    };
  }

  private fetch(): void {
    this.loadingDetail.set(true);
    this.loadError.set(null);

    this.service.getById(this.id).subscribe({
      next: (detail) => {
        this.amenityName.set(detail.name);
        this.status.set(detail.status);
        this.initialPhotos.set(detail.photos);
        this.pendingExpiryHours = detail.policy.pendingExpiryHours;
        this.form.patchValue({
          name: detail.name,
          maxOccupancy: detail.maxOccupancy,
          requiresApproval: detail.requiresApproval,
          allowsMultiplePerDay: detail.policy.allowsMultiplePerDay,
          minHours: detail.policy.minHours,
          maxHours: detail.policy.maxHours,
          paymentRequired: detail.policy.paymentRequired,
          price: detail.policy.price,
          maxPerDayPerApartment: detail.policy.maxPerDayPerApartment,
          usageRules: detail.policy.usageRules ?? '',
          additionalServices: detail.policy.additionalServices ?? '',
          requiresGoodStanding: detail.policy.requiresGoodStanding,
          // A policy written before the rule existed reads back as null, and
          // that means the same as 0 — no window (`AmenityMappers.ToPolicyDto`).
          cancelBeforeTotalDays: detail.policy.cancelBeforeTotalDays ?? 0,
          schedules: slotsToScheduleValue(detail.policy.openingHours),
        });
        this.applyPriceRule(detail.policy.paymentRequired);
        this.loadingDetail.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loadingDetail.set(false);
      },
    });
  }
}
