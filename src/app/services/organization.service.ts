import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { OrganizationEntity } from '../models/models';

@Injectable({ providedIn: 'root' })
export class OrganizationService {

  readonly http: HttpClient = inject(HttpClient);

  /**
   * 組織一覧を取得する（管理者向け）
   * @param isActive アクティブ状態でフィルタリング（オプション）
   */
  getOrganizations(isActive?: boolean): Observable<OrganizationEntity[]> {
    let params = new HttpParams();
    if (isActive !== undefined) {
      params = params.set('isActive', isActive.toString());
    }

    return this.http.get<OrganizationEntity[]>(`/maintainer/organizations`, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 現在ログイン中のユーザーの組織情報を取得する
   */
  getMyOrganization(): Observable<OrganizationEntity> {
    return this.http.get<OrganizationEntity>(`/user/organization/my`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 指定したIDの組織情報を取得する
   * @param id 組織ID
   */
  getOrganizationById(id: string): Observable<OrganizationEntity> {
    return this.http.get<OrganizationEntity>(`/user/organization/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 新しい組織を作成する（管理者向け）
   * @param organization 作成する組織情報
   */
  createOrganization(organization: Partial<OrganizationEntity>): Observable<OrganizationEntity> {
    return this.http.post<OrganizationEntity>(`/maintainer/organization`, organization).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 組織情報を更新する（管理者向け）
   * @param id 組織ID
   * @param organization 更新する組織情報
   */
  updateOrganization(id: string, organization: Partial<OrganizationEntity>): Observable<OrganizationEntity> {
    return this.http.put<OrganizationEntity>(`/maintainer/organization/${id}`, organization).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 組織の有効/無効状態を切り替える（管理者向け）
   * @param id 組織ID
   * @param isActive 設定するアクティブ状態
   */
  toggleOrganizationActive(id: string, isActive: boolean): Observable<OrganizationEntity> {
    return this.http.patch<OrganizationEntity>(`/maintainer/organization/${id}/active`, { isActive }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 組織を削除する（管理者向け）
   * @param id 組織ID
   */
  deleteOrganization(id: string): Observable<void> {
    return this.http.delete<void>(`/maintainer/organization/${id}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 組織の統計情報を取得する（管理者向け）
   */
  getOrganizationStats(): Observable<{ total: number, active: number, inactive: number }> {
    return this.http.get<{ total: number, active: number, inactive: number }>(`/maintainer/organization/stats`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * 組織を検索する（管理者向け）
   * @param query 検索クエリ
   */
  searchOrganizations(query: string): Observable<OrganizationEntity[]> {
    return this.getOrganizations().pipe(
      map(organizations => {
        if (!query.trim()) {
          return organizations;
        }

        const lowerQuery = query.toLowerCase();
        return organizations.filter(organization =>
          organization.name.toLowerCase().includes(lowerQuery) ||
          (organization.description && organization.description.toLowerCase().includes(lowerQuery))
        );
      }),
      catchError(this.handleError)
    );
  }

  /**
   * 組織間で切り替える（複数組織へのアクセス権がある場合）
   * @param organizationId 切り替え先の組織ID
   */
  switchOrganization(organizationId: string): Observable<{ success: boolean, message?: string }> {
    return this.http.post<{ success: boolean, message?: string }>(`/maintainer/organization/switch`, { organizationId }).pipe(
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
