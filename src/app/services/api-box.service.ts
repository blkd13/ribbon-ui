import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, concat, concatMap, EMPTY, filter, from, map, merge, Observable, of, startWith, switchMap, tap, throwError, toArray } from 'rxjs';
import { BoxApiCollection, BoxApiCollectionItem, BoxApiCollectionList, BoxApiEventResponse, BoxApiFileItemEntry, BoxApiFolder, BoxApiFolderItemEntry, BoxApiFolderItemListResponse, BoxApiItemEntry, BoxApiPathCollection, BoxApiSearchResults, BoxMkdirErrorResponse } from '../pages/box/box-interface';
import { FullPathFile } from './file-manager.service';

const ITEM_QUERY = `fields=name,modified_at,modified_by,created_at,content_modified_at,shared_link,size,extension,lock,classification,permissions,version_number,url`; //,file_version,sequence_id,etag,representations //,files_count,filesCount,inviteRestrictionCode,invite_restriction_code

@Injectable({ providedIn: 'root' })
export class ApiBoxService {

  proxyBasePath = `/user/oauth/api/proxy/box`;
  basePath = `/user/oauth/api/box/box`;

  storageKey = 'box-v1.0';
  store: { [itemId: string]: BoxApiFolder } = localStorage.getItem(this.storageKey) ? JSON.parse(localStorage.getItem(this.storageKey) as string) : {};
  collectionStore: { [itemId: string]: BoxApiCollectionItem } = localStorage.getItem(this.storageKey) ? JSON.parse(localStorage.getItem(this.storageKey) as string) : {};

  private readonly http: HttpClient = inject(HttpClient);

  boxMe(): Observable<any> {
    const url = `${this.proxyBasePath}/2.0/users/me`;
    return this.http.get<any[]>(url);
  }

  private boxFolders(id: string = '0', offset: number = 0, limit: number = 100): Observable<BoxApiFolderItemListResponse> {
    const url = `${this.proxyBasePath}/2.0/folders/${id}/items?offset=${offset}&limit=${limit}&${ITEM_QUERY}`;
    return this.http.get<BoxApiFolderItemListResponse>(url);
  }

  boxSearch(keyword: string): Observable<BoxApiSearchResults> {
    return this.http.get<BoxApiSearchResults>(`${this.proxyBasePath}/2.0/search?query=${keyword}`);
  }

  // boxCollectionItem(id: string): Observable<BoxApiCollectionItem> {
  //   const url = `${this.proxyBasePath}/2.0/collections/${id}/items`;
  //   return this.http.get<BoxApiCollectionItem>(url);
  // }

  collectionItem(id: string, offset: number = 0, limit: number = 100): Observable<BoxApiCollectionItem> {
    const cached = this.collectionStore[id];
    const url = `${this.basePath}/2.0/collections/${id}/items`;

    const request$ = this.http.get<BoxApiCollectionItem>(`${url}?offset=${offset}&limit=${limit}&fromcache=true`).pipe(
      catchError(error => of(null)), // ここのエラーはキャッシュヒット有無でしかないのでエラーとして扱わずに握りつぶす。
      concatMap(firstResponse => {
        console.log('First API response:', firstResponse);
        // 初回レスポンスと直接API呼び出しを連結して処理
        return concat(
          of(firstResponse),
          // ここは普通のAPI呼出
          this.http.get<BoxApiCollectionItem>(url).pipe(
            tap(secondResponse => {
              console.log('Fallback API response:', secondResponse);
              // 最新結果が取れたらキャッシュを更新
              this.collectionStore[id] = secondResponse;
            }),
          ),
        );
      }),
      filter(response => response !== null), // null のレスポンスを除外
    );
    // キャッシュがあればストリームの先頭にキャッシュを流す
    return cached ? request$.pipe(startWith(cached)) : request$;
  }


  boxEvents(): Observable<BoxApiEventResponse> {
    const url = `${this.proxyBasePath}/2.0/events?stream_type=all`;
    return this.http.get<BoxApiEventResponse>(url);
  }

  boxRemoveItem(entry: BoxApiItemEntry): Observable<BoxApiFolderItemListResponse> {
    const url = `${this.proxyBasePath}/2.0/${entry.type}s/${entry.id}`;
    return this.http.delete<BoxApiFolderItemListResponse>(url);
  }

