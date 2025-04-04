import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ExtApiProviderEntity } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ExtApiProviderService {

  readonly http: HttpClient = inject(HttpClient);

  getApiProviders(tenantKey?: string): Observable<ExtApiProviderEntity[]> {
    let url = `/user/tenant`;
    if (tenantKey) {
      url += `?tenantKey=${tenantKey}`;
    }
    return this.http.get<ExtApiProviderEntity[]>(url);
  }

  getApiProviderById(id: string): Observable<ExtApiProviderEntity> {
    return this.http.get<ExtApiProviderEntity>(`/user/${id}`);
  }

  createApiProvider(apiProvider: ExtApiProviderEntity): Observable<ExtApiProviderEntity> {
    return this.http.post<ExtApiProviderEntity>(`/admin/ext-api-provider`, apiProvider);
  }

  updateApiProvider(apiProvider: ExtApiProviderEntity): Observable<ExtApiProviderEntity> {
    return this.http.put<ExtApiProviderEntity>(`/admin/ext-api-provider/${apiProvider.id}`, apiProvider);
  }

  deleteApiProvider(id: string): Observable<void> {
    return this.http.delete<void>(`/admin/ext-api-provider/${id}`);
  }

  getApiProvidersByType(type: string, tenantKey?: string): Observable<ExtApiProviderEntity[]> {
    let url = `/admin/ext-api-provider/type/${type}`;
    if (tenantKey) {
      url += `?tenantKey=${tenantKey}`;
    }
    return this.http.get<ExtApiProviderEntity[]>(url);
  }
}