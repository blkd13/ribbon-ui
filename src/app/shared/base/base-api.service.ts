import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, tap, finalize } from 'rxjs/operators';

/**
 * API操作の基底サービスクラス
 * 共通のCRUD操作、エラーハンドリング、キャッシング機能を提供
 */
@Injectable()
export abstract class BaseApiService<T, CreateDto = Partial<T>, UpdateDto = Partial<T>> {
  protected readonly http = inject(HttpClient);
  
  protected abstract baseUrl: string;
  protected abstract entityName: string; // エラーメッセージ用のエンティティ名（日本語）

  // キャッシュ機能
  protected cache = new Map<string, T>();
  protected listCache: T[] | null = null;
  private loadingSubject = new BehaviorSubject<boolean>(false);
  
  public loading$ = this.loadingSubject.asObservable();

  /**
   * 全件取得
   * @param force キャッシュを無視して強制取得するか
   * @returns Observable<T[]>
   */
  getAll(force = false): Observable<T[]> {
    if (!force && this.listCache) {
      return new Observable(subscriber => {
        subscriber.next(this.listCache!);
        subscriber.complete();
      });
    }

    this.setLoading(true);
    return this.http.get<T[]>(this.baseUrl).pipe(
      tap(items => {
        this.listCache = items;
        this.updateCache(items);
      }),
      catchError(error => this.handleError(error, `${this.entityName}一覧の取得`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * ID指定取得
   * @param id ID
   * @param force キャッシュを無視して強制取得するか
   * @returns Observable<T>
   */
  getById(id: string, force = false): Observable<T> {
    if (!force && this.cache.has(id)) {
      return new Observable(subscriber => {
        subscriber.next(this.cache.get(id)!);
        subscriber.complete();
      });
    }

    this.setLoading(true);
    return this.http.get<T>(`${this.baseUrl}/${id}`).pipe(
      tap(item => {
        this.cache.set(id, item);
      }),
      catchError(error => this.handleError(error, `${this.entityName}の取得`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * 新規作成
   * @param item 作成データ
   * @returns Observable<T>
   */
  create(item: CreateDto): Observable<T> {
    this.setLoading(true);
    return this.http.post<T>(this.baseUrl, item).pipe(
      tap(createdItem => {
        this.invalidateListCache();
        this.addToCache(createdItem);
      }),
      catchError(error => this.handleError(error, `${this.entityName}の作成`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * 更新
   * @param id ID
   * @param item 更新データ
   * @returns Observable<T>
   */
  update(id: string, item: UpdateDto): Observable<T> {
    this.setLoading(true);
    return this.http.put<T>(`${this.baseUrl}/${id}`, item).pipe(
      tap(updatedItem => {
        this.invalidateListCache();
        this.cache.set(id, updatedItem);
      }),
      catchError(error => this.handleError(error, `${this.entityName}の更新`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * 部分更新
   * @param id ID
   * @param item 更新データ
   * @returns Observable<T>
   */
  patch(id: string, item: Partial<UpdateDto>): Observable<T> {
    this.setLoading(true);
    return this.http.patch<T>(`${this.baseUrl}/${id}`, item).pipe(
      tap(updatedItem => {
        this.invalidateListCache();
        this.cache.set(id, updatedItem);
      }),
      catchError(error => this.handleError(error, `${this.entityName}の更新`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * 削除
   * @param id ID
   * @returns Observable<void>
   */
  delete(id: string): Observable<void> {
    this.setLoading(true);
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        this.invalidateListCache();
        this.cache.delete(id);
      }),
      catchError(error => this.handleError(error, `${this.entityName}の削除`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * 条件検索
   * @param params 検索パラメータ
   * @returns Observable<T[]>
   */
  search(params: { [key: string]: any }): Observable<T[]> {
    this.setLoading(true);
    let httpParams = new HttpParams();
    
    Object.keys(params).forEach(key => {
      const value = params[key];
      if (value !== null && value !== undefined && value !== '') {
        httpParams = httpParams.set(key, value.toString());
      }
    });

    return this.http.get<T[]>(`${this.baseUrl}/search`, { params: httpParams }).pipe(
      catchError(error => this.handleError(error, `${this.entityName}の検索`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * ページング取得
   * @param page ページ番号
   * @param size ページサイズ
   * @param sort ソート条件
   * @returns Observable<{ items: T[], total: number, page: number, size: number }>
   */
  getPage(page: number, size: number, sort?: string): Observable<{
    items: T[];
    total: number;
    page: number;
    size: number;
  }> {
    this.setLoading(true);
    let httpParams = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    
    if (sort) {
      httpParams = httpParams.set('sort', sort);
    }

    return this.http.get<{ items: T[], total: number, page: number, size: number }>(
      `${this.baseUrl}/page`, { params: httpParams }
    ).pipe(
      tap(result => {
        this.updateCache(result.items);
      }),
      catchError(error => this.handleError(error, `${this.entityName}一覧の取得`)),
      finalize(() => this.setLoading(false))
    );
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.cache.clear();
    this.listCache = null;
  }

  /**
   * 指定IDのキャッシュクリア
   * @param id ID
   */
  clearCacheById(id: string): void {
    this.cache.delete(id);
    this.invalidateListCache();
  }

  /**
   * リストキャッシュの無効化
   */
  protected invalidateListCache(): void {
    this.listCache = null;
  }

  /**
   * キャッシュに追加
   * @param item アイテム
   */
  protected addToCache(item: T): void {
    const id = this.extractId(item);
    if (id) {
      this.cache.set(id, item);
    }
  }

  /**
   * キャッシュを更新
   * @param items アイテム配列
   */
  protected updateCache(items: T[]): void {
    items.forEach(item => {
      this.addToCache(item);
    });
  }

  /**
   * エラーハンドリング
   * @param error HTTPエラー
   * @param operation 操作名
   * @returns Observable<never>
   */
  protected handleError(error: HttpErrorResponse, operation: string): Observable<never> {
    let errorMessage = '';

    if (error.error instanceof ErrorEvent) {
      // クライアントサイドエラー
      errorMessage = `${operation}に失敗しました: ${error.error.message}`;
    } else {
      // サーバーサイドエラー
      const status = error.status || 'Unknown';
      const message = error.error?.message || error.statusText || 'Unknown error';
      
      switch (error.status) {
        case 400:
          errorMessage = `${operation}に失敗しました: 入力内容を確認してください`;
          break;
        case 401:
          errorMessage = `${operation}に失敗しました: 認証が必要です`;
          break;
        case 403:
          errorMessage = `${operation}に失敗しました: アクセス権限がありません`;
          break;
        case 404:
          errorMessage = `${operation}に失敗しました: ${this.entityName}が見つかりません`;
          break;
        case 409:
          errorMessage = `${operation}に失敗しました: データが競合しています`;
          break;
        case 500:
          errorMessage = `${operation}に失敗しました: サーバーエラーが発生しました`;
          break;
        default:
          errorMessage = `${operation}に失敗しました: ${message}`;
      }
    }

    console.error(`${operation} error:`, error);
    return throwError(() => new Error(errorMessage));
  }

  /**
   * ローディング状態を設定
   * @param loading ローディング状態
   */
  private setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  /**
   * エンティティからIDを抽出（継承クラスでオーバーライド可能）
   * @param item エンティティ
   * @returns ID文字列
   */
  protected extractId(item: T): string | null {
    if (typeof item === 'object' && item !== null) {
      const obj = item as any;
      return obj.id || obj._id || obj.uuid || null;
    }
    return null;
  }

  /**
   * カスタムエンドポイント呼び出し
   * @param endpoint エンドポイント
   * @param method HTTPメソッド
   * @param body リクエストボディ
   * @param params クエリパラメータ
   * @returns Observable<any>
   */
  protected callCustomEndpoint(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' = 'GET',
    body?: any,
    params?: { [key: string]: string }
  ): Observable<any> {
    this.setLoading(true);
    
    let httpParams = new HttpParams();
    if (params) {
      Object.keys(params).forEach(key => {
        httpParams = httpParams.set(key, params[key]);
      });
    }

    const url = `${this.baseUrl}/${endpoint}`;
    const options = { params: httpParams };

    let request: Observable<any>;
    switch (method) {
      case 'GET':
        request = this.http.get(url, options);
        break;
      case 'POST':
        request = this.http.post(url, body, options);
        break;
      case 'PUT':
        request = this.http.put(url, body, options);
        break;
      case 'DELETE':
        request = this.http.delete(url, options);
        break;
      case 'PATCH':
        request = this.http.patch(url, body, options);
        break;
    }

    return request.pipe(
      catchError(error => this.handleError(error, `${endpoint}の実行`)),
      finalize(() => this.setLoading(false))
    );
  }
}