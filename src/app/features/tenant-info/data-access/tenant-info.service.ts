import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { TenantContactInfoDto, UpdateTenantInfoRequest } from './tenant-info.models';

/**
 * Data-access for the "Mi Conjunto" module. A single record, not a list — the
 * conjunto is the one resolved from `X-Tenant` (attached globally by
 * `tenantInterceptor`), so neither call takes an id.
 */
@Injectable({ providedIn: 'root' })
export class TenantInfoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/tenants/info`;

  /** Read the contact info of the caller's own conjunto. */
  get(): Observable<TenantContactInfoDto> {
    return this.http.get<TenantContactInfoDto>(this.baseUrl);
  }

  /** Replace the contact info of the caller's own conjunto. */
  update(body: UpdateTenantInfoRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, body);
  }
}
