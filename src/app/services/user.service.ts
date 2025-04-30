import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

declare var _paq: any;

export type UserSettingKey = 'chatLayout' | 'chatTabLayout' | 'enterMode' | 'theme';
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
  theme: 'system' | 'light' | 'dark' = 'system'; // テーマ
  setting: Config = { value: { chatLayout: this.chatLayout, chatTabLayout: this.chatTabLayout, enterMode: this.enterMode, theme: this.theme } };

  constructor() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
    this.theme = prefersDark.matches ? 'dark' : 'light';
    this.applyTheme(this.theme);
    // システム設定が変わったときに対応
    prefersDark.addEventListener('change', (e) => {
      this.applyTheme(this.theme);
    });
  }

  toggleChatTabLayout(): Observable<Config> {
    this.chatTabLayout = this.chatTabLayout === 'column' ? 'tabs' : 'column';
    _paq.push(['trackEvent', 'AIチャット画面操作', 'タブ/列切替', this.chatTabLayout]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme } });
  }

  toggleChatLayout(): Observable<Config> {
    this.chatLayout = this.chatLayout === 'flex' ? 'grid' : 'flex';
    _paq.push(['trackEvent', 'AIチャット画面操作', '高さ揃え切替', this.chatLayout]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme } });
  }

  setTheme(theme: 'system' | 'dark' | 'light'): Observable<Config> {
    this.theme = theme;
    _paq.push(['trackEvent', 'ユーザー設定', 'テーマ切替', this.theme]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme } });
  }

  applyTheme(theme: 'system' | 'dark' | 'light'): void {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      theme = prefersDark.matches ? 'dark' : 'light';
    } else { }
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(theme + '-theme');
  }

  setEnterMode(enterMode: 'Enter' | 'Ctrl+Enter' = 'Ctrl+Enter'): Observable<Config> {
    this.enterMode = enterMode;
    _paq.push(['trackEvent', '設定', 'Enterモード', this.enterMode]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme } });
  }

  saveSetting(theme: 'system' | 'dark' | 'light', enterMode: 'Enter' | 'Ctrl+Enter' = 'Ctrl+Enter'): Observable<Config> {
    this.theme = theme;
    this.enterMode = enterMode;
    _paq.push(['trackEvent', 'ユーザー設定', 'Enterモード', this.enterMode]);
    _paq.push(['trackEvent', 'ユーザー設定', 'テーマ切替', this.theme]);
    this.applyTheme(theme);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme } });
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
          this.theme = setting.value.theme || 'system';
          this.applyTheme(this.theme);
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

