import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TenantFilesService } from '../../../core/files/tenant-files.service';
import { handoffContext } from '../../../core/handoff/handoff.context';
import { PagedResult } from '../../../core/models/paged-result';
import {
  AmenityAvailability,
  AmenityDetail,
  AttachmentDownloadUrl,
  ConfirmReservationPaymentProofRequest,
  CreateReservationPaymentProofUploadUrlRequest,
  CreateReservationRequest,
  MyReservation,
  ReservationDetailDto,
  ReservationPaymentProofDto,
  ReservationPaymentProofUploadTicket,
} from './reservation-availability.models';

const MY_RESERVATIONS_PAGE_SIZE = 100;

/**
 * Data-access for the resident booking screen (ADR-0018). Every call runs as the
 * handoff session (`handoffContext()`) — never the portal's own — since this
 * feature is reachable only through a redeemed handoff ticket.
 *
 * Stateless on purpose: this screen has exactly one reader
 * (`ReservationAvailabilityComponent`), so there is no list state worth lifting
 * into signals here, unlike the paged-table convention the CRUD modules follow.
 * `create` follows that same convention — a write returns an Observable the
 * component manages.
 */
@Injectable({ providedIn: 'root' })
export class ReservationAvailabilityService {
  private readonly http = inject(HttpClient);
  private readonly files = inject(TenantFilesService);
  private readonly amenitiesUrl = `${environment.apiBaseUrl}/amenities`;
  private readonly reservationsUrl = `${environment.apiBaseUrl}/reservations`;

  getAmenity(amenityId: string): Observable<AmenityDetail> {
    return this.http.get<AmenityDetail>(`${this.amenitiesUrl}/${amenityId}`, {
      context: handoffContext(),
    });
  }

  /** `from`/`to` are `yyyy-MM-dd` local days, inclusive — the API caps the range at 31 days. */
  getAvailability(amenityId: string, from: string, to: string): Observable<AmenityAvailability> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<AmenityAvailability>(`${this.amenitiesUrl}/${amenityId}/availability`, {
      params,
      context: handoffContext(),
    });
  }

  /**
   * The resident's own bookings, across every area — `GET /reservations/mine`
   * has no amenity or date filter, so narrowing to this amenity/month happens
   * client-side. One page comfortably covers any realistic resident history.
   */
  getMyReservations(): Observable<PagedResult<MyReservation>> {
    const params = new HttpParams().set('page', 1).set('pageSize', MY_RESERVATIONS_PAGE_SIZE);
    return this.http.get<PagedResult<MyReservation>>(`${this.reservationsUrl}/mine`, {
      params,
      context: handoffContext(),
    });
  }

  /**
   * Books the slot. The booking is born `Confirmed`, or `Pending` when the area
   * requires approval or payment (ADR-0018 §2) — the response says which, and
   * the caller shows the resident the right thing.
   */
  create(request: CreateReservationRequest): Observable<MyReservation> {
    return this.http.post<MyReservation>(this.reservationsUrl, request, {
      context: handoffContext(),
    });
  }

  // ── Payment proofs (ADR-0018 §5) ───────────────────────────────────────────

  /**
   * One booking in full — `GET /reservations/{id}`. The resident reaches it as
   * the holder (the endpoint is dual-mode: holder OR `reservations.view`), and
   * it is the only read that carries `paymentProofs`: neither the 201 of
   * `POST /reservations` nor the rows of `/reservations/mine` do.
   */
  getReservation(reservationId: string): Observable<ReservationDetailDto> {
    return this.http.get<ReservationDetailDto>(`${this.reservationsUrl}/${reservationId}`, {
      context: handoffContext(),
    });
  }

  /**
   * Step 1 of the direct-to-blob upload: the API mints a 15-minute pre-signed
   * PUT and never sees the bytes. The cap of five proofs is spent at step 3,
   * not here — this route hands out a URL even on a full booking.
   */
  createPaymentProofUploadUrl(
    reservationId: string,
    body: CreateReservationPaymentProofUploadUrlRequest,
  ): Observable<ReservationPaymentProofUploadTicket> {
    return this.http.post<ReservationPaymentProofUploadTicket>(
      `${this.reservationsUrl}/${reservationId}/payment-proofs/upload-url`,
      body,
      { context: handoffContext() },
    );
  }

  /**
   * Step 2: PUT the bytes straight to Blob Storage. No `handoffContext()` and
   * no `X-Tenant` — the target is not our API, the SAS in the URL is the whole
   * credential, and both interceptors skip non-API hosts on purpose.
   */
  uploadPaymentProof(uploadUrl: string, file: File): Observable<void> {
    return this.files.upload(uploadUrl, file, file.type);
  }

  /**
   * Step 3: adopt the uploaded blob as a proof of this booking. Attaching a
   * proof does NOT confirm the reservation — it stays `Pending` until the
   * administration confirms it (ADR-0018 §5).
   */
  confirmPaymentProof(
    reservationId: string,
    body: ConfirmReservationPaymentProofRequest,
  ): Observable<ReservationPaymentProofDto> {
    return this.http.post<ReservationPaymentProofDto>(
      `${this.reservationsUrl}/${reservationId}/payment-proofs`,
      body,
      { context: handoffContext() },
    );
  }

  /** A short-lived SAS to read one proof back out of the private container. */
  getPaymentProofDownloadUrl(
    reservationId: string,
    proofId: string,
  ): Observable<AttachmentDownloadUrl> {
    return this.http.get<AttachmentDownloadUrl>(
      `${this.reservationsUrl}/${reservationId}/payment-proofs/${proofId}/download-url`,
      { context: handoffContext() },
    );
  }
}
