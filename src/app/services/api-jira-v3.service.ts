import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

/**
 * JIRA REST API v3 用サービス（Jira Cloud向け）
 *
 * ※ 現在は api-jira.service.ts (v2) を使用中
 * ※ Jira Cloud環境で v3 API が必要な場合にこのファイルを使用してください
 */

// JIRA REST API v3 レスポンス型定義
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  avatarUrls?: {
    '16x16'?: string;
    '24x24'?: string;
    '32x32'?: string;
    '48x48'?: string;
  };
  lead?: {
    accountId?: string;
    displayName?: string;
    emailAddress?: string;
    avatarUrls?: Record<string, string>;
  };
  description?: string;
  url?: string;
  style?: string;
  isPrivate?: boolean;
  simplified?: boolean;
}

export interface JiraProjectListResponse {
  values: JiraProject[];
  self: string;
  maxResults: number;
  startAt: number;
  total: number;
  isLast: boolean;
}

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: any;
    issuetype?: {
      id: string;
      name: string;
      iconUrl?: string;
    };
    status?: {
      id: string;
      name: string;
      statusCategory?: {
        id: number;
        key: string;
        colorName: string;
        name: string;
      };
    };
    priority?: {
      id: string;
      name: string;
      iconUrl?: string;
    };
    assignee?: {
      accountId?: string;
      displayName?: string;
      emailAddress?: string;
      avatarUrls?: Record<string, string>;
    };
    reporter?: {
      accountId?: string;
      displayName?: string;
      emailAddress?: string;
      avatarUrls?: Record<string, string>;
    };
    project?: JiraProject;
    created?: string;
    updated?: string;
    labels?: string[];
    components?: Array<{ id: string; name: string }>;
    fixVersions?: Array<{ id: string; name: string }>;
    sprint?: {
      id: number;
      name: string;
      state: string;
    };
  };
}

export interface JiraSearchResponse {
  issues: JiraIssue[];
  startAt: number;
  maxResults: number;
  total: number;
  expand?: string;
}

export interface JiraStatus {
  id: string;
  name: string;
  description?: string;
  statusCategory?: {
    id: number;
    key: string;
    colorName: string;
    name: string;
  };
}

export interface JiraPriority {
  id: string;
  name: string;
  iconUrl?: string;
  description?: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  subtask: boolean;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  originBoardId?: number;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
  location?: {
    projectId: number;
    projectKey: string;
    projectName: string;
  };
}

@Injectable({ providedIn: 'root' })
export class ApiJiraV3Service {
  private providerName = 'sample';
  private proxyBasePath = `/user/oauth/api/proxy/jira/${this.providerName}`;
  private basePath = `/user/oauth/api/custom-api/jira/${this.providerName}`;

  private readonly http = inject(HttpClient);

  /**
   * OAuth2プロバイダ名を設定
   */
  setProviderName(providerName: string): void {
    this.providerName = providerName;
    this.proxyBasePath = `/user/oauth/api/proxy/jira/${providerName}`;
    this.basePath = `/user/oauth/api/custom-api/jira/${providerName}`;
  }

  /**
   * 現在のユーザー情報を取得
   */
  getCurrentUser(): Observable<any> {
    const url = `${this.proxyBasePath}/rest/api/3/myself`;
    return this.http.get<any>(url);
  }

  /**
   * プロジェクト一覧を取得
   */
  getProjects(maxResults = 50, startAt = 0): Observable<JiraProjectListResponse> {
    const url = `${this.proxyBasePath}/rest/api/3/project/search?maxResults=${maxResults}&startAt=${startAt}&expand=lead`;
    return this.http.get<JiraProjectListResponse>(url).pipe(
      catchError(() => of({
        values: [],
        self: '',
        maxResults,
        startAt,
        total: 0,
        isLast: true,
      }))
    );
  }

  /**
   * プロジェクト詳細を取得
   */
  getProject(projectKeyOrId: string): Observable<JiraProject> {
    const url = `${this.proxyBasePath}/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}`;
    return this.http.get<JiraProject>(url);
  }

  /**
   * JQLでイシューを検索
   */
  searchIssues(jql: string, maxResults = 50, startAt = 0, fields?: string[]): Observable<JiraSearchResponse> {
    const params: any = {
      jql,
      maxResults,
      startAt,
    };
    if (fields && fields.length > 0) {
      params.fields = fields.join(',');
    }
    const url = `${this.proxyBasePath}/rest/api/3/search`;
    return this.http.post<JiraSearchResponse>(url, params).pipe(
      catchError(() => of({
        issues: [],
        startAt,
        maxResults,
        total: 0,
      }))
    );
  }

