import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** Minimal slice read from `GET /users/{id}` (`UserDto`) — just what the detail view needs. */
export interface ResidentInfo {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
}

/**
 * Resolves the resident who holds a booking, for the reservation detail view.
 * `GET /users/{id}` requires no permission beyond being authenticated (unlike
 * `GET /apartments/{id}`, which needs `apartments.view`), so this is safe to
 * call for any caller who can already see the reservation.
 */
@Injectable({ providedIn: 'root' })
export class ResidentInfoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/users`;

  getById(id: string): Observable<ResidentInfo> {
    return this.http.get<ResidentInfo>(`${this.base}/${id}`);
  }
}
