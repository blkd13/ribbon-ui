import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { TenantEntity } from '../models/models';

@Injectable({ providedIn: 'root' })
export class TenantService {

  readonly http: HttpClient = inject(HttpClient);

  /**
   * テナント一覧を取得する（管理者向け）
   * @param isActive アクティブ状態でフィルタリング（オプション）
   */
  getTenants(isActive?: boolean): Observable<TenantEntity[]> {
    let params = new HttpParams();
    if (isActive !== undefined) {
      params = params.set('isActive', isActive.toString());
    }

    return this.http.get<TenantEntity[]>(`/maintainer/tenants`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 現在ログイン中のユーザーのテナント情報を取得する
   */
  getMyTenant(): Observable<TenantEntity> {
    return this.http.get<TenantEntity>(`/user/tenant/my`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 指定したIDのテナント情報を取得する
   * @param id テナントID
   */
  getTenantById(id: string): Observable<TenantEntity> {
    return this.http.get<TenantEntity>(`/user/tenant/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 新しいテナントを作成する（管理者向け）
   * @param tenant 作成するテナント情報
   */
  createTenant(tenant: Partial<TenantEntity>): Observable<TenantEntity> {
    return this.http.post<TenantEntity>(`/maintainer/tenant`, tenant).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * テナント情報を更新する（管理者向け）
   * @param id テナントID
   * @param tenant 更新するテナント情報
   */
  updateTenant(id: string, tenant: Partial<TenantEntity>): Observable<TenantEntity> {
    return this.http.put<TenantEntity>(`/maintainer/tenant/${id}`, tenant).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * テナントの有効/無効状態を切り替える（管理者向け）
   * @param id テナントID
   * @param isActive 設定するアクティブ状態
   */
  toggleTenantActive(id: string, isActive: boolean): Observable<TenantEntity> {
    return this.http.patch<TenantEntity>(`/maintainer/tenant/${id}/active`, { isActive }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * テナントを削除する（管理者向け）
   * @param id テナントID
   */
  deleteTenant(id: string): Observable<void> {
    return this.http.delete<void>(`/maintainer/tenant/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * テナントの統計情報を取得する（管理者向け）
   */
  getTenantStats(): Observable<{ total: number, active: number, inactive: number }> {
    return this.http.get<{ total: number, active: number, inactive: number }>(`/maintainer/tenant/stats`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * テナントを検索する（管理者向け）
   * @param query 検索クエリ
   */
  searchTenants(query: string): Observable<TenantEntity[]> {
    return this.getTenants().pipe(
      map(tenants => {
        if (!query.trim()) {
          return tenants;
        }

        const lowerQuery = query.toLowerCase();
        return tenants.filter(tenant =>
          tenant.name.toLowerCase().includes(lowerQuery) ||
          (tenant.description && tenant.description.toLowerCase().includes(lowerQuery))
        );
      }),
      catchError(this.handleError)
    );
  }

  /**
   * テナント間で切り替える（複数テナントへのアクセス権がある場合）
   * @param tenantId 切り替え先のテナントID
   */
  switchTenant(tenantId: string): Observable<{ success: boolean, message?: string }> {
    return this.http.post<{ success: boolean, message?: string }>(`/maintainer/tenant/switch`, { tenantId }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * エラーハンドリング
   */
  private handleError(error: any) {
    let errorMessage = '';
    if (error.error instanceof ErrorEvent) {
      // クライアント側のエラー
      errorMessage = `エラー: ${error.error.message}`;
    } else {
      // サーバー側のエラー
      const status = error.status || 'Unknown';
      const message = error.error?.message || error.statusText || 'Unknown error';
      errorMessage = `ステータスコード: ${status}, メッセージ: ${message}`;
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}
