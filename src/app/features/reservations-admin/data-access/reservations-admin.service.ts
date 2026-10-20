import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { toMessage } from '../../../core/http/problem-details';
import { PagedResult } from '../../../core/models/paged-result';
import {
  AttachmentDownloadUrl,
  ConfirmReservationRequest,
  ReservationDetailDto,
  ReservationDto,
  ReservationFilters,
  ReservationReasonRequest,
  ReservationSort,
} from './reservation.models';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Data-access for the admin Reservations module. Read-only (list + detail) —
 * there is no create/edit/cancel/confirm here, that lifecycle lives elsewhere.
 * List state lives as signals; `X-Tenant` is attached globally by
 * `tenantInterceptor`.
 *
 * The API defaults to the latest window first, so the sort is always sent
 * explicitly: this screen is about what is coming up next.
 */
@Injectable({ providedIn: 'root' })
export class ReservationsAdminService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/reservations`;

  private readonly _items = signal<ReservationDto[]>([]);
  private readonly _paging = signal<PagedResult<ReservationDto> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly paging = this._paging.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Load a page of reservations applying the (server-supported) filters and sort. */
  list(
    filters: ReservationFilters,
    sort: ReservationSort,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): void {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('sortBy', sort.sortBy)
      .set('direction', sort.direction);
    if (filters.amenityId) params = params.set('amenityId', filters.amenityId);
    if (filters.apartmentId) params = params.set('apartmentId', filters.apartmentId);
    if (filters.status) params = params.set('status', filters.status);
    // Three independent ranges — booked window, request date, pending deadline.
    if (filters.fromUtc) params = params.set('fromUtc', filters.fromUtc);
    if (filters.toUtc) params = params.set('toUtc', filters.toUtc);
    if (filters.createdFromUtc) params = params.set('createdFromUtc', filters.createdFromUtc);
    if (filters.createdToUtc) params = params.set('createdToUtc', filters.createdToUtc);
    if (filters.expiresFromUtc) params = params.set('expiresFromUtc', filters.expiresFromUtc);
    if (filters.expiresToUtc) params = params.set('expiresToUtc', filters.expiresToUtc);
    // `GET /reservations` carries `paymentUploaded` on each ROW but does not yet
    // accept it as a filter, so nothing sets this today — the plumbing is here
    // so enabling the filter is a template change once the API takes the param.
    if (filters.paymentUploaded !== null) {
      params = params.set('paymentUploaded', filters.paymentUploaded);
    }

    this.http.get<PagedResult<ReservationDto>>(this.base, { params }).subscribe({
      next: (result) => {
        this._items.set(result.items);
        this._paging.set(result);
        this._loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this._items.set([]);
        this._paging.set(null);
        this._error.set(toMessage(error));
        this._loading.set(false);
      },
    });
  }

  /** Fetch the full detail of one reservation (`GET /reservations/{id}`). */
  getById(id: string): Observable<ReservationDetailDto> {
    return this.http.get<ReservationDetailDto>(`${this.base}/${id}`);
  }

  /**
   * Approve a PENDING booking (`POST /reservations/{id}/confirm`, requires
   * `reservations.edit`). `amountPaid` is optional and merely RECORDED — this
   * screen does not collect it, so it always goes null. `comment` is the
   * approver's optional note: an empty one goes as null rather than `''`, which
   * is what the domain stores for it anyway.
   */
  confirm(
    id: string,
    amountPaid: number | null = null,
    comment: string | null = null,
  ): Observable<void> {
    const body: ConfirmReservationRequest = { amountPaid, comment: comment?.trim() || null };
    return this.http.post<void>(`${this.base}/${id}/confirm`, body);
  }

  /**
   * Reject a PENDING booking with a mandatory reason, releasing its slot
   * (`POST /reservations/{id}/reject`, requires `reservations.edit`).
   */
  reject(id: string, reason: string): Observable<void> {
    const body: ReservationReasonRequest = { reason };
    return this.http.post<void>(`${this.base}/${id}/reject`, body);
  }

  /**
   * A short-lived (~5 min) SAS to read one payment proof out of the PRIVATE
   * container (`GET /reservations/{id}/payment-proofs/{proofId}/download-url`,
   * needs `reservations.view`). There is no lasting URL to cache: unlike an
   * amenity photo, a proof is somebody's financial record.
   */
  getPaymentProofDownloadUrl(id: string, proofId: string): Observable<AttachmentDownloadUrl> {
    return this.http.get<AttachmentDownloadUrl>(
      `${this.base}/${id}/payment-proofs/${proofId}/download-url`,
    );
  }

  /**
   * Cancel a pending or confirmed booking with a mandatory reason
   * (`POST /reservations/{id}/cancel`). Needs `reservations.cancel` — a
   * DIFFERENT permission from the other two, and the one that also exempts
   * staff from the area's cancellation notice period.
   */
  cancel(id: string, reason: string): Observable<void> {
    const body: ReservationReasonRequest = { reason };
    return this.http.post<void>(`${this.base}/${id}/cancel`, body);
  }
}
