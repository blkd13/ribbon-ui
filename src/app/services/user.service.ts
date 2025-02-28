import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

declare var _paq: any;

export type UserSettingKey = 'chatLayout' | 'chatTabLayout' | 'enterMode';
export type Config = { value: Record<UserSettingKey, any> };
@Injectable({
  providedIn: 'root'
})
export class UserService {

  private apiUrl = '/user/user-setting'; // バックエンドのエンドポイント
  readonly http: HttpClient = inject(HttpClient);
  readonly auth: AuthService = inject(AuthService);

  chatLayout: 'flex' | 'grid' = 'flex'; // チャット画面のレイアウト
  chatTabLayout: 'tabs' | 'column' = 'column'; // チャットタブのレイアウト
  enterMode: 'Ctrl+Enter' | 'Enter' = 'Ctrl+Enter'; // Enterボタンだけで送信できるようにする
  setting: Config = { value: { chatLayout: 'flex', chatTabLayout: 'column', enterMode: 'Ctrl+Enter' } };

  toggleChatTabLayout(): Observable<Config> {
    this.chatTabLayout = this.chatTabLayout === 'column' ? 'tabs' : 'column';
    _paq.push(['trackEvent', 'AIチャット画面操作', 'タブ/列切替', this.chatTabLayout]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode } });
  }

  toggleChatLayout(): Observable<Config> {
    this.chatLayout = this.chatLayout === 'flex' ? 'grid' : 'flex';
    _paq.push(['trackEvent', 'AIチャット画面操作', '高さ揃え切替', this.chatLayout]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode } });
  }

  setEnterMode(enterMode: 'Enter' | 'Ctrl+Enter' = 'Ctrl+Enter'): Observable<Config> {
    this.enterMode = enterMode;
    _paq.push(['trackEvent', '設定', 'Enterモード', this.enterMode]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode } });
  }

  getUserSetting(): Observable<Config> {
    const key: string = 'config';
    const userId = this.auth.getCurrentUser().id;
    return this.http.get<Config>(`${this.apiUrl}/${userId}/${key}`).pipe(
      tap(setting => {
        if (key === 'config' && setting.value) {
          this.chatLayout = setting.value.chatLayout || 'flex';
          this.chatTabLayout = setting.value.chatTabLayout || 'column';
          this.enterMode = setting.value.enterMode || 'Ctrl+Enter';
        } else { }
        // console.log(setting);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * ユーザー設定を作成または更新 (アップサート)
   * @param setting ユーザー設定データ
   * @returns Observable<UserSetting>
   */
  upsertUserSetting(value: Config): Observable<Config> {
    const key: string = 'config';
    const userId = this.auth.getCurrentUser().id;
    Object.assign(this.setting, value);
    return this.http.post<Config>(`${this.apiUrl}/${userId}/${key}`, value).pipe(
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

