import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { finalize } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { knownApiMessage } from '../../../core/http/problem-details';
import { NotificationService } from '../../../core/notifications/notification.service';
import { VISITS_CHECKIN } from '../data-access/visit.permissions';
import {
  VISIT_GUARD_NOTE_MAX_LENGTH,
  VISIT_KIND_LABEL,
  VisitDetailDto,
  visitDisplayName,
} from '../data-access/visit.models';
import { VisitsService } from '../data-access/visits.service';

/**
 * "Registrar ingreso" dialog: confirms that the visitor is at the gate now and
 * records the entry (`POST /visits/{id}/entries`) with an optional note. The API
 * notifies the apartment's residents.
 *
 * Renders only its dialog; the host puts the trigger on screen, calls `open()`
 * and reloads on `checkedIn`. Hiding the trigger is UX — the server stays
 * authoritative (409 when the visit is used, disabled or not valid today).
 */
@Component({
  selector: 'app-visit-check-in',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visit-check-in.component.html',
})
export class VisitCheckInComponent {
  private readonly service = inject(VisitsService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  /** Emitted once the API has recorded the entry, so the host can refresh. */
  readonly checkedIn = output<void>();

  readonly target = signal<VisitDetailDto | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly noteMaxLength = VISIT_GUARD_NOTE_MAX_LENGTH;
  readonly kindLabel = VISIT_KIND_LABEL;
  readonly visitorName = computed(() => {
    const visit = this.target();
    return visit ? visitDisplayName(visit) : '';
  });

  readonly form = new FormGroup({
    guardNote: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(VISIT_GUARD_NOTE_MAX_LENGTH)],
    }),
  });

  private readonly tpl = viewChild.required<TemplateRef<unknown>>('checkInTpl');
  private ref: NgbModalRef | null = null;

  /**
   * Whether the visit still admits an entry and the user may record it. Permissive
   * only while `GET /auth/current` is in flight, as everywhere in the portal.
   */
  canCheckIn(visit: VisitDetailDto): boolean {
    const allowed = !this.permissions.loaded() || this.permissions.has(VISITS_CHECKIN);
    return allowed && visit.status === 'Scheduled';
  }

  open(visit: VisitDetailDto): void {
    this.target.set(visit);
    this.formError.set(null);
    this.form.reset({ guardNote: '' });

    this.ref = this.modal.open(this.tpl());
    this.ref.result.then(
      () => (this.ref = null),
      () => (this.ref = null),
    );
  }

  submit(): void {
    this.formError.set(null);
    const visit = this.target();
    if (!visit || this.form.invalid) return;

    this.saving.set(true);
    this.service
      .checkIn(visit.id, this.form.controls.guardNote.value)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.ref?.close();
          this.notifications.success(`Ingreso registrado: ${this.visitorName()}.`);
          this.checkedIn.emit();
        },
        error: (error: unknown) =>
          this.formError.set(
            (error instanceof HttpErrorResponse ? knownApiMessage(error) : null) ??
              'No pudimos registrar el ingreso. Inténtalo de nuevo en un momento.',
          ),
      });
  }
}
