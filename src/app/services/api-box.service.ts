import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, concat, concatMap, filter, from, map, merge, Observable, of, startWith, tap } from 'rxjs';
import { BoxApiCollection, BoxApiCollectionItem, BoxApiCollectionList, BoxApiEventResponse, BoxApiFileItemEntry, BoxApiFolder, BoxApiFolderItemEntry, BoxApiFolderItemListResponse, BoxApiSearchResults } from '../pages/box/box-interface';
import e from 'express';

const ITEM_QUERY = `fields=name,modified_at,modified_by,created_at,content_modified_at,shared_link,size,extension,lock,classification,permissions`;

@Injectable({ providedIn: 'root' })
export class ApiBoxService {

  proxyBasePath = `/user/oauth/api/proxy/box`;
  basePath = `/user/oauth/api/box/box`;

  storageKey = 'box-v1.0';
  store: { [itemId: string]: BoxApiFolder } = localStorage.getItem(this.storageKey) ? JSON.parse(localStorage.getItem(this.storageKey) as string) : {};

  private readonly http: HttpClient = inject(HttpClient);

  boxMe(): Observable<any> {
    const url = `${this.proxyBasePath}/2.0/users/me`;
    return this.http.get<any[]>(url);
  }

  boxFolders(id: string = '0'): Observable<BoxApiFolderItemListResponse> {
    const url = `${this.proxyBasePath}/2.0/folders/${id}/items?${ITEM_QUERY}`;
    return this.http.get<BoxApiFolderItemListResponse>(url);
  }

  boxSearch(keyword: string): Observable<BoxApiSearchResults> {
    return this.http.get<BoxApiSearchResults>(`${this.proxyBasePath}/2.0/search?query=${keyword}`);
  }

  boxCollection(id: string): Observable<BoxApiCollection> {
    id = id === '0' ? '' : `/${id}`;
    const url = `${this.proxyBasePath}/2.0/collections${id}`;
    return this.http.get<BoxApiCollection>(url);
  }

  boxCollectionItem(id: string): Observable<BoxApiCollectionItem> {
    const url = `${this.proxyBasePath}/2.0/collections/${id}/items`;
    return this.http.get<BoxApiCollectionItem>(url);
  }

  boxEvents(): Observable<BoxApiEventResponse> {
    const url = `${this.proxyBasePath}/2.0/events?stream_type=all`;
    return this.http.get<BoxApiEventResponse>(url);
  }

  getCollection(): Observable<BoxApiCollectionList> {
    const url = `${this.basePath}/2.0/collections`;
    return this.http.get<BoxApiCollectionList>(url);
  }

  registCollectionId(id: string): Observable<{ collection: BoxApiCollection, item: BoxApiCollectionItem }> {
    const url = `${this.basePath}/2.0/collections`;
    return this.http.post<{ collection: BoxApiCollection, item: BoxApiCollectionItem }>(url, { collectionId: id });
  }

  folder(id: string = '0'): Observable<BoxApiFolder> {
    const cached = this.store[id];
    const url = `${this.basePath}/2.0/folders/${id}`;

    const chache0 = { entries: [] } as { entries: (BoxApiFolderItemEntry | BoxApiFileItemEntry)[] };

    const request$ = this.http.get<BoxApiFolder>(`${url}?fromcache=true`).pipe(
      catchError(error => {
        console.log('Initial API call failed, falling back to direct API:', url);
        // 初回失敗時に直接API呼び出しを試みる
        return this.http.get<BoxApiFolder>(url);
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
              this.store[id] = secondResponse;
              if (chache0.entries.length > 0) {
                this.store[id].item_collection.entries = chache0.entries as any
              } else { }
              // localStorage.setItem(this.storageKey, JSON.stringify(this.store));
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
      this.boxFolders(id).pipe(
        map(response => {
          console.log('Folder items:', response);
          chache0.entries = response.entries;
          if (this.store[id]) {
            this.store[id].item_collection.entries = response.entries as any;
            return this.store[id];
          } else {
            return null;
          }
        }),
        filter(response => response !== null),
      )
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
  uploadFile(file: File, folderId: string): Observable<{ upload_url: string, upload_token: string }> {
    const formData = new FormData();
    formData.append('attributes', JSON.stringify({
      name: file.name,
      parent: { id: folderId },
    }));
    formData.append('file', file, file.name);
    const url = `${this.basePath}/2.0/files/content`;
    return this.http.post<{ upload_url: string, upload_token: string }>(url, formData);
    // return this.http.post<{ upload_url: string, upload_token: string }>(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    //   // return this.http.post<{ entries: BoxApiFolder[] }>(url, formData);
    //   return this.http.post<{ upload_url: string, upload_token: string }>(url, { name: file.name, parent: { id: folderId }, size: file.size }).pipe(
    //     tap(res => {
    //       console.log(res);
    //       res.upload_url;
    //       const formData = new FormData();
    //       const attributes = {
    //         name: file.name,
    //         parent: { id: folderId }, // 親フォルダのID
    //       };

    //       formData.append('attributes', JSON.stringify(attributes));
    //       formData.append('file', this.selectedFile, this.selectedFile.name);

    //       const headers = new HttpHeaders({
    //         'Authorization': `Bearer ${this.accessToken}`,
    //       });

    //       this.http.post('https://upload.box.com/api/2.0/files/content', formData, { headers })
    //         .subscribe(
    //           (response) => {
    //             console.log('Upload successful:', response);
    //             // アップロード成功時の処理
    //           },
    //           (error) => {
    //             console.error('Upload failed:', error);
    //             // アップロード失敗時の処理
    //           }
    //         );
    //     }),
    //   );
    // }
  }
}