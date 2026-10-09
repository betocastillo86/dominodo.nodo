import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  TemplateRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  AUTO_CLOSE_DAYS_MAX,
  AUTO_CLOSE_DAYS_MIN,
  formatTowers,
  TenantInfoDto,
  UpdateTenantApartmentsSettingsRequest,
  UpdateTenantRequestsSettingsRequest,
} from '../../../core/tenant/tenant-info.models';
import { TenantInfoService } from '../../../core/tenant/tenant-info.service';
import { TenantStore } from '../../../core/tenant/tenant.store';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { TowerEditorComponent } from '../../../shared/ui/tower-editor/tower-editor.component';

/**
 * "Configuración" tab of Mi Conjunto: how the conjunto wants its modules to
 * behave, as opposed to the contact details residents read. One form, one save,
 * one section per concern — built to grow.
 */
@Component({
  selector: 'app-tenant-settings-form',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, SpinnerComponent, TowerEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-settings-form.component.html',
})
export class TenantSettingsFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TenantInfoService);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);
  private readonly tenant = inject(TenantStore);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly minAutoCloseDays = AUTO_CLOSE_DAYS_MIN;
  readonly maxAutoCloseDays = AUTO_CLOSE_DAYS_MAX;

  /** The PQRS section is only worth showing when the conjunto has the module. */
  readonly showRequests = this.tenant.hasFeature('Requests');

  readonly form = this.fb.group({
    // Always seeded from the GET (which returns the EFFECTIVE window), never
    // from a client-side default.
    autoCloseDays: this.fb.control<number | null>(AUTO_CLOSE_DAYS_MIN, [
      Validators.required,
      Validators.min(AUTO_CLOSE_DAYS_MIN),
      Validators.max(AUTO_CLOSE_DAYS_MAX),
      integerValidator,
    ]),
    // <app-tower-editor> speaks string[]; the CSV the API wants is built on save.
    towers: this.fb.nonNullable.control<string[]>([]),
  });

  /** Drives the hint that spells out what the typed number means, as it is typed. */
  readonly autoCloseDays = toSignal(this.form.controls.autoCloseDays.valueChanges, {
    initialValue: this.form.controls.autoCloseDays.value,
  });

  /** 0 is not "zero days", it is the off switch — the hint has to say so. */
  readonly autoCloseDisabled = computed(() => this.autoCloseDays() === 0);

  /**
   * `PUT /tenants/info` rewrites the contact block on every call and its
   * validator rejects an empty phone or schedule, so a conjunto that never
   * filled the "Contacto" tab cannot save anything here yet. Saying so beats
   * letting the server answer with a contact-field error on a settings screen.
   */
  readonly contactMissing = computed(() => {
    const contact = this.service.info()?.contactInfo;
    if (!contact) return false;
    return !contact.phone?.trim() || !contact.schedules?.trim();
  });

  ngOnInit(): void {
    this.fetch();
  }

  /** Validate first, then ask for confirmation; only a confirmed modal saves. */
  confirmSave(tpl: TemplateRef<unknown>): void {
    if (this.saving() || this.contactMissing()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.modal.open(tpl).result.then(
      () => this.save(),
      () => undefined,
    );
  }

  private save(): void {
    this.saving.set(true);
    this.formError.set(null);

    this.service.saveSettings(this.toRequest()).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notifications.success('Configuración del conjunto actualizada.');
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  private toRequest(): {
    requests?: UpdateTenantRequestsSettingsRequest;
    apartments?: UpdateTenantApartmentsSettingsRequest;
  } {
    const v = this.form.getRawValue();
    return {
      // Omitted when the module is off, so the save leaves that group alone.
      ...(this.showRequests
        ? { requests: { autoCloseDays: v.autoCloseDays ?? AUTO_CLOSE_DAYS_MIN } }
        : {}),
      // Always sent: an empty string is how "this conjunto declares no towers"
      // travels, and that is a legitimate thing to save.
      apartments: { towers: formatTowers(v.towers) },
    };
  }

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.service.load().subscribe({
      next: ({ requests, apartments }: TenantInfoDto) => {
        this.form.patchValue({
          autoCloseDays: requests.autoCloseDays,
          towers: [...apartments.towerList],
        });
        this.form.markAsPristine();
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loadError.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }
}

/** `<input type="number">` happily accepts "1.5"; the API only takes whole days. */
function integerValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === '') return null;
  return Number.isInteger(value) ? null : { integer: true };
}
