import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, forkJoin } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';
import {
  ContextHub,
  ContextHubForView,
  ContextHubCreateDto,
  ContextHubUpdateDto,
  ContextResource,
  ContextResourceForView,
  ContextResourceCreateDto,
  ContextResourceUpdateDto,
  ContextResourceProviderType,
  ProviderOption,
} from '../models/context-hub.models';
import { ExtApiProviderService } from './ext-api-provider.service';
import { ExtApiStatusService } from './ext-api-status.service';
import { UUID } from '../models/project-models';

@Injectable({ providedIn: 'root' })
export class ContextHubService {
  private readonly http = inject(HttpClient);
  private readonly extApiProviderService = inject(ExtApiProviderService);
  private readonly extApiStatusService = inject(ExtApiStatusService);

  private readonly baseUrl = '/user/context-hub';

  // 現在選択中のContext Hub
  private currentHubSubject = new BehaviorSubject<ContextHubForView | null>(null);
  currentHub$ = this.currentHubSubject.asObservable();

  // ============================================
  // Context Hub CRUD
  // ============================================

  /** プロジェクトのContext Hubを取得（なければ作成） */
  getOrCreateHub(projectId: UUID): Observable<ContextHubForView> {
    return this.http.get<ContextHubForView>(`${this.baseUrl}/project/${projectId}`).pipe(
      catchError(() => {
        // 存在しない場合は新規作成
        return this.createHub({
          projectId,
          name: 'Default Context Hub',
          description: 'プロジェクトのデフォルトContext Hub',
        });
      }),
      tap(hub => this.currentHubSubject.next(hub)),
    );
  }

  /** Context Hubを作成 */
  createHub(dto: ContextHubCreateDto): Observable<ContextHubForView> {
    return this.http.post<ContextHubForView>(this.baseUrl, dto).pipe(
      tap(hub => this.currentHubSubject.next(hub)),
    );
  }

  /** Context Hubを更新 */
  updateHub(hubId: UUID, dto: ContextHubUpdateDto): Observable<ContextHubForView> {
    return this.http.patch<ContextHubForView>(`${this.baseUrl}/${hubId}`, dto).pipe(
      tap(hub => this.currentHubSubject.next(hub)),
    );
  }

