import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  TemplateRef,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { ScheduleEditorComponent } from '../../../shared/ui/schedule-editor/schedule-editor.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { TenantContactInfoDto, UpdateTenantInfoRequest } from '../data-access/tenant-info.models';
import { TenantInfoService } from '../data-access/tenant-info.service';

@Component({
  selector: 'app-tenant-info-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ScheduleEditorComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-info-form.component.html',
})
export class TenantInfoFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TenantInfoService);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  /** Gates the schedule editor's inline errors until the first save attempt. */
  readonly submitted = signal(false);

  readonly form = this.fb.group({
    phone: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(50)]),
    // `schedules` holds the JSON envelope produced by <app-schedule-editor>; the
    // editor itself is the validator (required / malformed / overlapping ranges).
    schedules: this.fb.control<string | null>(null),
    address: this.fb.nonNullable.control('', [Validators.maxLength(300)]),
    administratorName: this.fb.nonNullable.control('', [
      Validators.required,
      Validators.maxLength(200),
    ]),
    additionalInfo: this.fb.nonNullable.control('', [Validators.maxLength(1000)]),
  });

  ngOnInit(): void {
    this.fetch();
  }

  /** Validate first, then ask for confirmation; only a confirmed modal saves. */
  confirmSave(tpl: TemplateRef<unknown>): void {
    if (this.saving()) return;
    this.submitted.set(true);
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

    this.service.update(this.toRequest()).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.notifications.success('Información del conjunto actualizada.');
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.formError.set(toMessage(error));
      },
    });
  }

  private toRequest(): UpdateTenantInfoRequest {
    const v = this.form.getRawValue();
    return {
      phone: v.phone.trim(),
      schedules: v.schedules,
      administratorName: v.administratorName.trim(),
      address: emptyToNull(v.address),
      additionalInfo: emptyToNull(v.additionalInfo),
    };
  }

  private fetch(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.service.get().subscribe({
      next: (info: TenantContactInfoDto) => {
        this.form.patchValue({
          phone: info.phone ?? '',
          schedules: info.schedules ?? null,
          address: info.address ?? '',
          administratorName: info.administratorName ?? '',
          additionalInfo: info.additionalInfo ?? '',
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

/** The API stores optional fields as null; an empty textbox must not become "". */
function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
