import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** User shape returned by `GET /users/{id}` (`UsersUserDto`). Typed as the API returns it. */
export interface UserDto {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: string;
  phoneVerified: boolean;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

/**
 * Read-only user lookup for the request-detail view. Resolves a userId → user
 * profile (name + phone) for participants and comment authors. Uses the users
 * endpoint (not memberships) so it works for any user regardless of their
 * membership status. X-Tenant is attached globally by tenantInterceptor.
 */
@Injectable({ providedIn: 'root' })
export class UsersLookupService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/users`;

  /** One user by id. A 404/error resolves to null so a single miss never breaks the batch. */
  getById(id: string): Observable<UserDto | null> {
    return this.http.get<UserDto>(`${this.base}/${id}`).pipe(catchError(() => of(null)));
  }

  /** Fetch several users by id (deduplicated). Failed lookups are dropped from the result. */
  getByIds(ids: string[]): Observable<UserDto[]> {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return of<UserDto[]>([]);
    return forkJoin(unique.map((id) => this.getById(id))).pipe(
      map((users) => users.filter((u): u is UserDto => u !== null)),
    );
  }
}