  /** Context Hubを削除 */
  deleteHub(hubId: UUID): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${hubId}`).pipe(
      tap(() => this.currentHubSubject.next(null)),
    );
  }

  // ============================================
  // Context Resource CRUD
  // ============================================

  /** リソースを追加 */
  addResource(dto: ContextResourceCreateDto): Observable<ContextResourceForView> {
    return this.http.post<ContextResourceForView>(`${this.baseUrl}/resource`, dto).pipe(
      tap(() => this.refreshCurrentHub()),
    );
  }

  /** リソースを更新 */
  updateResource(resourceId: UUID, dto: ContextResourceUpdateDto): Observable<ContextResourceForView> {
    return this.http.patch<ContextResourceForView>(`${this.baseUrl}/resource/${resourceId}`, dto).pipe(
      tap(() => this.refreshCurrentHub()),
    );
  }

  /** リソースを削除 */
  deleteResource(resourceId: UUID): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/resource/${resourceId}`).pipe(
      tap(() => this.refreshCurrentHub()),
    );
  }

  /** リソースの同期を実行 */
  syncResource(resourceId: UUID): Observable<ContextResourceForView> {
    return this.http.post<ContextResourceForView>(`${this.baseUrl}/resource/${resourceId}/sync`, {}).pipe(
      tap(() => this.refreshCurrentHub()),
    );
  }

  /** 全リソースの同期を実行 */
  syncAllResources(hubId: UUID): Observable<ContextHubForView> {
    return this.http.post<ContextHubForView>(`${this.baseUrl}/${hubId}/sync-all`, {}).pipe(
      tap(hub => this.currentHubSubject.next(hub)),
    );
  }

  // ============================================
  // プロバイダー情報取得
  // ============================================

  /** 利用可能なプロバイダー一覧を取得 */
  getAvailableProviders(): Observable<ProviderOption[]> {
    // 静的プロバイダー（認証不要）
    const staticProviders: ProviderOption[] = [
      {
        type: 'local',
        name: 'local',
        label: 'ローカルファイル',
        icon: 'folder',
        isConnected: true,
        authType: 'none',
      },
      {
        type: 'web',
        name: 'web',
        label: 'Webサイト',
        icon: 'language',
        isConnected: true,
        authType: 'none',
      },
    ];

    // 新しい一括取得APIで全プロバイダーの接続状態を取得
    return this.extApiStatusService.getStatuses().pipe(
      map(statuses => {
        const dynamicProviders: ProviderOption[] = statuses.map(status => ({
          type: this.mapProviderType(status.type),
          name: status.provider.split('-').slice(1).join('-'), // "box-default" -> "default"
          label: status.label,
          icon: this.getProviderIcon(status.type),
          isConnected: status.connected,
          authType: status.authType === 'OAuth2' ? 'oauth2' : 'apikey',
        }));
        return [...staticProviders, ...dynamicProviders];
      }),
      catchError(() => of(staticProviders)),
    );
  }

  /** プロバイダータイプをマッピング */
  private mapProviderType(type: string): ContextResourceProviderType {
    const typeMap: Record<string, ContextResourceProviderType> = {
      'box': 'box',
      'gitlab': 'gitlab',
      'gitea': 'gitea',
      'mattermost': 'mattermost',
      'confluence': 'confluence',
      'jira': 'jira',
    };
    return typeMap[type] || 'local';
  }

  /** プロバイダーのアイコンを取得 */
  private getProviderIcon(type: string): string {
    const iconMap: Record<string, string> = {
      'box': 'cloud',
      'gitlab': 'code',
      'gitea': 'code',
      'mattermost': 'chat',
      'confluence': 'article',
      'jira': 'bug_report',
      'local': 'folder',
      'web': 'language',
    };
    return iconMap[type] || 'storage';
  }

  /** 認証タイプを取得 */
  private getAuthType(type: string): 'oauth2' | 'apikey' | 'none' {
    const authMap: Record<string, 'oauth2' | 'apikey' | 'none'> = {
      'box': 'oauth2',
      'gitlab': 'oauth2',
      'gitea': 'oauth2',
      'mattermost': 'oauth2',
      'confluence': 'apikey',
      'jira': 'apikey',
    };
    return authMap[type] || 'none';
  }

  // ============================================
  // ヘルパー
  // ============================================

  /** 現在のHubを再読み込み */
  private refreshCurrentHub(): void {
    const currentHub = this.currentHubSubject.getValue();
    if (currentHub) {
      this.http.get<ContextHubForView>(`${this.baseUrl}/${currentHub.id}`).pipe(
        tap(hub => this.currentHubSubject.next(hub)),
      ).subscribe();
    }
  }

  /** プロバイダータイプ別にリソースをグループ化 */
  groupResourcesByType(resources: ContextResourceForView[]): Map<ContextResourceProviderType, ContextResourceForView[]> {
    const grouped = new Map<ContextResourceProviderType, ContextResourceForView[]>();

    resources.forEach(resource => {
      const existing = grouped.get(resource.providerType) || [];
      existing.push(resource);
      grouped.set(resource.providerType, existing);
    });

    return grouped;
  }

  /** プロバイダータイプの表示名を取得 */
  getProviderTypeLabel(type: ContextResourceProviderType): string {
    const labelMap: Record<ContextResourceProviderType, string> = {
      'local': 'ローカルファイル',
      'box': 'Box',
      'confluence': 'Confluence',
      'jira': 'Jira',
      'gitlab': 'GitLab',
      'gitea': 'Gitea',
      'mattermost': 'Mattermost',
      'web': 'Webサイト',
    };
    return labelMap[type];
  }
}
