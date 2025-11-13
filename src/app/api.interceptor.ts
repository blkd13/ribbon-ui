import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './services/auth.service';
import { GService } from './services/g.service';
import { LoggerService } from './services/logger';

@Injectable()
export class ApiInterceptor implements HttpInterceptor {

  private httpConnectCount = 0;
  private isRefreshing = false; // リフレッシュ中フラグ
  private refreshSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null); // リフレッシュ完了通知用
  // private lastRun: number = Date.now();
  readonly g: GService = inject(GService);
  readonly router: Router = inject(Router);
  readonly logger: LoggerService = inject(LoggerService);
  readonly authService: AuthService = inject(AuthService);

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    let url;
    // パスだけ取得？
    // let url = request.url.replace(/https?:\/\/[^/]+/g, '').replace('//', '/').replace(/^\//g, '');
    let method = request.method;
    // this.logger.debug(`${method} ${url}`);
    // 開発環境の場合はローカルのjsonファイルに向ける
    // !environment.production ||
    if (request.url.endsWith('.json') || request.url.endsWith('.jsonl')) {
      // .jsonとかはassets系だと思われるので何もしない。
      return next.handle(request);
    } else if (this.g.queries['isMock']) {
      url = request.url.replace(/https?:\/\/[^/]+/g, '').replace('//', '/').replace(/^\//g, '').replace(/\/$/, '');
      url = `assets/mock/api/${url}-${request.method}.json`;
      method = 'GET';
    } else if (request.url.startsWith('/')) {
      // 本番環境の場合は環境変数で指定したAPIのエンドポイントに向ける
      url = `${environment.apiUrl}/${request.url}`.replaceAll(/\/\/*/g, '/');
      // this.logger.debug(`intercepted:${url}`);
    } else {
      // request.headers.set('Authorization', 'xxx');
    }

    // url = `${location.origin}${location.pathname.replaceAll(/\/$/g, '')}${url}`;
    // this.logger.debug(`intercepted:${url}`);
    request = request.clone({ url, method, headers: request.headers.set('X-App-Version', this.g.version) });

    // // 同時リクエストが多くなるとブラウザエラーになることがあったので適当に遅延させる機能を付けた
    // // pipe(delay)だと結果読み出しが遅延するだけで発射が遅延しないのでsetTimeoutを使う
    // let delayTime = 0;
    // if (Date.now() - this.lastRun < 10) {
    //     delayTime = Math.random() * 0;
    //     // this.logger.debug(`delay ${delayTime}[ms]`); // tslint:disable-line:no-console
    // } else { }
    // this.lastRun = Date.now();
    // return of(null).pipe(
    //     delayWhen(() => timer(delayTime)),    // リクエストの発射を遅らせる
    //     switchMap(() => next.handle(request)) // 実際のリクエストを処理
    // );
    // 手間だけど結局settimeoutで遅延させるのが一番確実
    // return new Observable<HttpEvent<any>>((observer) => {
    //     setTimeout(() => {
    //         next.handle(request).subscribe({
    //             next: (event) => { observer.next(event); },
    //             error: (err) => { observer.error(err); },
    //             complete: () => { observer.complete(); },
    //         });
    //     }, delayTime);
    // });

    // ローディング表示をするためにリクエストの開始と終了を通知する
    this.g.httpConnectCount.next(++this.httpConnectCount);
    return next.handle(request)
      .pipe(
        // ログインページにリダイレクトするために401エラーをキャッチする
        catchError((error: HttpErrorResponse) => {
          if (error.status === 401) {
            if (request.url.endsWith(`/public/auth/refresh`)) {
              // リフレッシュAPI自体が401の場合は、通常の401処理を行う
              return this.handle401Error(request, error);
            } else {
              // refresh以外の時はリフレッシュを呼んでからリトライする
              return this.handleTokenRefreshAndRetry(request, next);
            }
          } else { }
          return throwError(() => error);
        }),
        finalize(() => {
          // ローディング表示をするためにリクエストの開始と終了を通知する
          this.g.httpConnectCount.next(--this.httpConnectCount);
        })
      );
  }

  /**
   * トークンリフレッシュとリクエスト再送信を処理する
   */
  private handleTokenRefreshAndRetry(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this.isRefreshing) {
      // 既にリフレッシュ中の場合は、リフレッシュ完了まで待機してからリトライ
      return this.refreshSubject.pipe(
        filter(result => result !== null), // nullでない値（リフレッシュ完了）まで待機
        take(1), // 最初の完了通知のみ取得
        switchMap((result) => {
          if (result === true) {
            // リフレッシュ成功 → 元のリクエストを再送信
            return next.handle(request);
          } else {
            // リフレッシュ失敗 → 401エラー処理
            return this.handle401Error(request, result);
          }
        })
      );
    }

    this.isRefreshing = true;
    this.logger.info('Token expired. Attempting to refresh...');

    return this.authService.refresh().pipe(
      switchMap(() => {
        // リフレッシュ成功後、元のリクエストを再送信
        this.logger.info('Token refreshed successfully. Retrying original request.');
        this.isRefreshing = false;
        this.refreshSubject.next(true); // 他の待機中リクエストに成功を通知

        // 次回のリフレッシュのためにBehaviorSubjectをリセット
        setTimeout(() => this.refreshSubject.next(null), 100);

        return next.handle(request);
      }),
      catchError((refreshError) => {
        // リフレッシュに失敗した場合は、通常の401処理を行う
        this.isRefreshing = false;
        this.refreshSubject.next(refreshError); // 他の待機中リクエストに失敗を通知

        // 次回のリフレッシュのためにBehaviorSubjectをリセット
        setTimeout(() => this.refreshSubject.next(null), 100);

        this.logger.error('Token refresh failed:', refreshError);
        return this.handle401Error(request, refreshError);
      })
    );
  }

  /**
   * 通常の401エラー処理（ログインページへのリダイレクトなど）
   */
  private handle401Error(request: HttpRequest<any>, error: HttpErrorResponse): Observable<never> {
    // OAuth認証されているかどうかで自動でリダイレクトする仕組み
    let targetUrlObject: URL;
    // 絶対パス(http://やhttps://)で始まらない場合
    if (!/^https?:\/\//i.test(request.url)) {
      // 先頭に'http://dummy.com'を付与して、絶対URLに変換（適当なダミードメイン）
      targetUrlObject = new URL('http://dummy.com' + (request.url.startsWith('/') ? '' : '/') + request.url);
    } else {
      targetUrlObject = new URL(request.url);
    }
    const fromUrlObject = new URL(location.href);
    // const oAuth2ConnectedCheckTargetUrl = targetUrlObject.searchParams.get('oAuth2ConnectedCheckTargetUrl');
    // if (oAuth2ConnectedCheckTargetUrl) {
    //   fromUrlObject.hash = '/' + oAuth2ConnectedCheckTargetUrl;
    // } else {
    // }

    const fromUrl = encodeURIComponent(fromUrlObject.toString());
    if (request.url.startsWith(`/api/user/oauth/api/`) && !request.url.includes('/logout') && !request.url.includes('/revoke')) { // logoutは除外する
      const [_0, _1, _2, _3, _4, _5, providerType, provierName] = request.url.split('/');
      // ログインページにリダイレクトする場合、リクエストURLを保存しておく
      location.href = `/api/public/oauth/${this.g.info.user.orgKey}/${providerType}-${provierName}/login?fromUrl=${fromUrl}`;
      this.logger.info(`redirect to login page: ${location.href}`);
    } else if (request.url.startsWith(`/api/user/oauth/account/`) && !request.url.includes('/logout') && !request.url.includes('/revoke')) { // logoutは除外する
      const [_0, _1, _2, _3, _4, providerType, provierName] = request.url.split('/');
      // ログインページにリダイレクトする場合、リクエストURLを保存しておく
      location.href = `/api/public/oauth/${this.g.info.user.orgKey}/${providerType}-${provierName}/login?fromUrl=${fromUrl}`;
      this.logger.info(`redirect to login page: ${location.href}`);
    } else {
      // 未認証の場合、ログインページにリダイレクト
      this.router.navigate([`${this.g.isMobilePrefix}login`]);
    }

    return throwError(() => error);
  }
}
