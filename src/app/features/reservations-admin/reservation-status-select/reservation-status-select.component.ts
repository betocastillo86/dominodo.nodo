import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PermissionStore } from '../../../core/authz/permission.store';
import {
  availableReservationActions,
  RESERVATION_ACTION_LABEL,
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  RESERVATION_STATUS_TINT,
  ReservationAction,
  RespondableReservation,
} from '../data-access/reservation.models';

/** A move, read back as the state it lands on — which is how the select offers it. */
interface StatusOption {
  action: ReservationAction;
  label: string;
}

/**
 * The booking's state, as a control rather than a badge: a `<select>` tinted
 * with the status colour, showing ONLY the current state's label, whose other
 * options are the states this booking can still move to.
 *
 * It is a TRIGGER, not a bound model. Picking a state does not write anything —
 * it emits the move so the host opens the "responder" dialog with that state
 * already chosen (the reason is still collected there, and the move can still
 * be dismissed). The control snaps straight back to the state the row actually
 * has; the new one only appears once the list reloads.
 *
 * Which states it offers mirrors the API's own guards
 * (`availableReservationActions`); a booking with no move left renders as the
 * plain badge, since there is nothing to pick.
 */
@Component({
  selector: 'app-reservation-status-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (options().length) {
      <select
        class="form-select form-select-sm status-select"
        [class]="tint()"
        [attr.aria-label]="'Cambiar el estado de la reserva ' + reservation().code"
        (change)="onChange($event)"
      >
        <!-- Value-less, so the control keeps reading as the CURRENT state. -->
        <option value="">{{ currentLabel() }}</option>
        @for (option of options(); track option.action) {
          <option [value]="option.action">{{ option.label }}</option>
        }
      </select>
    } @else {
      <span [class]="badgeClass()">{{ currentLabel() }}</span>
    }
  `,
  styles: [
    `
      /* Tabler's \`form-select\` is a full-width block with room for a caret at
         3rem; inside a table cell it has to size to its own label instead. */
      .status-select {
        display: inline-block;
        width: auto;
        padding-right: 1.75rem;
        background-position: right 0.5rem center;
        cursor: pointer;
      }

      /* The tint paints the control's text to match its background. The option
         list is the browser's own surface, so hand it the form palette back. */
      .status-select option {
        color: var(--tblr-body-color);
        background-color: var(--tblr-bg-forms);
      }
    `,
  ],
})
export class ReservationStatusSelectComponent {
  private readonly permissions = inject(PermissionStore);

  readonly reservation = input.required<RespondableReservation>();

  /** The state the administrator picked, as the move that gets there. */
  readonly actionPicked = output<ReservationAction>();

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

  readonly currentLabel = computed(() => RESERVATION_STATUS_LABEL[this.reservation().status]);
  readonly tint = computed(() => RESERVATION_STATUS_TINT[this.reservation().status]);
  readonly badgeClass = computed(() => RESERVATION_STATUS_BADGE[this.reservation().status]);

  readonly options = computed<StatusOption[]>(() =>
    availableReservationActions(this.reservation(), this.canEdit(), this.canCancel()).map(
      (action) => ({ action, label: RESERVATION_ACTION_LABEL[action] }),
    ),
  );

  onChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const action = select.value as ReservationAction | '';
    // Nothing has changed yet — the dialog still has to be filled in and may be
    // dismissed. Put the control back on the state the booking really has.
    select.value = '';
    if (action) {
      this.actionPicked.emit(action);
    }
  }
}
