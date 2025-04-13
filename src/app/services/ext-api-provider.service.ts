import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';
import { ExtApiProviderEntity, ExtApiProviderTemplateEntity } from '../models/models';
import { MakeOptional } from '../utils';
import { BaseEntityFields } from '../models/project-models';

@Injectable({ providedIn: 'root' })
export class ExtApiProviderService {

  readonly http: HttpClient = inject(HttpClient);
  private stockedApiProviders: ExtApiProviderEntity[] = [];
  private stockedApiProviderTemplates: ExtApiProviderTemplateEntity[] = [];

  getApiProvidersNonAuth(tenantKey: string): Observable<ExtApiProviderEntity[]> {
    return this.http.get<ExtApiProviderEntity[]>(`/public/${tenantKey}/ext-api-providers`);
  }

  getApiProviders(): Observable<ExtApiProviderEntity[]> {
    if (this.stockedApiProviders.length) {
      return new Observable<ExtApiProviderEntity[]>(observer => {
        observer.next(this.stockedApiProviders);
        observer.complete();
      });
    } else {
      return this.http.get<ExtApiProviderEntity[]>(`/user/ext-api-providers`).pipe(
        tap((apiProviders: ExtApiProviderEntity[]) => {
          this.stockedApiProviders = apiProviders;
        })
      );
    }
  }

  getApiProvider(provider: string): Observable<ExtApiProviderEntity> {
    return this.getApiProviders().pipe(
      map(apiProviders => {
        const apiProvider = apiProviders.find(providerItem => `${providerItem.type}-${providerItem.name}` === provider);
        if (!apiProvider) {
          throw new Error(`API Provider not found: ${provider}`);
        }
        return apiProvider;
      }));
  }

  createApiProvider(apiProvider: MakeOptional<ExtApiProviderEntity, BaseEntityFields>): Observable<ExtApiProviderEntity> {
    return this.http.post<ExtApiProviderEntity>(`/admin/ext-api-provider`, apiProvider);
  }

  updateApiProvider(apiProvider: ExtApiProviderEntity): Observable<ExtApiProviderEntity> {
    return this.http.put<ExtApiProviderEntity>(`/admin/ext-api-provider/${apiProvider.id}`, apiProvider);
  }

  deleteApiProvider(id: string): Observable<void> {
    return this.http.delete<void>(`/admin/ext-api-provider/${id}`);
  }

  getApiProviderTemplates(): Observable<ExtApiProviderTemplateEntity[]> {
    return this.http.get<ExtApiProviderTemplateEntity[]>(`/admin/ext-api-provider-templates`);
  }

  upsertApiProviderTemplate(apiProvider: MakeOptional<ExtApiProviderTemplateEntity, BaseEntityFields>): Observable<ExtApiProviderTemplateEntity> {
    return this.http.post<ExtApiProviderTemplateEntity>(`/maintainer/ext-api-provider-template`, apiProvider);
  }

  createApiProviderTemplate(apiProvider: MakeOptional<ExtApiProviderTemplateEntity, BaseEntityFields>): Observable<ExtApiProviderTemplateEntity> {
    return this.http.post<ExtApiProviderTemplateEntity>(`/maintainer/ext-api-provider-template`, apiProvider);
  }

  updateApiProviderTemplate(apiProvider: ExtApiProviderTemplateEntity): Observable<ExtApiProviderTemplateEntity> {
    return this.http.put<ExtApiProviderTemplateEntity>(`/maintainer/ext-api-provider-template/${apiProvider.id}`, apiProvider);
  }

  deleteApiProviderTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`/maintainer/ext-api-provider-template/${id}`);
  }

}