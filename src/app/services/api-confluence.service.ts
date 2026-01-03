import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// Confluence REST API v1 レスポンス型定義
export interface ConfluenceSpace {
  id: number;
  key: string;
  name: string;
  type: string;
  status: string;
  description?: {
    plain?: { value: string; representation: string };
    view?: { value: string; representation: string };
  };
  icon?: {
    path: string;
    width: number;
    height: number;
    isDefault: boolean;
  };
  homepage?: ConfluencePage;
  _links?: {
    webui?: string;
    self?: string;
  };
  _expandable?: {
    homepage?: string;
    description?: string;
  };
}

export interface ConfluenceSpaceListResponse {
  results: ConfluenceSpace[];
  start: number;
  limit: number;
  size: number;
  _links?: {
    next?: string;
    base?: string;
  };
}

export interface ConfluencePage {
  id: string;
  type: string;
  status: string;
  title: string;
  space?: ConfluenceSpace;
  ancestors?: ConfluencePage[];
  children?: {
    page?: {
      results: ConfluencePage[];
      start: number;
      limit: number;
      size: number;
    };
  };
  version?: {
    number: number;
    by?: {
      displayName: string;
      username?: string;
    };
    when?: string;
    message?: string;
  };
  body?: {
    storage?: { value: string; representation: string };
    view?: { value: string; representation: string };
  };
  _links?: {
    webui?: string;
    edit?: string;
    tinyui?: string;
    self?: string;
  };
  _expandable?: {
    children?: string;
    ancestors?: string;
    body?: string;
    space?: string;
  };
}

export interface ConfluencePageListResponse {
  results: ConfluencePage[];
  start: number;
  limit: number;
  size: number;
  _links?: {
    next?: string;
    base?: string;
  };
}

export interface ConfluenceChildPagesResponse {
  page?: {
    results: ConfluencePage[];
    start: number;
    limit: number;
    size: number;
    _links?: {
      next?: string;
    };
  };
}

export interface ConfluenceSearchResult {
  results: Array<{
    content?: ConfluencePage;
    title?: string;
    excerpt?: string;
    url?: string;
    resultGlobalContainer?: {
      title: string;
      displayUrl: string;
    };
    breadcrumbs?: Array<{ label: string; url: string }>;
    entityType?: string;
    iconCssClass?: string;
    lastModified?: string;
    friendlyLastModified?: string;
    score?: number;
  }>;
  start: number;
  limit: number;
  size: number;
  totalSize?: number;
  _links?: {
    next?: string;
    base?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ApiConfluenceService {
  private providerName = 'sample';
  private proxyBasePath = `/user/oauth/api/proxy/confluence/${this.providerName}`;
  private basePath = `/user/oauth/api/custom-api/confluence/${this.providerName}`;

  private readonly http = inject(HttpClient);

  /**
   * OAuth2プロバイダ名を設定
   */
  setProviderName(providerName: string): void {
    this.providerName = providerName;
    this.proxyBasePath = `/user/oauth/api/proxy/confluence/${providerName}`;
    this.basePath = `/user/oauth/api/custom-api/confluence/${providerName}`;
  }

  /**
   * 現在のユーザー情報を取得
   */
  getCurrentUser(): Observable<any> {
    const url = `${this.proxyBasePath}/rest/api/user/current`;
    return this.http.get<any>(url);
  }

  /**
   * スペース一覧を取得
   */
  getSpaces(limit = 25, start = 0): Observable<ConfluenceSpaceListResponse> {
    const url = `${this.proxyBasePath}/rest/api/space?limit=${limit}&start=${start}&status=current`;
    return this.http.get<ConfluenceSpaceListResponse>(url);
  }

  /**
   * スペース詳細を取得
   */
  getSpace(spaceKey: string): Observable<ConfluenceSpace> {
    const url = `${this.proxyBasePath}/rest/api/space/${encodeURIComponent(spaceKey)}?expand=description.view,homepage`;
    return this.http.get<ConfluenceSpace>(url);
  }

  /**
   * スペースのルートページ一覧を取得（トップレベルページ）
   * CQLでスペース内の親を持たないページを検索
   */
  getSpaceRootPages(spaceKey: string, limit = 50, start = 0): Observable<ConfluencePageListResponse> {
    const cql = `space.key="${spaceKey}" AND type=page AND ancestor=null`;
    const url = `${this.proxyBasePath}/rest/api/content?spaceKey=${encodeURIComponent(spaceKey)}&type=page&depth=root&limit=${limit}&start=${start}&expand=version,space`;
    return this.http.get<ConfluencePageListResponse>(url);
  }

  /**
   * スペースの全ページを取得
   */
  getSpacePages(spaceKey: string, limit = 50, start = 0): Observable<ConfluencePageListResponse> {
    const url = `${this.proxyBasePath}/rest/api/content?spaceKey=${encodeURIComponent(spaceKey)}&type=page&limit=${limit}&start=${start}&expand=version,ancestors`;
    return this.http.get<ConfluencePageListResponse>(url);
  }

  /**
   * ページの子ページを取得
   */
  getChildPages(pageId: string, limit = 50, start = 0): Observable<ConfluencePage[]> {
    const url = `${this.proxyBasePath}/rest/api/content/${pageId}/child/page?limit=${limit}&start=${start}&expand=version`;
    return this.http.get<ConfluencePageListResponse>(url).pipe(
      map(res => res.results || []),
      catchError(() => of([]))
    );
  }

  /**
   * ページ詳細を取得
   */
  getPage(pageId: string): Observable<ConfluencePage> {
    const url = `${this.proxyBasePath}/rest/api/content/${pageId}?expand=version,space,ancestors,body.storage`;
    return this.http.get<ConfluencePage>(url);
  }

  /**
   * コンテンツを検索（CQL使用）
   */
  searchContent(query: string, spaceKey?: string, limit = 25): Observable<ConfluenceSearchResult> {
    let cql = `type=page AND text ~ "${query}"`;
    if (spaceKey) {
      cql = `space.key="${spaceKey}" AND ${cql}`;
    }
    const url = `${this.proxyBasePath}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${limit}`;
    return this.http.get<ConfluenceSearchResult>(url);
  }

  /**
   * 最近更新されたページを取得
   */
  getRecentPages(limit = 20): Observable<ConfluenceSearchResult> {
    const cql = `type=page ORDER BY lastmodified DESC`;
    const url = `${this.proxyBasePath}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${limit}`;
    return this.http.get<ConfluenceSearchResult>(url);
  }

  /**
   * ラベルでページを検索
   */
  getPagesByLabel(label: string, spaceKey?: string, limit = 50): Observable<ConfluenceSearchResult> {
    let cql = `type=page AND label="${label}"`;
    if (spaceKey) {
      cql = `space.key="${spaceKey}" AND ${cql}`;
    }
    const url = `${this.proxyBasePath}/rest/api/search?cql=${encodeURIComponent(cql)}&limit=${limit}`;
    return this.http.get<ConfluenceSearchResult>(url);
  }

  /**
   * ページの祖先（パンくず）を取得
   */
  getPageAncestors(pageId: string): Observable<ConfluencePage[]> {
    const url = `${this.proxyBasePath}/rest/api/content/${pageId}?expand=ancestors`;
    return this.http.get<ConfluencePage>(url).pipe(
      map(page => page.ancestors || []),
      catchError(() => of([]))
    );
  }
}