  // この2つは何がしたくて分けたのかわからなくなってしまった。。。
  boxCollection(id: string): Observable<BoxApiCollection> {
    id = id === '0' ? '' : `/${id}`;
    const url = `${this.proxyBasePath}/2.0/collections${id}`;
    return this.http.get<BoxApiCollection>(url).pipe();
  }
  getCollection(): Observable<BoxApiCollectionList> {
    const url = `${this.basePath}/2.0/collections`;
    return this.http.get<BoxApiCollectionList>(url).pipe(
      tap(collection => {
        if (collection.entries) {
          const set = new Set<string>();
          collection.entries = collection.entries.filter(item => {
            const flag = !set.has(item.id);
            set.add(item.id);
            return flag;
          });
        }
      }),
    );
  }

  registCollectionId(id: string): Observable<{ collection: BoxApiCollection, item: BoxApiCollectionItem }> {
    const url = `${this.basePath}/2.0/collections`;
    return this.http.post<{ collection: BoxApiCollection, item: BoxApiCollectionItem }>(url, { collectionId: id });
  }

  folderOld(id: string = '0', offset: number = 0, limit: number = 100): Observable<BoxApiFolder> {
    const storeKey = `${id}-${offset}-${limit}`;
    const cached = this.store[storeKey];
    const url = `${this.basePath}/2.0/folders/${id}`;

    const chache0 = { entries: [] } as { entries: (BoxApiFolderItemEntry | BoxApiFileItemEntry)[] };

    const request$ = this.http.get<BoxApiFolder>(`${url}?offset=${offset}&limit=${limit}&fromcache=true`).pipe(
      catchError(error => {
        console.log('Initial API call failed, falling back to direct API:', url);
        // 初回失敗時はエラーを握りつぶして直接API呼び出しを試みる
        return this.http.get<BoxApiFolder>(`${url}`);
      }),
      concatMap(firstResponse => {
        console.log('First API response:', firstResponse);
        // 初回レスポンスと直接API呼び出しを連結して処理
        return concat(
          of(firstResponse),
          this.http.get<BoxApiFolder>(url).pipe(
            catchError(error => {
              console.error('Fallback API call failed:', error);
              // エラー時には空の値を返して処理を継続
              return of(null as unknown as BoxApiFolder);
            }),
            tap(secondResponse => {
              console.log('Fallback API response:', secondResponse);
              // キャッシュを更新
              this.store[storeKey] = secondResponse;
              if (chache0.entries.length > 0) {
                this.store[storeKey].item_collection.entries = chache0.entries as any
              } else { }
              // localStorage.setItem(this.storageKey, JSON.stringify(this.store[storeKey]));
            }),
          ),
        );
      }),
      filter(response => response !== null), // null のレスポンスを除外
    );


    // if (cached) {
    //   // キャッシュがあれば「キャッシュを先に吐く → HTTPレスポンスを流す」の二発更新
    //   return request$.pipe(
    //     // 「ストリームの先頭にキャッシュを流す」(二発更新の 1 発目)
    //     startWith(cached),
    //   );
    // } else {
    //   // キャッシュが無ければ普通に HTTPレスポンスのみ流す
    //   return request$;
    // }

    // 「ストリームの先頭にキャッシュを流す」(二発更新の 1 発目)
    return merge(
      cached ? request$.pipe(startWith(cached)) : request$,
      this.boxFolders(id, offset, limit).pipe(
        map(response => {
          console.log('Folder items:', response);
          chache0.entries = response.entries;
          if (this.store[storeKey]) {
            this.store[storeKey].item_collection.entries = response.entries as any;
            return this.store[storeKey];
          } else {
            return null;
          }
        }),
        filter(response => response !== null),
      )
    );
  }

  folder(id: string = '0', offset: number = 0, limit: number = 100): Observable<BoxApiFolder> {
    const storeKey = `${id}-${offset}-${limit}`;
    const browserCache = this.store[storeKey];

    // APIから直接データを取得してキャッシュを更新するストリーム
    const apiData$ = this.http.get<BoxApiFolder>(`${this.basePath}/2.0/folders/${id}?offset=${offset}&limit=${limit}`).pipe(
      tap(response => {
        this.store[storeKey] = response;
      }),
      catchError(() => EMPTY),
    );

    // サーバーキャッシュ取得のストリーム
    const serverCache$ = this.http.get<BoxApiFolder>(`${this.basePath}/2.0/folders/${id}?offset=${offset}&limit=${limit}&fromcache=true`).pipe(
      catchError(() => EMPTY),
    );

    // 詳細情報取得のストリーム
    const details$ = this.boxFolders(id, offset, limit).pipe(
      map(response => {
        if (this.store[storeKey]) {
          this.store[storeKey].item_collection.entries = response.entries as any;
          return this.store[storeKey];
        }
        return null;
      }),
      filter(response => response !== null)
    );

    return concat(
      // 1.キャッシュを返すところ。ブラウザキャッシュがあればそれを返す。無ければサーバーキャッシュを取得
      browserCache ? of(browserCache) : serverCache$,
      // 2. APIから最新データを取得してキャッシュ更新
      apiData$,
      // 3. 詳細データを取得
      details$
    );
  }

