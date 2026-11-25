import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { finalize } from 'rxjs';
import { toMessage } from '../../../core/http/problem-details';
import { DIAL_CODES, DEFAULT_DIAL_CODE, splitE164, toE164 } from '../../../shared/phone/dial-codes';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import {
  ADDITIONAL_CONTACTS_MAX,
  DOCUMENT_NUMBER_MAX_LENGTH,
  DOCUMENT_TYPE_LABEL,
  DocumentType,
  UserDto,
} from '../data-access/resident-profile.models';
import { ResidentProfilesService } from '../data-access/resident-profiles.service';

/** Same shape the resident invite accepts: national digits, or a pasted `+` number. */
const PHONE_INPUT = /^\+?[\d\s-]{6,20}$/;

type PhoneGroup = FormGroup<{ dialCode: FormControl<string>; phone: FormControl<string> }>;

/** Document type and number travel together or not at all (API ADR-0029 §3). */
function documentComplete(group: AbstractControl): ValidationErrors | null {
  const type = group.get('documentType')?.value;
  const number = `${group.get('documentNumber')?.value ?? ''}`.trim();
  return !type !== !number ? { documentIncomplete: true } : null;
}

/**
 * Edits a resident's profile from the apartment detail: name, email, document
 * and the additional emails / phones of ADR-0029 §3. Loads `GET /users/{id}`
 * itself, because the residents list only carries name and phone, and saves
 * with `PUT /users/{id}` (users.edit).
 *
 * The PUT is a full replace, so everything loaded is sent back. The login
 * phone is shown but not editable: the API has no endpoint for it. Closes
 * with no value on success, and is dismissed on cancel.
 */
@Component({
  selector: 'app-resident-edit-modal',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resident-edit-modal.component.html',
})
export class ResidentEditModalComponent {
  readonly activeModal = inject(NgbActiveModal);
  private readonly service = inject(ResidentProfilesService);

  readonly user = signal<UserDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly dialCodes = DIAL_CODES;
  readonly documentTypes = Object.entries(DOCUMENT_TYPE_LABEL) as [DocumentType, string][];
  readonly maxContacts = ADDITIONAL_CONTACTS_MAX;
  readonly documentNumberMaxLength = DOCUMENT_NUMBER_MAX_LENGTH;

  readonly form = new FormGroup(
    {
      firstName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(100)],
      }),
      lastName: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(100)],
      }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
      documentType: new FormControl<DocumentType | null>(null),
      documentNumber: new FormControl('', {
        nonNullable: true,
        validators: [Validators.maxLength(DOCUMENT_NUMBER_MAX_LENGTH)],
      }),
      additionalEmails: new FormArray<FormControl<string>>([]),
      additionalPhones: new FormArray<PhoneGroup>([]),
    },
    { validators: documentComplete },
  );

  /** Called by the opener right after `open`. */
  init(userId: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.service.getById(userId).subscribe({
      next: (user) => {
        this.user.set(user);
        this.form.patchValue({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email ?? '',
          documentType: user.documentType,
          documentNumber: user.documentNumber ?? '',
        });
        for (const email of user.additionalEmails) this.addEmail(email);
        for (const phone of user.additionalPhones) this.addPhone(phone);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  addEmail(value = ''): void {
    this.form.controls.additionalEmails.push(
      new FormControl(value, {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
    );
  }

  addPhone(value = ''): void {
    const { dialCode, phone } = value ? splitE164(value) : { dialCode: DEFAULT_DIAL_CODE, phone: '' };
    this.form.controls.additionalPhones.push(
      new FormGroup({
        dialCode: new FormControl(dialCode, { nonNullable: true }),
        phone: new FormControl(phone, {
          nonNullable: true,
          validators: [Validators.required, Validators.pattern(PHONE_INPUT)],
        }),
      }),
    );
  }

  submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    const user = this.user();
    if (!user || this.form.invalid) return;

    const raw = this.form.getRawValue();
    const documentNumber = raw.documentNumber.trim();
    this.saving.set(true);
    this.service
      .update(user.id, {
        firstName: raw.firstName.trim(),
        lastName: raw.lastName.trim(),
        email: raw.email.trim() || null,
        preferredLanguage: '',
        documentType: raw.documentType,
        documentNumber: documentNumber || null,
        additionalEmails: raw.additionalEmails.map((e) => e.trim()),
        additionalPhones: raw.additionalPhones.map((p) => toE164(p.dialCode, p.phone)),
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => this.activeModal.close(),
        error: (error: HttpErrorResponse) => this.error.set(toMessage(error)),
      });
  }
}
