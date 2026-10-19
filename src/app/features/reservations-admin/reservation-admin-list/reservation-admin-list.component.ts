import { ChangeDetectionStrategy, Component, computed, inject, signal, TemplateRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Observable, finalize } from 'rxjs';
import { PermissionStore } from '../../../core/authz/permission.store';
import { NotificationService } from '../../../core/notifications/notification.service';
import { DataTableComponent, TableColumn } from '../../../shared/ui/data-table/data-table.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { apartmentLabel } from '../../apartments/data-access/apartment.models';
import { formatDay, todayInReportZone, toFromUtc, toToUtc } from '../../dashboard/data-access/date-range';
import {
  formatCurrencyCOP,
  formatInstantAsTimeOfDay,
} from '../../reservations/data-access/reservation-format';
import { AmenityListItem } from '../../tenant-info/amenities/data-access/amenity.models';
import { AmenityOptionsService } from '../data-access/amenity-options.service';
import { toReservationActionMessage } from '../data-access/reservation-action-errors';
import {
  availableReservationActions,
  RESERVATION_ACTION_LABEL,
  RESERVATION_REASON_MAX_LENGTH,
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  requiresReason,
  ReservationAction,
  ReservationDto,
  ReservationSort,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/**
 * Soonest first: the point of this screen is what is about to happen, not what
 * was booked last. The API defaults to the opposite, so the sort is explicit.
 */
const SORT: ReservationSort = { sortBy: 'StartDate', direction: 'Asc' };

/**
 * Admin reservations list: upcoming bookings across every area, soonest first,
 * each answerable in place — the "responder" action opens a modal that asks for
 * the new state (aprobar / rechazar / cancelar) and, for the two that release
 * the slot, the administrator's reason.
 *
 * Which states a row offers mirrors the API's own guards (see
 * `availableReservationActions`), and the two write permissions differ:
 * approving and rejecting need `reservations.edit`, cancelling needs
 * `reservations.cancel`.
 *
 * Defaults to "desde hoy" on the reservation WINDOW (`sortBy=StartDate`,
 * `fromUtc`), never the creation date — an admin who clears the "desde" filter
 * can still look back at past bookings.
 */
@Component({
  selector: 'app-reservation-admin-list',
  standalone: true,
  imports: [PageHeaderComponent, DataTableComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-admin-list.component.html',
})
export class ReservationAdminListComponent {
  private readonly service = inject(ReservationsAdminService);
  private readonly amenityOptions = inject(AmenityOptionsService);
  private readonly permissions = inject(PermissionStore);
  private readonly notifications = inject(NotificationService);
  private readonly modal = inject(NgbModal);

  readonly items = this.service.items;
  readonly paging = this.service.paging;
  readonly loading = this.service.loading;
  readonly error = this.service.error;

  readonly areas = signal<AmenityListItem[]>([]);

  /** `yyyy-MM-dd` in the conjunto's reporting zone — never the browser's own. */
  readonly fromControl = new FormControl(todayInReportZone(), { nonNullable: true });
  readonly toControl = new FormControl('', { nonNullable: true });
  readonly amenityControl = new FormControl('', { nonNullable: true });

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

  // ── Respond modal ──────────────────────────────────────────────────────────

  /** The booking the modal is currently about. */
  readonly target = signal<ReservationDto | null>(null);
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

  /** The states this particular booking can still move to. */
  readonly actionOptions = computed<ReservationAction[]>(() => {
    const row = this.target();
    return row ? availableReservationActions(row, this.canEdit(), this.canCancel()) : [];
  });

  /** Drives the reason textarea; recomputed from the control so the template stays dumb. */
  readonly needsReason = signal(false);

  /** Held so the component closes the dialog itself on success. */
  private respondModal: NgbModalRef | null = null;

  readonly columns: readonly TableColumn<ReservationDto>[] = [
    { header: 'Código', value: (r) => r.code, class: 'w-1 text-nowrap fw-medium' },
    { header: 'Fecha de reserva', value: (r) => this.windowLabel(r), class: 'text-nowrap' },
    {
      header: 'Valor',
      value: (r) => (r.price == null ? '—' : formatCurrencyCOP(r.price)),
      class: 'text-nowrap',
    },
    {
      header: 'Pago',
      value: (r) => (r.paymentUploaded ? 'Sí' : 'No'),
      badgeClass: (r) => (r.paymentUploaded ? 'badge bg-green-lt' : 'badge bg-red-lt'),
    },
    { header: 'Apartamento', value: (r) => apartmentLabel(r.apartment) },
    {
      header: 'Estado',
      value: (r) => RESERVATION_STATUS_LABEL[r.status],
      badgeClass: (r) => RESERVATION_STATUS_BADGE[r.status],
    },
  ];

  readonly rowKey = (r: ReservationDto): string => r.id;
  readonly detailLink = (r: ReservationDto): unknown[] => ['/reservations', r.id];

  /** Only rows that still have a move available get the respond button. */
  readonly canRespond = (r: ReservationDto): boolean =>
    availableReservationActions(r, this.canEdit(), this.canCancel()).length > 0;

  private readonly pageSize = 20;

  constructor() {
    this.amenityOptions.list().subscribe({
      next: (areas) => this.areas.set(areas),
      // The filter just stays empty — the list itself does not depend on it.
      error: () => this.areas.set([]),
    });

    for (const control of [this.fromControl, this.toControl, this.amenityControl]) {
      control.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    }

    // Rejecting and cancelling need a reason; approving must not demand one.
    this.form.controls.action.valueChanges.pipe(takeUntilDestroyed()).subscribe((action) => {
      this.applyReasonValidators(action);
    });

    this.reload(1);
  }

  onPageChange(page: number): void {
    this.reload(page);
  }

  openRespond(row: ReservationDto, tpl: TemplateRef<unknown>): void {
    this.target.set(row);
    this.submitted.set(false);
    this.formError.set(null);
    this.form.reset({ action: '', reason: '' });
    this.applyReasonValidators('');

    this.respondModal = this.modal.open(tpl);
    this.respondModal.result.then(
      () => (this.respondModal = null),
      () => (this.respondModal = null),
    );
  }

  submitRespond(): void {
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
        // Acting changes the row's state, and the state is a column — refetch
        // the page the administrator is standing on rather than patching it.
        this.reload(this.paging()?.page ?? 1);
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

  /** `"20 oct 2026 · 8:00 a. m.–10:00 a. m."` — the booked WINDOW, not when it was requested. */
  private windowLabel(r: ReservationDto): string {
    const day = formatDay(r.dateLocal);
    const start = formatInstantAsTimeOfDay(r.startsAtUtc);
    const end = formatInstantAsTimeOfDay(r.endsAtUtc);
    return `${day} · ${start}–${end}`;
  }

  private reload(page: number): void {
    this.service.list(
      {
        amenityId: this.amenityControl.value || null,
        // `GET /reservations` does not accept a payment filter yet — the column
        // reports it, but narrowing by it has to happen server-side.
        paymentUploaded: null,
        fromUtc: this.fromControl.value ? toFromUtc(this.fromControl.value) : null,
        toUtc: this.toControl.value ? toToUtc(this.toControl.value) : null,
      },
      SORT,
      page,
      this.pageSize,
    );
  }
}
