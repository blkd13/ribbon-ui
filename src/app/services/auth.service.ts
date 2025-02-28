import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { User, TwoFactorAuthDetails } from '../models/models';
import { PredictTransaction } from './department.service';

// export type OAuth2Provider = 'box' | 'mattermost' | 'gitlab' | 'gitea'; // この型定義は無意味。実際はプロバイダーIDと組み合わせて使うので
export type OAuth2Provider = string; // この型定義は無意味。
export type OAuthAccount = { id: string, userInfo: string, provider: string, providerUserId: string, providerEmail: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = '';
  private user!: User;
  private oAuthAccountList: OAuthAccount[] = [];
  readonly http: HttpClient = inject(HttpClient);

  public getCurrentUser(): User {
    // Assuming the token is stored in local storage
    if (this.user) return this.user;
    throw new Error('User not found');
  }

  public getCurrentOAuthAccountList(): OAuthAccount[] {
    return this.oAuthAccountList;
  }

  // --- ここから下は認証前とかユーザー登録とかの処理

  /**
   * ログイン処理。
   * @param email
   * @param password
   * @returns
   */
  login(email: string, password: string): Observable<User> {
    const url = `/login`;
    return this.http.post<{ user: User, token: string }>(url, { email, password })
      .pipe(map(response => {
        // localStorage.setItem('auth_token', response.token);
        this.user = response.user;
        return response.user;
      }));
  }

  /**
   * ゲストログイン
   * @returns
   */
  guestLogin(): Observable<User> {
    const url = `/guest`;
    return this.http.post<{ user: User, token: string }>(url, {})
      .pipe(map(response => {
        // localStorage.setItem('auth_token', response.token);
        this.user = response.user;
        return response.user;
      }));
  }

  /**
   * ログアウト
   */
  logout(): void {
    // ログアウトはsubscribeまでやってしまう。
    // TODO ちょっと変な気もするので後で見直し。
    this.getOAuthAccountList().subscribe({
      next: next => {
        if (next.oauthAccounts.find(value => value.provider === 'mattermost')) {
          this.http.post<void>(`/user/oauth/api/proxy/mattermost/api/v4/users/logout`, undefined, { headers: new HttpHeaders({ 'X-Requested-With': 'XMLHttpRequest' }) }).subscribe();
        } else { }
        if (next.oauthAccounts.find(value => value.provider === 'box')) {
          this.http.post<void>(`/user/oauth/api/proxy/box/oauth2/revoke`, '', { headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) }).subscribe();
        } else { }
      },
      error: error => {
        // ログアウトはsubscribeまでやってしまう。
        const url = `/logout`;
        this.http.get<void>(url).subscribe({
          next: next => {
            location.href = './';
          },
          error: error => {
            location.href = './';
          }
        });
      },
      complete: () => {
        // ログアウトはsubscribeまでやってしまう。
        const url = `/logout`;
        this.http.get<void>(url).subscribe({
          next: next => {
            location.href = './';
          },
          error: error => {
            location.href = './';
          }
        });
      }
    });
  }

  /**
   * ユーザー登録相当の処理。
   * メールアドレスに確認メールを送信する。
   * @param email
   * @returns
   */
  requestForPasswordReset(email: string): Observable<{ message: any }> {
    const url = `/request-for-password-reset`;
    return this.http.post<{ message: any }>(url, { email }).pipe(tap(res => {
      if (typeof res.message === 'string') {
        // メッセージが文字列だったら正常。
      } else {
        throw res.message;
      }
    }));
  }

  /**
   * 確認メールからのリンクをクリックしたときの処理。
   * パスワードリセット用のワンタイムトークンを発行する。
   * @param type
   * @param token
   * @returns
   */
  onetimeLogin(type: string, token: string): Observable<string> {
    const url = `/onetime`;
    return this.http.post<{ token: string }>(url, { type, token })
      .pipe(map(response => {
        sessionStorage.setItem(`${type}_token`, response.token);
        return response.token;
      }));
  }

  /**
   * パスワードリセット処理。
   * @param password
   * @param passwordConfirm
   * @returns
   */
  passwordReset(password: string, passwordConfirm: string): Observable<{ token: string, message: string }> {
    if (password === passwordConfirm) {
    } else {
      throw new Error('Password does not match');
    }
    const url = `/invite/password-reset`;
    return this.http.post<{ token: string, message: string, user: User }>(url,
      { password, passwordConfirm },
      { headers: new HttpHeaders({ 'Authorization': `Bearer ${sessionStorage.getItem('passwordReset_token')}` }) }
    ).pipe(map(response => {
      sessionStorage.removeItem('passwordReset_token');
      localStorage.setItem('auth_token', response.token);
      this.user = response.user;
      return response;
    }));
  }

  /**
   * AccessToken再生成（要は延長）
   * @returns
   */
  genAccessToken(): Observable<{}> {
    const url = `/user/access-token`;
    return this.http.get<{}>(url);
  }

  /**
   * APIキーを生成する。
   * @returns
   */
  genApiKey(label: string): Observable<{ apiToken: string }> {
    return this.http.post<{ apiToken: string }>(`/user/api-token`, { label });
  }

  // --- ここから下は普通にユーザー情報の取得とか更新とかの処理

  /**
   * ユーザー情報を取得する。
   * @returns
   */
  getUser(): Observable<User> {
    const url = `/user/user`;
    return this.http.get<{ user: User }>(url)
      .pipe(tap(response => this.user = response.user), map(res => res.user));
  }

  /**
   * ログイン中のユーザー情報を返す。
   */
  getUserInfo(): User {
    return this.user;
  }


  /**
   * ユーザー情報を更新する。
   * @param user
   * @returns
   */
  updateUser(user: User): Observable<User> {
    const url = `/user/user`;
    return this.http.patch<{ user: User, message: string }>(url, { user })
      .pipe(map(response => response.user));
  }

  /**
   * パスワードを変更する。
   * @param oldPassword
   * @param newPassword
   * @returns
   */
  changePassword(oldPassword: string, newPassword: string): Observable<User> {
    const url = `/user/change-password`;
    return this.http.patch<{ user: User, message: string }>(url, { oldPassword, newPassword })
      .pipe(map(response => response.user));
  }

  /**
   * ユーザーを削除する。
   * @returns
   */
  deleteUser(): Observable<void> {
    const url = `/user/user`;
    return this.http.delete<void>(url);
  }

  /**
   * OAuth2連携済み一覧
   * @returns
   */
  getOAuthAccountList(): Observable<{ oauthAccounts: OAuthAccount[] }> {
    const url = `/user/oauth/account`;
    return this.http.get<{ oauthAccounts: OAuthAccount[] }>(url).pipe(tap(res => this.oAuthAccountList = res.oauthAccounts));
  }

  /**
   * OAuth2連携済みアカウント情報
   * @returns
   */
  getOAuthAccount(provider: string): Observable<{ oauthAccount: OAuthAccount }> {
    const url = `/user/oauth/account/${provider}`;
    return this.http.get<{ oauthAccount: OAuthAccount }>(url).pipe(tap(res => {
      const oauth = this.oAuthAccountList.find(value => value.provider === provider);
      if (oauth) {
        Object.assign(oauth, res.oauthAccount);
      } else {
        this.oAuthAccountList.push(res.oauthAccount);
      }
    }));
  }

  // getOAuthUserInfo(provider: OAuth2Provider, api: 'user-info'): Observable<any> {
  //   const url = `/user/oauth/api/basic-api/${provider}/${api}`;
  //   return this.http.get<any>(url);
  // }

  isOAuth2Connected(provider: OAuth2Provider, api: 'user-info', targetUrl: string = ''): Observable<any> {
    targetUrl = targetUrl ? `?oAuth2ConnectedCheckTargetUrl=${targetUrl}` : '';
    const url = `/user/oauth/api/basic-api/${provider}/${api}${targetUrl}`;
    return this.http.get<any>(url);
  }

  postPincode(pincode?: string): Observable<User> {
    const url = `/invite/oauth-emailauth`;
    return this.http.post<User>(url,
      { pincode: pincode || '' },
      { headers: new HttpHeaders({ 'Authorization': `Bearer ${sessionStorage.getItem('oauth2MailAuth_token')}` }) }
    ).pipe(tap(ret => this.user = ret));
  }

  // ----

  getPredictHistory(): Observable<{ predictHistory: PredictTransaction[] }> {
    const url = `/user/predict-history`;
    return this.http.get<{ predictHistory: PredictTransaction[] }>(url);
  }

  setupTwoFactorAuth(userId: number): Observable<TwoFactorAuthDetails> {
    const url = `/auth/setup-two-factor`;
    return this.http.post<{ twoFactorAuthDetails: TwoFactorAuthDetails }>(url, { userId })
      .pipe(map(response => response.twoFactorAuthDetails));
  }

  verifyTwoFactorAuthCode(userId: number, code: string): Observable<boolean> {
    const url = `/auth/verify-two-factor`;
    return this.http.post<{ success: boolean }>(url, { userId, code })
      .pipe(map(response => response.success));
  }

  // Additional methods can be added below as needed
  private baseApiUrl = '/user/oauth/api-keys'; // バックエンドのエンドポイントに合わせて調整

  registApiKey(apiKey: Omit<OAuthAccount, 'id'>): Observable<OAuthAccount> {
    return this.http.post<OAuthAccount>(`${this.baseApiUrl}/${apiKey.provider}`, apiKey).pipe(
      tap(key => ({})),
      catchError(error => {
        console.error('API key creation error:', error);
        throw error;
      })
    );
  }

  deleteApiKey(provider: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseApiUrl}/${provider}/${id}`).pipe(
      catchError(error => {
        console.error('API key deletion error:', error);
        throw error;
      })
    );
  }
}
