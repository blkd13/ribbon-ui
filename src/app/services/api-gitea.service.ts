import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';
// Gitea 側のレスポンス型の例 (実際の API に合わせて定義を調整してください)
interface GiteaOrganization {
  id: number;
  username: string;
  full_name: string;
  avatar_url: string;
  // ...必要に応じて拡張
}

@Injectable({ providedIn: 'root' })
export class ApiGiteaService {
  private readonly http: HttpClient = inject(HttpClient);
  private readonly proxyBase = '/user/oauth/api/proxy';

  /**
   * orgName が指定されていなければ、ユーザーが所属する Organization の一覧を返し、
   * orgName が指定されていれば、その Organization 内の Team と Repository を取得して
   * 一つの配列に合体して返す。
   */
  groupChildren(giteaProvider: string, key?: string): Observable<(GiteaUser | GiteaRepository | GiteaOrganization)[]> {
    const limit = 1000;
    if (key) {
      return this.http.get<GiteaRepository[]>(`${this.proxyBase}/${giteaProvider}/api/v1/${key}/repos?limit=${limit}`);
    } else {
      return this.http.get<GiteaOrganization[]>(`${this.proxyBase}/${giteaProvider}/api/v1/user/orgs?limit=${limit}`).pipe(
        map(orgs => {
          orgs.forEach(org => {
            (org as any).name = org.username;
            (org as any).key = `orgs/${org.username}`;
          });
          return orgs;
        })
      );
    }
  }

  /**
   * orgName が指定されていなければ、ユーザーが所属する Organization の一覧を返し、
   * orgName が指定されていれば、その Organization 内の Team と Repository を取得して
   * 一つの配列に合体して返す。
   */
  userChildren(giteaProvider: string, key?: string): Observable<(GiteaUser | GiteaRepository | GiteaOrganization)[]> {
    const limit = 1000;
    if (key) {
      return this.http.get<GiteaRepository[]>(`${this.proxyBase}/${giteaProvider}/api/v1/${key}/repos?limit=${limit}`);
    } else {
      return this.http.get<{ ok: boolean, data: GiteaUser[] }>(`${this.proxyBase}/${giteaProvider}/api/v1/users/search?q&tab`).pipe(
        map(res => {
          if (res.ok) {
            res.data.forEach(user => {
              (user as any).name = user.username;
              (user as any).key = `users/${user.username}`;
            });
          } else { }
          return res.data;
        })
      );
    }
  }

  projects(provider: string, owner?: string, params: { page?: number; limit?: number, q?: string } = {}): Observable<GiteaRepositoryResponse> {
    if (params.q) {
      const url = `/user/oauth/api/proxy/${provider}/api/v1/repos/search`;
      return this.http.get<{ data: GiteaRepositoryResponse, ok: boolean }>(url, { params }).pipe(map(res => res.data));
    } else {
      delete params.q;
      const ownerPath = owner ? `/orgs/${owner}` : '/user';
      const url = `/user/oauth/api/proxy/${provider}/api/v1${ownerPath}/repos`;
      return this.http.get<GiteaRepositoryResponse>(url, { params });
    }
  }

  branches(provider: string, owner: string, repo: string): Observable<GiteaBranch[]> {
    const url = `/user/oauth/api/proxy/${provider}/api/v1/repos/${owner}/${repo}/branches`;
    return this.http.get<GiteaBranch[]>(url);
  }

  tags(provider: string, owner: string, repo: string): Observable<GiteaTag[]> {
    const url = `/user/oauth/api/proxy/${provider}/api/v1/repos/${owner}/${repo}/tags`;
    return this.http.get<GiteaTag[]>(url);
  }

  commits(provider: string, owner: string, repo: string): Observable<GiteaCommit[]> {
    const url = `/user/oauth/api/proxy/${provider}/api/v1/repos/${owner}/${repo}/commits`;
    return this.http.get<GiteaCommit[]>(url);
  }

  fetchCommit(provider: string, owner: string, repo: string, projectInDto: { projectId: string; }, type?: 'branches' | 'tags' | 'commits', id?: string): Observable<RootObject> {
    let params = '';
    if ((type === undefined) !== (id === undefined)) {
      throw new Error('Both type and id must be specified');
    } else if (type === undefined && id === undefined) {
    } else {
      params = `/${type}/${id}`;
    }
    const url = `/user/oauth/api/gitea/${provider}/files/${owner}/${repo}${params}`;
    return this.http.post<RootObject>(url, projectInDto);
  }
}

// Gitea
export interface GiteaRepository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  fork: boolean;
  html_url: string;
  ssh_url: string;
  clone_url: string;
  website: string;
  stars_count: number;
  forks_count: number;
  watchers_count: number;
  open_issues_count: number;
  default_branch: string;
  created_at: string;
  updated_at: string;
  permissions: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  owner: {
    id: number;
    login: string;
    full_name: string;
    email: string;
    avatar_url: string;
    username: string;
  };
}

export type GiteaRepositoryResponse = GiteaRepository[];

export interface GiteaBranch {
  name: string;
  commit: {
    id: string;
    message: string;
    url: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    verification: {
      verified: boolean;
      reason: string;
      signature: string;
      payload: string;
    };
  };
  protected: boolean;
  protection_url: string;
}

export interface GiteaTag {
  name: string;
  message: string;
  commit: {
    sha: string;
    url: string;
  };
  zipball_url: string;
  tarball_url: string;
}

export interface GiteaCommit {
  sha: string;
  commit: {
    author: {
      name: string;
      email: string;
      date: string;
    };
    committer: {
      name: string;
      email: string;
      date: string;
    };
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    url: string;
    verification: {
      verified: boolean;
      reason: string;
      signature: string;
      payload: string;
    };
  };
  url: string;
  html_url: string;
  author: {
    id: number;
    login: string;
    full_name: string;
    email: string;
    avatar_url: string;
    language: string;
    username: string;
  };
  committer: {
    id: number;
    login: string;
    full_name: string;
    email: string;
    avatar_url: string;
    language: string;
    username: string;
  };
  parents: {
    sha: string;
    url: string;
    html_url: string;
  }[];
}

export interface GitProjectCommit {
  id: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  createdIp: string;
  updatedIp: string;
  provider: string;
  gitProjectId: number;
  commitId: string;
  fileGroupId: string;
}

export interface FileGroup {
  createdBy: string;
  updatedBy: string;
  createdIp: string;
  updatedIp: string;
  projectId: string;
  type: string;
  label: string;
  description: string;
  uploadedBy: string;
  isActive: boolean;
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface RootObject {
  gitProjectCommit: GitProjectCommit;
  fileGroup: FileGroup;
}

export interface GiteaUser {
  id: number;
  login: string;
  login_name: string;
  source_id: number;
  full_name: string;
  email: string;
  avatar_url: string;
  html_url: string;
  language: string;
  is_admin: boolean;
  last_login: string;
  created: string;
  restricted: boolean;
  active: boolean;
  prohibit_login: boolean;
  location: string;
  website: string;
  description: string;
  visibility: string;
  followers_count: number;
  following_count: number;
  starred_repos_count: number;
  username: string;
}
