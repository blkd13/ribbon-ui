import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

export type UserSettingKey = 'chatLayout';

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private apiUrl = '/user/user-setting'; // バックエンドのエンドポイント
  readonly http: HttpClient = inject(HttpClient);
  readonly auth: AuthService = inject(AuthService);

  chatLayout: 'flex' | 'grid' = 'flex'; // チャット画面のレイアウト
  setting: { value: Record<UserSettingKey, any> } = { value: { chatLayout: 'flex' } };

  toggleChatLayout(): Observable<Record<UserSettingKey, any>> {
    this.chatLayout = this.chatLayout === 'flex' ? 'grid' : 'flex';
    return this.upsertUserSetting({ value: { chatLayout: this.chatLayout } });
  }

  getUserSetting(): Observable<Record<UserSettingKey, any>> {
    const key: string = 'config';
    const userId = this.auth.getCurrentUser().id;
    return this.http.get<Record<UserSettingKey, any>>(`${this.apiUrl}/${userId}/${key}`).pipe(
      tap(setting => {
        console.log(setting);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * ユーザー設定を作成または更新 (アップサート)
   * @param setting ユーザー設定データ
   * @returns Observable<UserSetting>
   */
  upsertUserSetting(value: { value: Record<UserSettingKey, any> }): Observable<Record<UserSettingKey, any>> {
    const key: string = 'config';
    const userId = this.auth.getCurrentUser().id;
    Object.assign(this.setting, value);
    return this.http.post<Record<UserSettingKey, any>>(`${this.apiUrl}/${userId}/${key}`, value).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * エラーハンドリング
   * @param error HttpErrorResponse
   * @returns Observable<never>
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    console.error('UserSettingService error:', error);
    return throwError(() => new Error(error.message || 'サーバーエラーが発生しました'));
  }

}

export interface UserSetting {
  id?: string; // IDは作成後に付与される
  userId: string;
  key: string;
  value: any;
}

