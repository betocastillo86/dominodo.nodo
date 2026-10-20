import { ChangeDetectionStrategy, Component, computed, inject, output, signal, TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { finalize, Observable } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { toReservationActionMessage } from '../data-access/reservation-action-errors';
import {
  availableReservationActions,
  RESERVATION_ACTION_LABEL,
  RESERVATION_REASON_MAX_LENGTH,
  requiresReason,
  RespondableReservation,
  ReservationAction,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/**
 * The "responder" dialog of the Reservas module: pick the booking's new state
 * (aprobar / rechazar / cancelar) and, for the two that release the slot, write
 * the administrator's reason.
 *
 * Its own component because BOTH screens of the module answer bookings — the
 * list row by row, the detail for the one it is showing — and the rules behind
 * the dialog are not trivial enough to live twice: which states a booking still
 * offers mirrors the API's own guards, and the two write permissions differ
 * (approve/reject need `reservations.edit`, cancel needs `reservations.cancel`).
 *
 * Renders nothing of its own — only the dialog's template. The host puts
 * whatever trigger it wants on screen and calls `open()`, then reacts to
 * `responded` by reloading, because answering changes the booking's state and
 * every caller shows that state somewhere.
 */
@Component({
  selector: 'app-reservation-respond',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-respond.component.html',
})
export class ReservationRespondComponent {
  private readonly service = inject(ReservationsAdminService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  /** Emitted once the API has accepted the move, so the host can refresh. */
  readonly responded = output<ReservationAction>();

  /** The booking the dialog is currently about. */
  readonly target = signal<RespondableReservation | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly submitted = signal(false);

  readonly actionLabel = RESERVATION_ACTION_LABEL;
  readonly reasonMaxLength = RESERVATION_REASON_MAX_LENGTH;

  readonly form = new FormGroup({
    action: new FormControl<ReservationAction | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    reason: new FormControl('', { nonNullable: true }),
  });

  /**
   * Permissive only while `GET /auth/current` is still in flight, as everywhere
   * else in the portal — the server stays authoritative either way.
   */
  private readonly canEdit = computed(
    () => !this.permissions.loaded() || this.permissions.has('reservations.edit'),
  );
  private readonly canCancel = computed(
    () => !this.permissions.loaded() || this.permissions.has('reservations.cancel'),
  );

  /** The states this particular booking can still move to. */
  readonly actionOptions = computed<ReservationAction[]>(() => {
    const row = this.target();
    return row ? availableReservationActions(row, this.canEdit(), this.canCancel()) : [];
  });

  /** Drives the reason textarea; recomputed from the control so the template stays dumb. */
  readonly needsReason = signal(false);

  private readonly tpl = viewChild.required<TemplateRef<unknown>>('respondTpl');

  /** Held so the component closes the dialog itself on success. */
  private respondModal: NgbModalRef | null = null;

  constructor() {
    // Rejecting and cancelling need a reason; approving must not demand one.
    this.form.controls.action.valueChanges.pipe(takeUntilDestroyed()).subscribe((action) => {
      this.applyReasonValidators(action);
    });
  }

  /**
   * Whether this booking has any move left, which is what decides if a host
   * shows its trigger at all. Hiding what is not allowed is UX; the server
   * stays authoritative, so a race still comes back as a 409.
   */
  canRespond(reservation: RespondableReservation): boolean {
    return availableReservationActions(reservation, this.canEdit(), this.canCancel()).length > 0;
  }

  open(reservation: RespondableReservation): void {
    this.target.set(reservation);
    this.submitted.set(false);
    this.formError.set(null);
    this.form.reset({ action: '', reason: '' });
    this.applyReasonValidators('');

    this.respondModal = this.modal.open(this.tpl());
    this.respondModal.result.then(
      () => (this.respondModal = null),
      () => (this.respondModal = null),
    );
  }

  submit(): void {
    this.submitted.set(true);
    this.formError.set(null);
    if (this.form.invalid) return;

    const row = this.target();
    const { action, reason } = this.form.getRawValue();
    if (!row || !action) return;

    const request = this.requestFor(row.id, action, reason.trim());

    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.respondModal?.close();
        this.notifications.success(`Reserva ${row.code}: ${this.pastTense(action)}.`);
        this.responded.emit(action);
      },
      error: (error: unknown) => this.formError.set(toReservationActionMessage(error)),
    });
  }

  private requestFor(id: string, action: ReservationAction, reason: string): Observable<void> {
    switch (action) {
      case 'confirm':
        return this.service.confirm(id);
      case 'reject':
        return this.service.reject(id, reason);
      case 'cancel':
        return this.service.cancel(id, reason);
    }
  }

  private pastTense(action: ReservationAction): string {
    return { confirm: 'aprobada', reject: 'rechazada', cancel: 'cancelada' }[action];
  }

  private applyReasonValidators(action: ReservationAction | ''): void {
    const needed = !!action && requiresReason(action);
    this.needsReason.set(needed);

    const reason = this.form.controls.reason;
    if (needed) {
      reason.setValidators([Validators.required, Validators.maxLength(RESERVATION_REASON_MAX_LENGTH)]);
    } else {
      reason.clearValidators();
      reason.setValue('', { emitEvent: false });
    }
    reason.updateValueAndValidity({ emitEvent: false });
  }
}
