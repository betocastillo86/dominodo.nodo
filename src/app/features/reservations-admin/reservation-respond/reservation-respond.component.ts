import { ChangeDetectionStrategy, Component, computed, inject, output, signal, TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { finalize, Observable } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { toReservationActionMessage } from '../data-access/reservation-action-errors';
import {
  acceptsComment,
  availableReservationActions,
  RESERVATION_ACTION_LABEL,
  RESERVATION_COMMENT_MAX_LENGTH,
  RESERVATION_REASON_MAX_LENGTH,
  requiresReason,
  RespondableReservation,
  ReservationAction,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/**
 * The "responder" dialog of the Reservas module: pick the booking's new state
 * (confirmar / rechazar / cancelar) and write what that state carries — a
 * mandatory reason for the two that release the slot, an optional note for the
 * one that grants the booking.
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
  readonly commentMaxLength = RESERVATION_COMMENT_MAX_LENGTH;

  readonly form = new FormGroup({
    action: new FormControl<ReservationAction | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    reason: new FormControl('', { nonNullable: true }),
    comment: new FormControl('', { nonNullable: true }),
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
  /** Same, for the optional note that approving a booking carries. */
  readonly allowsComment = signal(false);

  private readonly tpl = viewChild.required<TemplateRef<unknown>>('respondTpl');

  /** Held so the component closes the dialog itself on success. */
  private respondModal: NgbModalRef | null = null;

  constructor() {
    // Rejecting and cancelling need a reason; approving takes an optional note
    // instead and must never demand anything.
    this.form.controls.action.valueChanges.pipe(takeUntilDestroyed()).subscribe((action) => {
      this.applyActionValidators(action);
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

  /**
   * `action` pre-picks the state the dialog opens on — what the list's status
   * select sends when the administrator chooses a state straight from the row.
   * The dialog still asks for the reason and can still be dismissed; the caller
   * only saves a click. Callers with a plain "responder" trigger omit it.
   */
  open(reservation: RespondableReservation, action: ReservationAction | '' = ''): void {
    this.target.set(reservation);
    this.submitted.set(false);
    this.formError.set(null);
    this.form.reset({ action, reason: '', comment: '' });
    this.applyActionValidators(action);

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
    const { action, reason, comment } = this.form.getRawValue();
    if (!row || !action) return;

    const request = this.requestFor(row.id, action, reason.trim(), comment.trim());

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

  private requestFor(
    id: string,
    action: ReservationAction,
    reason: string,
    comment: string,
  ): Observable<void> {
    switch (action) {
      case 'confirm':
        // No `amountPaid`: this dialog records the note, not the money.
        return this.service.confirm(id, null, comment);
      case 'reject':
        return this.service.reject(id, reason);
      case 'cancel':
        return this.service.cancel(id, reason);
    }
  }

  /**
   * `"Reserva A-123: confirmada."` — the destination state's own label, so the
   * toast says the same word the two selects offered.
   */
  private pastTense(action: ReservationAction): string {
    return RESERVATION_ACTION_LABEL[action].toLowerCase();
  }

  private applyActionValidators(action: ReservationAction | ''): void {
    const needsReason = !!action && requiresReason(action);
    this.needsReason.set(needsReason);

    const reason = this.form.controls.reason;
    if (needsReason) {
      reason.setValidators([Validators.required, Validators.maxLength(RESERVATION_REASON_MAX_LENGTH)]);
    } else {
      reason.clearValidators();
      reason.setValue('', { emitEvent: false });
    }
    reason.updateValueAndValidity({ emitEvent: false });

    // The note is optional, so its only rule is the domain's length cap — and it
    // is cleared whenever the move does not carry one, so a note typed before
    // switching to "Rechazada" never rides along with the rejection.
    const allowsNote = !!action && acceptsComment(action);
    this.allowsComment.set(allowsNote);

    const comment = this.form.controls.comment;
    if (allowsNote) {
      comment.setValidators([Validators.maxLength(RESERVATION_COMMENT_MAX_LENGTH)]);
    } else {
      comment.clearValidators();
      comment.setValue('', { emitEvent: false });
    }
    comment.updateValueAndValidity({ emitEvent: false });
  }
}
