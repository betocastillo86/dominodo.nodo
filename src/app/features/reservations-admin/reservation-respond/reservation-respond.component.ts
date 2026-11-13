import { ChangeDetectionStrategy, Component, computed, inject, output, signal, TemplateRef, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { TablerIconComponent } from 'angular-tabler-icons';
import { catchError, finalize, map, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import {
  RESERVATION_PROOF_IMAGE_CONTENT_TYPES,
  RESERVATION_PROOF_MAX_BYTES,
} from '../../reservations/data-access/reservation-availability.models';
import { toReservationActionMessage } from '../data-access/reservation-action-errors';
import {
  acceptsComment,
  availableReservationActions,
  isPaidReservation,
  RESERVATION_ACTION_LABEL,
  RESERVATION_COMMENT_MAX_LENGTH,
  RESERVATION_REASON_MAX_LENGTH,
  requiresReason,
  RespondableReservation,
  ReservationAction,
  ReservationPaymentProofUpload,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/** The comprobante's PUT to Blob Storage failed — nothing reached the API. */
class ProofUploadError extends Error {}

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
 *
 * Confirming also lets the approver mark the payment as verified and,
 * optionally, attach the comprobante themselves — the case of a resident who
 * paid at the office or sent the receipt by other means. The image goes
 * straight to Blob first and rides on the confirm call as a key, which the API
 * applies all-or-nothing with the confirmation (ADR-0018 §5).
 */
@Component({
  selector: 'app-reservation-respond',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent],
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
    paymentValidated: new FormControl(false, { nonNullable: true }),
  });

  /** The optional comprobante picked for the confirmation. Not a form control: a File has no value to bind. */
  readonly proofFile = signal<File | null>(null);
  readonly proofError = signal<string | null>(null);
  readonly acceptedProofTypes = RESERVATION_PROOF_IMAGE_CONTENT_TYPES.join(',');
  readonly proofMaxBytesLabel = `${RESERVATION_PROOF_MAX_BYTES / (1024 * 1024)} MB`;

  /**
   * The blob already PUT for {@link proofFile}, so a confirm that fails AFTER
   * the upload (a 409 race, a network blip) retries without sending the bytes
   * again. Its key stays valid for this booking: nothing adopted it.
   */
  private uploadedProof: { file: File; proof: ReservationPaymentProofUpload } | null = null;

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

  /** A free area has no payment to verify nor a comprobante to attach. */
  readonly paymentRequired = computed(() => {
    const row = this.target();
    return !!row && isPaidReservation(row);
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
    this.form.reset({ action, reason: '', comment: '', paymentValidated: false });
    this.clearProof();
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
    const { action, reason, comment, paymentValidated } = this.form.getRawValue();
    if (!row || !action) return;

    // Belt and braces: the fields are hidden on a free area, and nothing they
    // held may ride along with its confirmation.
    const paid = this.paymentRequired();
    const request = this.requestFor(
      row.id,
      action,
      reason.trim(),
      comment.trim(),
      paid && paymentValidated,
    );

    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.respondModal?.close();
        this.notifications.success(`Reserva ${row.code}: ${this.pastTense(action)}.`);
        this.responded.emit(action);
      },
      error: (error: unknown) =>
        this.formError.set(
          error instanceof ProofUploadError
            ? 'No pudimos subir el comprobante. Verifica tu conexión e inténtalo de nuevo.'
            : toReservationActionMessage(error),
        ),
    });
  }

  private requestFor(
    id: string,
    action: ReservationAction,
    reason: string,
    comment: string,
    paymentValidated: boolean,
  ): Observable<void> {
    switch (action) {
      case 'confirm':
        // No `amountPaid`: this dialog records the note, not the money.
        return this.uploadProof(id).pipe(
          switchMap((paymentProof) =>
            this.service.confirm(id, { amountPaid: null, comment, paymentValidated, paymentProof }),
          ),
        );
      case 'reject':
        return this.service.reject(id, reason);
      case 'cancel':
        return this.service.cancel(id, reason);
    }
  }

  // ── Payment proof ──────────────────────────────────────────────────────────

  onProofSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    // Cleared right away so the same file can be re-picked after removing it.
    target.value = '';
    if (!file) return;

    this.proofError.set(null);
    if (!RESERVATION_PROOF_IMAGE_CONTENT_TYPES.includes(file.type)) {
      this.proofError.set('Solo puedes subir imágenes (JPG, PNG, WEBP o GIF).');
      return;
    }
    if (file.size > RESERVATION_PROOF_MAX_BYTES) {
      this.proofError.set(`La imagen supera ${this.proofMaxBytesLabel}. Intenta con una más liviana.`);
      return;
    }
    this.proofFile.set(file);
  }

  clearProof(): void {
    this.proofFile.set(null);
    this.proofError.set(null);
    this.uploadedProof = null;
  }

  /**
   * Steps 1 and 2 of the direct-to-blob upload; step 3 — adopting the key — is
   * the confirm call itself. Emits null when no comprobante was picked.
   */
  private uploadProof(id: string): Observable<ReservationPaymentProofUpload | null> {
    const file = this.paymentRequired() ? this.proofFile() : null;
    if (!file) return of(null);
    if (this.uploadedProof?.file === file) return of(this.uploadedProof.proof);

    const meta = { fileName: file.name, contentType: file.type };
    return this.service.createPaymentProofUploadUrl(id, meta).pipe(
      switchMap((ticket) =>
        this.service.uploadPaymentProof(ticket.uploadUrl, file).pipe(
          map((): ReservationPaymentProofUpload => ({ key: ticket.key, ...meta })),
          // The PUT to Blob fails as a status-0/opaque error with no
          // ProblemDetails behind it, so it gets its own message.
          catchError(() => throwError(() => new ProofUploadError())),
        ),
      ),
      tap((proof) => (this.uploadedProof = { file, proof })),
    );
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
      // Same for the payment mark and the comprobante: they belong to the
      // confirmation and must not ride along with anything else.
      this.form.controls.paymentValidated.setValue(false, { emitEvent: false });
      this.clearProof();
    }
    comment.updateValueAndValidity({ emitEvent: false });
  }
}
