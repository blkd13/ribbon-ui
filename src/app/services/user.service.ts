import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { LoggerService } from './logger';

declare var _paq: any;


export namespace ConfigKeys {
  export type ChatLayout = 'flex' | 'grid';
  export type ChatTabLayout = 'tabs' | 'column';
  export type EnterMode = 'Ctrl+Enter' | 'Enter';
  export type Theme = 'system' | 'dark' | 'light' | 'dark-glass' | 'light-glass';
  export type Language = 'auto' | 'ja' | 'en' | 'zh';
  // 履歴を閉じる設定：0=閉じない、1=ユーザープロンプトのみ閉じる、2=両方閉じる
  export type HistoryCloseMode = 0 | 1 | 2;
}
export type Config = {
  // key: 'config',
  value: {
    chatLayout: ConfigKeys.ChatLayout,
    chatTabLayout: ConfigKeys.ChatTabLayout,
    enterMode: ConfigKeys.EnterMode,
    theme: ConfigKeys.Theme,
    historyCloseMode: ConfigKeys.HistoryCloseMode,
    language: ConfigKeys.Language,
  }
};

@Injectable({
  providedIn: 'root'
})
export class UserService {

  private apiUrl = '/user/user-setting'; // バックエンドのエンドポイント
  readonly http: HttpClient = inject(HttpClient);
  readonly auth: AuthService = inject(AuthService);
  readonly logger: LoggerService = inject(LoggerService);

  chatLayout: ConfigKeys.ChatLayout = 'flex'; // チャットエリアのレイアウト
  chatTabLayout: ConfigKeys.ChatTabLayout = 'column'; // チャットタブのレイアウト
  enterMode: ConfigKeys.EnterMode = 'Ctrl+Enter'; // Enterボタンだけで送信できるようにする
  theme: ConfigKeys.Theme = 'system'; // テーマ
  language: ConfigKeys.Language = 'auto'; // 言語設定
  historyCloseMode: ConfigKeys.HistoryCloseMode = 0;
  setting: Config = { value: { chatLayout: this.chatLayout, chatTabLayout: this.chatTabLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } };

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
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
  }

  toggleChatLayout(): Observable<Config> {
    this.chatLayout = this.chatLayout === 'flex' ? 'grid' : 'flex';
    _paq.push(['trackEvent', 'AIチャット画面操作', '高さ揃え切替', this.chatLayout]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
  }

  setTheme(theme: ConfigKeys.Theme): Observable<Config> {
    this.theme = theme;
    _paq.push(['trackEvent', 'ユーザー設定', 'テーマ切替', this.theme]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
  }

  applyTheme(theme: ConfigKeys.Theme): void {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
      theme = prefersDark.matches ? 'dark' : 'light';
    } else {
      theme = `${theme}` as 'dark' | 'light';
    }
    document.body.classList.remove('dark-theme', 'light-theme', 'dark-theme', 'light-theme');
    document.body.classList.add(theme + '-theme');
  }

  setEnterMode(enterMode: ConfigKeys.EnterMode = 'Ctrl+Enter'): Observable<Config> {
    this.enterMode = enterMode;
    _paq.push(['trackEvent', '設定', 'Enterモード', this.enterMode]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
  }

  setHistoryCloseMode(historyCloseMode: ConfigKeys.HistoryCloseMode): Observable<Config> {
    this.historyCloseMode = historyCloseMode;
    _paq.push(['trackEvent', 'ユーザー設定', '履歴閉じる設定', this.historyCloseMode]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
  }

  setLanguage(language: ConfigKeys.Language): Observable<Config> {
    this.language = language;
    _paq.push(['trackEvent', 'ユーザー設定', '言語切替', this.language]);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
  }

  saveSetting(theme: ConfigKeys.Theme, enterMode: ConfigKeys.EnterMode = 'Ctrl+Enter', historyCloseMode?: ConfigKeys.HistoryCloseMode, language?: ConfigKeys.Language, noTracking?: boolean): Observable<Config> {
    this.theme = theme;
    this.enterMode = enterMode;
    if (historyCloseMode !== undefined) {
      this.historyCloseMode = historyCloseMode;
    }
    if (language !== undefined) {
      this.language = language;
    }

    if (!noTracking) {
    _paq.push(['trackEvent', 'ユーザー設定', 'Enterモード', this.enterMode]);
    _paq.push(['trackEvent', 'ユーザー設定', 'テーマ切替', this.theme]);
    if (language !== undefined) {
      _paq.push(['trackEvent', 'ユーザー設定', '言語切替', this.language]);
    }
    } else { }
    this.applyTheme(theme);
    return this.upsertUserSetting({ value: { chatTabLayout: this.chatTabLayout, chatLayout: this.chatLayout, enterMode: this.enterMode, theme: this.theme, language: this.language, historyCloseMode: this.historyCloseMode } });
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
          this.language = setting.value.language || 'auto';
          this.historyCloseMode = setting.value.historyCloseMode || 0;
          this.applyTheme(this.theme);
        } else { }
        this.logger.debug('User setting retrieved:', setting);
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
    this.logger.error('UserSettingService error:', error);
    return throwError(() => new Error(error.message || 'サーバーエラーが発生しました'));
  }

}

export interface UserSetting {
  id?: string; // IDは作成後に付与される
  userId: string;
  key: string;
  value: any;
}