  /**
   * イシュー詳細を取得
   */
  getIssue(issueKeyOrId: string, fields?: string[]): Observable<JiraIssue> {
    let url = `${this.proxyBasePath}/rest/api/3/issue/${encodeURIComponent(issueKeyOrId)}`;
    if (fields && fields.length > 0) {
      url += `?fields=${fields.join(',')}`;
    }
    return this.http.get<JiraIssue>(url);
  }

  /**
   * プロジェクトのイシュータイプを取得
   */
  getProjectIssueTypes(projectKeyOrId: string): Observable<JiraIssueType[]> {
    const url = `${this.proxyBasePath}/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}/statuses`;
    return this.http.get<any>(url).pipe(
      map(response => {
        // プロジェクトステータスAPIから課題タイプを抽出
        if (Array.isArray(response)) {
          return response.map((item: any) => ({
            id: item.id,
            name: item.name,
            subtask: item.subtask || false,
          }));
        }
        return [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * プロジェクトのステータス一覧を取得
   */
  getProjectStatuses(projectKeyOrId: string): Observable<JiraStatus[]> {
    const url = `${this.proxyBasePath}/rest/api/3/project/${encodeURIComponent(projectKeyOrId)}/statuses`;
    return this.http.get<any[]>(url).pipe(
      map(issueTypes => {
        // 各課題タイプのステータスを統合してユニークにする
        const statusMap = new Map<string, JiraStatus>();
        issueTypes.forEach(issueType => {
          if (issueType.statuses) {
            issueType.statuses.forEach((status: JiraStatus) => {
              statusMap.set(status.id, status);
            });
          }
        });
        return Array.from(statusMap.values());
      }),
      catchError(() => of([]))
    );
  }

  /**
   * すべてのステータスを取得
   */
  getAllStatuses(): Observable<JiraStatus[]> {
    const url = `${this.proxyBasePath}/rest/api/3/status`;
    return this.http.get<JiraStatus[]>(url).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * 優先度一覧を取得
   */
  getPriorities(): Observable<JiraPriority[]> {
    const url = `${this.proxyBasePath}/rest/api/3/priority`;
    return this.http.get<JiraPriority[]>(url).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * ボード一覧を取得（Agile API）
   */
  getBoards(projectKeyOrId?: string, maxResults = 50, startAt = 0): Observable<{ values: JiraBoard[]; total: number }> {
    let url = `${this.proxyBasePath}/rest/agile/1.0/board?maxResults=${maxResults}&startAt=${startAt}`;
    if (projectKeyOrId) {
      url += `&projectKeyOrId=${encodeURIComponent(projectKeyOrId)}`;
    }
    return this.http.get<{ values: JiraBoard[]; total: number }>(url).pipe(
      catchError(() => of({ values: [], total: 0 }))
    );
  }

  /**
   * ボードのスプリント一覧を取得（Agile API）
   */
  getBoardSprints(boardId: number, state?: 'active' | 'future' | 'closed', maxResults = 50): Observable<{ values: JiraSprint[]; total: number }> {
    let url = `${this.proxyBasePath}/rest/agile/1.0/board/${boardId}/sprint?maxResults=${maxResults}`;
    if (state) {
      url += `&state=${state}`;
    }
    return this.http.get<{ values: JiraSprint[]; total: number }>(url).pipe(
      catchError(() => of({ values: [], total: 0 }))
    );
  }

  /**
   * フィルター一覧を取得
   */
  getMyFilters(): Observable<any[]> {
    const url = `${this.proxyBasePath}/rest/api/3/filter/my`;
    return this.http.get<any[]>(url).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * JQLを検証
   */
  validateJql(jql: string): Observable<{ valid: boolean; errors?: string[] }> {
    const url = `${this.proxyBasePath}/rest/api/3/jql/parse`;
    return this.http.post<any>(url, { queries: [jql] }).pipe(
      map(response => {
        const query = response.queries?.[0];
        if (query?.errors && query.errors.length > 0) {
          return { valid: false, errors: query.errors };
        }
        return { valid: true };
      }),
      catchError(err => of({ valid: false, errors: [err.message || 'JQL validation failed'] }))
    );
  }

  /**
   * オートコンプリート用のフィールド一覧を取得
   */
  getFields(): Observable<any[]> {
    const url = `${this.proxyBasePath}/rest/api/3/field`;
    return this.http.get<any[]>(url).pipe(
      catchError(() => of([]))
    );
  }

  /**
   * プロジェクトを検索（キーまたは名前で）
   */
  searchProjects(query: string, maxResults = 20): Observable<JiraProject[]> {
    const url = `${this.proxyBasePath}/rest/api/3/project/search?query=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    return this.http.get<JiraProjectListResponse>(url).pipe(
      map(res => res.values || []),
      catchError(() => of([]))
    );
  }
}
