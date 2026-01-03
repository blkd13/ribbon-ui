import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, of, tap } from 'rxjs';
import {
  ExtApiConnectionCheckResult,
  ExtApiProviderStatusItem,
  ExtApiProviderStatusResponse
} from '../models/ext-api-status.models';
import { GService } from './g.service';

@Injectable({ providedIn: 'root' })
export class ExtApiStatusService {

  readonly http: HttpClient = inject(HttpClient);
  readonly g: GService = inject(GService);

  private cachedStatuses: ExtApiProviderStatusItem[] = [];

  /**
   * 全プロバイダーの接続状態を取得
   * @param force キャッシュを無視して再取得する場合はtrue
   */
  getStatuses(force: boolean = false): Observable<ExtApiProviderStatusItem[]> {
    if (this.cachedStatuses.length && !force) {
      return of(this.cachedStatuses);
    }
    return this.http.get<ExtApiProviderStatusResponse>(`/user/ext-api/status`).pipe(
      tap(response => {
        this.cachedStatuses = response.providers;
      }),
      map(response => response.providers),
    );
  }

  /**
   * 特定プロバイダーの接続をテスト
   * @param provider プロバイダー識別子（例: box-default, gitlab-local）
   */
  checkConnection(provider: string): Observable<ExtApiConnectionCheckResult> {
    return this.http.get<ExtApiConnectionCheckResult>(`/user/ext-api/status/${provider}/check`);
  }

  /**
   * プロバイダーが接続済みかどうかを判定
   * @param provider プロバイダー識別子
   */
  isConnected(provider: string): Observable<boolean> {
    return this.getStatuses().pipe(
      map(statuses => {
        const status = statuses.find(s => s.provider === provider);
        return status?.connected === true;
      }),
    );
  }

  /**
   * OAuth ログインページへリダイレクト
   * @param provider プロバイダー識別子（例: box-default）
   * @param fromUrl ログイン後の遷移先URL
   */
  redirectToOAuthLogin(provider: string, fromUrl: string): void {
    const encodedFromUrl = encodeURIComponent(fromUrl);
    location.href = `/api/public/oauth/${this.g.info.user.orgKey}/${provider}/login?fromUrl=${encodedFromUrl}`;
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.cachedStatuses = [];
  }
}