  // TODO preloadはフォルダ纏めてドンした方が良いかもしれない・・・？いや、そうでもない・・・？
  preLoadFolder(id: string = '0', offset: number = 0, limit: number = 100): Observable<BoxApiFolder> {
    const storeKey = `${id}-${offset}-${limit}`;
    const browserCache = this.store[storeKey];

    // APIから直接データを取得してキャッシュを更新するストリーム
    const apiData$ = this.http.get<BoxApiFolder>(`${this.basePath}/2.0/folders/${id}?offset=${offset}&limit=${limit}`).pipe(
      tap(response => {
        this.store[storeKey] = response;
      })
    );

    // サーバーキャッシュ取得のストリーム。サーバーキャッシュが無ければAPIで最新版を取得
    const serverCache$ = this.http.get<BoxApiFolder>(`${this.basePath}/2.0/folders/${id}?offset=${offset}&limit=${limit}&fromcache=true`).pipe(
      catchError(() => {
        return apiData$;
      })
    );

    return concat(
      // 1.キャッシュを返すところ。ブラウザキャッシュがあればそれを返す。無ければサーバーキャッシュを取得
      browserCache ? of(browserCache) : serverCache$,
    );
  }

  uploadFiles(itemId: string, files: FullPathFile[]): Observable<BoxApiPathCollection> {
    /**
     * ディレクトリパスを1階層ずつ掘るためのリストを作成
     * @param directories 一意のディレクトリパス一覧
     * @returns 階層順に並べられたディレクトリリスト
     */
    function buildDirectoryHierarchy(directories: string[]): string[] {
      const allPaths = new Set<string>();

      directories.forEach(directory => {
        const parts = directory.split(/\/|\\/); // '/'または'\'で分割
        parts.pop(); // 末尾（ファイル）を削る
        let currentPath = '';
        parts.forEach(part => {
          currentPath = currentPath ? `${currentPath}/${part}` : part; // 階層を構築
          allPaths.add(currentPath);
        });
      });

      // ソートして階層順に整列
      return Array.from(allPaths).sort((a, b) => a.localeCompare(b));
    }

    // ディレクトリごと行けるようにするためにディレクトリ一覧に対してmkdirしてからファイルをアップロードする
    const directoryList = buildDirectoryHierarchy(files.map(file => file.fullPath));

    const direMap: { [pare: string]: string } = {};
    return from(directoryList).pipe(
      concatMap((dire, index) => {
        console.log(dire);
        const split = dire.split('/');
        const name = split.pop() || '';
        const id = direMap[split.join('/')] || itemId;
        return this.createFolder(name, id).pipe(
          tap(res => {
            direMap[dire] = res.id;
          }),
          catchError(error => {
            if (error.status === 409) {
              // 409エラーは既にディレクトリあるってだけなので、idをストックして継続する
              const data = error.error as BoxMkdirErrorResponse;
              direMap[dire] = data.context_info.conflicts[0].id;
              return of(data); // エラーを無視して空のObservableを返す
            } else {
              // 409以外のエラーはそのまま再スローする
              return throwError(() => error);
            }
          }),
        )
      }),
      toArray(),
      switchMap(
        res => from(files).pipe(
          concatMap((file, index) => {
            const split = file.fullPath.split('/');
            const name = split.pop() || '';
            const id = direMap[split.join('/')] || itemId;
            return this.uploadFile(file.file, id).pipe();
          }),
        )
      ),
    );
  }



  // フォルダを作成
  createFolder(folderName: string, parentId: string = '0'): Observable<BoxApiFolder> {
    const url = `${this.proxyBasePath}/2.0/folders`;
    const body = {
      name: folderName,
      parent: { id: parentId },
    };

    return this.http.post<BoxApiFolder>(url, body);
  }

  // ファイルをアップロード
  uploadFile(file: File, folderId: string): Observable<BoxApiPathCollection> {
    const formData = new FormData();
    formData.append('attributes', JSON.stringify({
      name: file.name,
      parent: { id: folderId },
    }));
    formData.append('file', file, file.name);
    const url = `${this.basePath}/2.0/files/content`;
    return this.http.post<BoxApiPathCollection>(url, formData);
  }
}

