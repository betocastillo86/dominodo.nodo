import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { UpdateUserRequest, UserDto } from './resident-profile.models';

/**
 * Reads and edits a resident's own profile — name, email, document and
 * additional contacts — from the apartment detail. A `User` is global, so an
 * edit here is seen by every conjunto the person belongs to; the API accepts
 * that as a deliberate edit by someone holding users.edit (ADR-0029 §3).
 */
@Injectable({ providedIn: 'root' })
export class ResidentProfilesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/users`;

  getById(userId: string): Observable<UserDto> {
    return this.http.get<UserDto>(`${this.base}/${userId}`);
  }

  update(userId: string, body: UpdateUserRequest): Observable<void> {
    return this.http.put<void>(`${this.base}/${userId}`, body);
  }
}
