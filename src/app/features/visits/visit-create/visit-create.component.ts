import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { catchError, finalize, map, Observable, of, switchMap, throwError } from 'rxjs';
import { errorCode, ProblemDetails, toMessage } from '../../../core/http/problem-details';
import { translateFieldError } from '../../../core/http/validation-messages';
import { NotificationService } from '../../../core/notifications/notification.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import {
  SearchSelectComponent,
  SearchSelectFn,
} from '../../../shared/ui/search-select/search-select.component';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { todayInReportZone } from '../../dashboard/data-access/date-range';
import { ApartmentOptionsService } from '../../reservations-admin/data-access/apartment-options.service';
import {
  CreateVisitRequest,
  VISIT_COMPANY_MAX_LENGTH,
  VISIT_DOCUMENT_MAX_LENGTH,
  VISIT_KIND_LABEL,
  VISIT_KINDS,
  VISIT_NAME_MAX_LENGTH,
  VISIT_PHONE_MAX_LENGTH,
  VISIT_PHOTO_CONTENT_TYPES,
  VISIT_PHOTO_MAX_BYTES,
  VisitKind,
} from '../data-access/visit.models';
import { VisitsService } from '../data-access/visits.service';

/** The photo's PUT to Blob Storage failed — nothing reached the API. */
class PhotoUploadError extends Error {}

/** Which control a domain error code points at, so it shows under that field. */
const CODE_TO_CONTROL: Record<string, string> = {
  'Visit.ApartmentRequired': 'apartmentId',
  'Visit.ApartmentNotFound': 'apartmentId',
  'Visit.CompanyNameRequired': 'companyName',
  'Visit.VisitorNameRequired': 'visitorName',
  'Visit.VisitorDocumentRequired': 'visitorDocument',
  'Visit.ValidFromInPast': 'validFrom',
  'Visit.InvalidRange': 'validUntil',
  'Visit.RangeTooLong': 'validUntil',
};

/**
 * "Nuevo visitante": the administrator pre-authorizes a visit on an apartment's
 * behalf (`POST /visits`, `visits.create`), as a resident would from Domi. The
 * fields follow the kind — a person (name + document) for Frecuente / Una vez,
 * a company for Domicilio — and only Frecuente takes a date range.
 *
 * Create-only: the API has no edit endpoint for a visit.
 */
