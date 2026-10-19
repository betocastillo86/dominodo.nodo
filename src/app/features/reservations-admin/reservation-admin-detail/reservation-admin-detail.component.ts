import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TablerIconComponent } from 'angular-tabler-icons';
import { toMessage } from '../../../core/http/problem-details';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../shared/ui/spinner/spinner.component';
import { ApartmentDetailDto, apartmentLabel } from '../../apartments/data-access/apartment.models';
import { ApartmentsService } from '../../apartments/data-access/apartments.service';
import { formatDay } from '../../dashboard/data-access/date-range';
import {
  formatCurrencyCOP,
  formatInstant,
  formatInstantAsTimeOfDay,
} from '../../reservations/data-access/reservation-format';
import { ResidentInfo, ResidentInfoService } from '../data-access/resident-info.service';
import {
  RESERVATION_STATUS_BADGE,
  RESERVATION_STATUS_LABEL,
  ReservationDetailDto,
} from '../data-access/reservation.models';
import { ReservationsAdminService } from '../data-access/reservations-admin.service';

/**
 * Admin reservation detail. Read-only — this screen is for CONSULTING a booking
 * (who, where, when, paid or not), not for confirming/rejecting/cancelling it.
 *
 * `GET /reservations/{id}` returns less than a list row does: no `apartment`
 * block, no `paymentUploaded`, no `price`. So this screen rebuilds them —
 * the apartment with `GET /apartments/{id}` (needs `apartments.view`; falls
 * back to the raw id), the payment state from `paymentProofs`/`amountPaid`, and
 * the value from the area's policy. Resolving the resident's name/phone takes
 * one more call (`GET /users/{id}`, no permission needed). All three are one
 * request for one record — the LIST deliberately resolves nothing per row.
 */
@Component({
  selector: 'app-reservation-admin-detail',
  standalone: true,
  imports: [PageHeaderComponent, SpinnerComponent, EmptyStateComponent, RouterLink, TablerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservation-admin-detail.component.html',
})
export class ReservationAdminDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ReservationsAdminService);
  private readonly residentInfo = inject(ResidentInfoService);
  private readonly apartments = inject(ApartmentsService);

  private readonly id = this.route.snapshot.paramMap.get('id')!;

  readonly reservation = signal<ReservationDetailDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly resident = signal<ResidentInfo | null>(null);
  readonly residentLoading = signal(true);

  readonly apartment = signal<ApartmentDetailDto | null>(null);

  readonly statusLabel = RESERVATION_STATUS_LABEL;
  readonly statusBadge = RESERVATION_STATUS_BADGE;

  readonly title = computed(() => {
    const r = this.reservation();
    return r ? `Reserva ${r.code}` : 'Reserva';
  });

  readonly apartmentDisplay = computed(() => {
    const apartment = this.apartment();
    if (apartment) return apartmentLabel(apartment);
    return this.reservation()?.apartmentId ?? '—';
  });

  readonly residentName = computed(() => {
    const r = this.resident();
    return r ? `${r.firstName} ${r.lastName}`.trim() : null;
  });

  /** The area's price, from the policy the detail carries. */
  readonly priceLabel = computed(() => {
    const price = this.reservation()?.policy.price;
    return price == null ? '—' : formatCurrencyCOP(price);
  });

  /**
   * "Paid" here means a proof is in — the same thing the list's
   * `paymentUploaded` reports. `amountPaid` is what the staff recorded on
   * confirming, which is a separate (and optional) fact.
   */
  readonly paymentLabel = computed(() => {
    const r = this.reservation();
    if (!r) return '—';
    return r.paymentProofs.length > 0 ? 'Comprobante subido' : 'Sin comprobante';
  });

  readonly amountPaidLabel = computed(() => {
    const amount = this.reservation()?.amountPaid;
    return amount == null ? null : formatCurrencyCOP(amount);
  });

  constructor() {
    this.fetch();
  }

  windowLabel(r: ReservationDetailDto): string {
    const day = formatDay(r.dateLocal);
    const start = formatInstantAsTimeOfDay(r.startsAtUtc);
    const end = formatInstantAsTimeOfDay(r.endsAtUtc);
    return `${day} · ${start}–${end}`;
  }

  formatInstant(value: string): string {
    return formatInstant(value);
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.getById(this.id).subscribe({
      next: (reservation) => {
        this.reservation.set(reservation);
        this.loading.set(false);
        this.fetchResident(reservation.userId);
        this.fetchApartment(reservation.apartmentId);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(toMessage(error));
        this.loading.set(false);
      },
    });
  }

  private fetchResident(userId: string): void {
    this.residentLoading.set(true);
    this.residentInfo.getById(userId).subscribe({
      next: (resident) => {
        this.resident.set(resident);
        this.residentLoading.set(false);
      },
      // The booking itself is the important part; a failed resolve just leaves this card empty.
      error: () => {
        this.resident.set(null);
        this.residentLoading.set(false);
      },
    });
  }

  private fetchApartment(apartmentId: string): void {
    this.apartments.getById(apartmentId).subscribe({
      // Without `apartments.view` this 403s; the raw id is then what we show.
      next: (apartment) => this.apartment.set(apartment),
      error: () => this.apartment.set(null),
    });
  }
}
