import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';


@Injectable({ providedIn: 'root' })
export class ApiGitlabService {

  private readonly http: HttpClient = inject(HttpClient);

  project(gitlabProvider: string): Observable<GitLabProjectListResponse> {
    const url = `/user/oauth/api/proxy/${gitlabProvider}/api/v4/projects`;
    return this.http.get<GitLabProjectListResponse>(url);
  }
}


export interface GitLabProject {
  id: number;
  description: string | null;
  name: string;
  name_with_namespace: string;
  path: string;
  created_at: string;
  last_activity_at: string;
  // 必要に応じて他のフィールドを追加
}

type GitLabProjectListResponse = GitLabProject[];