@Component({
  selector: 'app-visit-create',
  standalone: true,
  imports: [
    PageHeaderComponent,
    ReactiveFormsModule,
    RouterLink,
    SearchSelectComponent,
    TablerIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit-create.component.html',
})
export class VisitCreateComponent {
  private readonly service = inject(VisitsService);
  private readonly apartmentOptions = inject(ApartmentOptionsService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  readonly kinds = VISIT_KINDS;
  readonly kindLabel = VISIT_KIND_LABEL;
  readonly nameMax = VISIT_NAME_MAX_LENGTH;
  readonly documentMax = VISIT_DOCUMENT_MAX_LENGTH;
  readonly companyMax = VISIT_COMPANY_MAX_LENGTH;
  readonly phoneMax = VISIT_PHONE_MAX_LENGTH;
  readonly today = todayInReportZone();

  readonly form = new FormGroup(
    {
      apartmentId: new FormControl<string | null>(null, [Validators.required]),
      kind: new FormControl<VisitKind>('OneTime', { nonNullable: true }),
      validFrom: new FormControl(this.today, {
        nonNullable: true,
        validators: [Validators.required, notBefore(this.today)],
      }),
      validUntil: new FormControl('', { nonNullable: true }),
      visitorName: new FormControl('', { nonNullable: true }),
      visitorDocument: new FormControl('', { nonNullable: true }),
      companyName: new FormControl('', { nonNullable: true }),
      phone: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(VISIT_PHONE_MAX_LENGTH)],
      }),
    },
    { validators: validRange },
  );

  readonly kind = toSignal(this.form.controls.kind.valueChanges, {
    initialValue: this.form.controls.kind.value,
  });
  readonly isDelivery = computed(() => this.kind() === 'Delivery');
  readonly isFrequent = computed(() => this.kind() === 'Frequent');

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);

  readonly photoFile = signal<File | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly photoError = signal<string | null>(null);
  readonly acceptedPhotoTypes = VISIT_PHOTO_CONTENT_TYPES.join(',');
  readonly photoMaxLabel = `${VISIT_PHOTO_MAX_BYTES / (1024 * 1024)} MB`;
  /** The key already uploaded for {@link photoFile}, so a failed create retries without re-sending bytes. */
  private uploadedPhoto: { file: File; key: string } | null = null;

  readonly searchApartments: SearchSelectFn = (term) =>
    this.apartmentOptions
      .search(term)
      .pipe(map((items) => items.map((a) => ({ value: a.id, label: apartmentLabel(a) }))));

  constructor() {
    this.applyKindValidators(this.form.controls.kind.value);
    this.form.controls.kind.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((kind) => this.applyKindValidators(kind));
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
    if (errors['maxlength']) return `Máximo ${errors['maxlength'].requiredLength} caracteres.`;
    if (errors['notBefore']) return 'No puede ser anterior a hoy.';
    return 'Revisa este campo.';
  }

  rangeError(): string | null {
    if (!this.isFrequent() || !(this.submitted() || this.form.controls.validUntil.touched)) {
      return null;
    }
    const errors = this.form.errors ?? {};
    if (errors['rangeOrder']) return 'La fecha final no puede ser anterior a la inicial.';
    if (errors['rangeTooLong']) return 'Una visita frecuente puede durar un año como máximo.';
    return null;
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.photoError.set(null);
    if (!VISIT_PHOTO_CONTENT_TYPES.includes(file.type)) {
      this.photoError.set('Solo puedes subir imágenes JPG, PNG o WEBP.');
      return;
    }
    if (file.size > VISIT_PHOTO_MAX_BYTES) {
      this.photoError.set(`La imagen supera ${this.photoMaxLabel}. Intenta con una más liviana.`);
      return;
    }
    this.clearPhoto();
    this.photoFile.set(file);
    this.photoPreview.set(URL.createObjectURL(file));
  }

  clearPhoto(): void {
    const preview = this.photoPreview();
    if (preview) URL.revokeObjectURL(preview);
    this.photoFile.set(null);
    this.photoPreview.set(null);
    this.photoError.set(null);
    this.uploadedPhoto = null;
  }

  submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.saving.set(true);
    this.uploadPhoto()
      .pipe(
        switchMap((photoKey) => this.service.create(this.toRequest(photoKey))),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: () => {
          this.clearPhoto();
          this.notifications.success('Visitante creado');
          this.router.navigate(['/visits']);
        },
        error: (error: unknown) => this.handleError(error),
      });
  }

  private toRequest(photoKey: string | null): CreateVisitRequest {
    const v = this.form.getRawValue();
    const delivery = v.kind === 'Delivery';
    return {
      apartmentId: v.apartmentId!,
      kind: v.kind,
      validFrom: v.validFrom,
      validUntil: v.kind === 'Frequent' ? v.validUntil : null,
      visitorName: delivery ? null : v.visitorName.trim(),
      visitorDocument: delivery ? null : v.visitorDocument.trim(),
      companyName: delivery ? v.companyName.trim() : null,
      phone: v.phone.trim() || null,
      photoKey,
      // Not collected by this form yet; the plate is set from the detail.
      vehiclePlate: null,
    };
  }

  private uploadPhoto(): Observable<string | null> {
    const file = this.photoFile();
    if (!file) return of(null);
    if (this.uploadedPhoto?.file === file) return of(this.uploadedPhoto.key);

    return this.service.createPhotoUploadUrl(file.type).pipe(
      switchMap((ticket) =>
        this.service.uploadPhoto(ticket.uploadUrl, file).pipe(
          map(() => ticket.key),
          // The PUT to Blob fails without a ProblemDetails behind it.
          catchError(() => throwError(() => new PhotoUploadError())),
        ),
      ),
      map((key) => {
        this.uploadedPhoto = { file, key };
        return key;
      }),
    );
  }

  private handleError(error: unknown): void {
    if (error instanceof PhotoUploadError) {
      this.error.set('No pudimos subir la foto. Verifica tu conexión e inténtalo de nuevo.');
      return;
    }
    if (!(error instanceof HttpErrorResponse)) {
      this.error.set('No pudimos crear el visitante. Inténtalo de nuevo en un momento.');
      return;
    }

    const problem = error.error as ProblemDetails | null;
    const fieldErrors = problem?.errors ?? [];
    let placed = fieldErrors.length > 0;
    for (const fieldError of fieldErrors) {
      const name = toControlName(fieldError.property);
      const control = name ? this.form.get(name) : null;
      if (control) {
        control.setErrors({ server: translateFieldError(fieldError) });
      } else {
        placed = false;
      }
    }

    const target = CODE_TO_CONTROL[errorCode(error)];
    if (target) {
      this.form.get(target)?.setErrors({ server: toMessage(error) });
      return;
    }
    if (!placed) this.error.set(toMessage(error));
  }

  private applyKindValidators(kind: VisitKind): void {
    const c = this.form.controls;
    const person = kind !== 'Delivery';

    c.visitorName.setValidators(
      person ? [Validators.required, Validators.maxLength(VISIT_NAME_MAX_LENGTH)] : [],
    );
    c.visitorDocument.setValidators(
      person ? [Validators.required, Validators.maxLength(VISIT_DOCUMENT_MAX_LENGTH)] : [],
    );
    c.companyName.setValidators(
      person ? [] : [Validators.required, Validators.maxLength(VISIT_COMPANY_MAX_LENGTH)],
    );
    c.validUntil.setValidators(kind === 'Frequent' ? [Validators.required] : []);

    for (const control of [c.visitorName, c.visitorDocument, c.companyName, c.validUntil]) {
      control.updateValueAndValidity({ emitEvent: false });
    }
    this.form.updateValueAndValidity({ emitEvent: false });
  }
}

/** `PascalCase` API property → the form's camelCase control name. */
function toControlName(property: string): string | null {
  const last = property.split('.').pop() ?? '';
  return last ? last[0].toLowerCase() + last.slice(1) : null;
}

function notBefore(min: string) {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    control.value && control.value < min ? { notBefore: true } : null;
}

/** Frequent only: `validUntil` ≥ `validFrom`, and at most one year after it. */
function validRange(group: AbstractControl): ValidationErrors | null {
  const { kind, validFrom, validUntil } = group.value as {
    kind: VisitKind;
    validFrom: string;
    validUntil: string;
  };
  if (kind !== 'Frequent' || !validFrom || !validUntil) return null;
  if (validUntil < validFrom) return { rangeOrder: true };
  if (validUntil > oneYearAfter(validFrom)) return { rangeTooLong: true };
  return null;
}

/** Same calendar day one year later, like the API's `DateOnly.AddYears(1)`. */
function oneYearAfter(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  // 29 Feb → 28 Feb, as .NET does.
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
