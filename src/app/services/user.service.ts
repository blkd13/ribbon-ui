import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';

declare var _paq: any;

export type UserSettingKey = 'chatLayout' | 'chatTabLayout' | 'enterMode' | 'theme' | 'historyCloseMode';
export type Config = { value: Record<UserSettingKey, any> };
@Injectable({
  providedIn: 'root'
})
export class UserService {

  private apiUrl = '/user/user-setting'; // バックエンドのエンドポイント
  readonly http: HttpClient = inject(HttpClient);
  readonly auth: AuthService = inject(AuthService);

  chatLayout: 'flex' | 'grid' = 'flex'; // チャットエリアのレイアウト
  chatTabLayout: 'tabs' | 'column' = 'column'; // チャットタブのレイアウト
  enterMode: 'Ctrl+Enter' | 'Enter' = 'Ctrl+Enter'; // Enterボタンだけで送信できるようにする
  theme: 'system' | 'light' | 'dark' = 'system'; // テーマ
  // 履歴を閉じる設定：0=閉じない、1=ユーザープロンプトのみ閉じる、2=両方閉じる
  historyCloseMode: 0 | 1 | 2 = 0;
  setting: Config = { value: { chatLayout: this.chatLayout, chatTabLayout: this.chatTabLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } };

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
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } });
  }

  toggleChatLayout(): Observable<Config> {
    this.chatLayout = this.chatLayout === 'flex' ? 'grid' : 'flex';
    _paq.push(['trackEvent', 'AIチャット画面操作', '高さ揃え切替', this.chatLayout]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } });
  }

  setTheme(theme: 'system' | 'dark' | 'light'): Observable<Config> {
    this.theme = theme;
    _paq.push(['trackEvent', 'ユーザー設定', 'テーマ切替', this.theme]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } });
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
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } });
  }

  setHistoryCloseMode(historyCloseMode: 0 | 1 | 2): Observable<Config> {
    this.historyCloseMode = historyCloseMode;
    _paq.push(['trackEvent', 'ユーザー設定', '履歴閉じる設定', this.historyCloseMode]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } });
  }

  saveSetting(theme: 'system' | 'dark' | 'light', enterMode: 'Enter' | 'Ctrl+Enter' = 'Ctrl+Enter', historyCloseMode?: 0 | 1 | 2): Observable<Config> {
    this.theme = theme;
    this.enterMode = enterMode;
    if (historyCloseMode !== undefined) {
      this.historyCloseMode = historyCloseMode;
    }
    _paq.push(['trackEvent', 'ユーザー設定', 'Enterモード', this.enterMode]);
    _paq.push(['trackEvent', 'ユーザー設定', 'テーマ切替', this.theme]);
    this.applyTheme(theme);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, historyCloseMode: this.historyCloseMode } });
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
          this.historyCloseMode = setting.value.historyCloseMode || 0;
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

