import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { EMPTY, expand, last, map, Observable, reduce, scan } from 'rxjs';
import { safeForkJoin } from '../utils/dom-utils';


@Injectable({ providedIn: 'root' })
export class ApiGitlabService {

  private readonly http: HttpClient = inject(HttpClient);
  private readonly proxyBase = `/user/oauth/api/proxy`;

  groups(gitlabProvider: string, id?: number, childType?: 'projects' | 'subgroups'): Observable<GitLabGroupListResponse> {
    let tail = '';
    const per_page = 100;
    if (id) {
      tail = `/${id}/subgroups?per_page=${per_page}`;
    } else {
      tail = `?top_level_only=true&per_page=${per_page}`;
    }
    return this.http.get<GitLabGroupListResponse>(`${this.proxyBase}/${gitlabProvider}/api/v4/groups${tail}`);
  }

  usersChildren(gitlabProvider: string, id?: number, query?: string): Observable<(GitLabUser | GitLabProject)[]> {
    // /users/:user_id/projects
    if (id) {
      return this.http.get<GitLabProject[]>(`${this.proxyBase}/${gitlabProvider}/api/v4/users/${id}/projects`);
    } else {
      query = query ? `?search=${query}` : '';
      return this.http.get<GitLabUser[]>(`${this.proxyBase}/${gitlabProvider}/api/v4/users${query}`);
    }
  }

  groupChildren(gitlabProvider: string, groupId?: number): Observable<(GitLabGroup | GitLabProject)[]> {
    const per_page = 100;
    let tail = '';
    if (groupId) {
      return safeForkJoin<(GitLabGroup | GitLabProject)[]>([
        this.fetchAllPages<GitLabGroup>(`${this.proxyBase}/${gitlabProvider}/api/v4/groups/${groupId}/subgroups?per_page=${per_page}`),
        this.fetchAllPages<GitLabProject>(`${this.proxyBase}/${gitlabProvider}/api/v4/groups/${groupId}/projects?per_page=${per_page}`),
      ]).pipe(map(responseSet => [
        ...responseSet[0],
        ...responseSet[1],
      ]));
    } else {
      tail = `?top_level_only=true&per_page=${per_page}`;
      return this.fetchAllPages<GitLabGroup>(`${this.proxyBase}/${gitlabProvider}/api/v4/groups${tail}`);
    }
  }
  /**
   * 汎用的に「ページ付きAPIを全部まとめて取る」関数
   * @param url 最初にリクエストを投げる URL (例: ...?per_page=100&page=1)
   */
  fetchAllPages<T>(url: string): Observable<T[]> {
    // 最初のリクエストを 'response' オプション付きで送る（ヘッダーを読むため）
    return this.http.get<T[]>(url, { observe: 'response' }).pipe(
      expand((response: HttpResponse<T[]>) => {
        const nextPage = response.headers.get('X-Next-Page');
        if (nextPage) {
          return this.http.get<T[]>(`${url}&page=${nextPage}`, { observe: 'response' });
        } else {
          return EMPTY;
        }
      }),
      map(response => response.body ?? []),
      scan((acc, items) => [...acc, ...items], [] as T[]),
      last(),
    );
  }

  /**
   * 例: 具体的な GitLab のブランチ取得エンドポイント
   */
  branchesAll(gitlabProvider: string, projectId: number): Observable<GitlabBranch[]> {
    const initialUrl = `${this.proxyBase}/${gitlabProvider}/api/v4/projects/${projectId}/repository/branches?per_page=100&page=1`;
    // 上の汎用関数を使う
    return this.fetchAllPages<GitlabBranch>(initialUrl);
  }

  projects(gitlabProvider: string, groupId?: number, params: { page?: number; per_page?: number, search?: string } = {}): Observable<GitLabProjectListResponse> {
    const group = groupId === undefined ? '' : `/groups/${groupId}`;
    const url = `${this.proxyBase}/${gitlabProvider}/api/v4${group}/projects`;
    if (params.search === undefined) {
      delete params.search;
    }
    return this.http.get<GitLabProjectListResponse>(url, { params });
  }

  branches(gitlabProvider: string, projectId: number): Observable<GitlabBranch[]> {
    const url = `${this.proxyBase}/${gitlabProvider}/api/v4/projects/${projectId}/repository/branches`;
    return this.http.get<GitlabBranch[]>(url);
  }
  tags(gitlabProvider: string, projectId: number): Observable<GitlabTag[]> {
    const url = `${this.proxyBase}/${gitlabProvider}/api/v4/projects/${projectId}/repository/tags`;
    return this.http.get<GitlabTag[]>(url);
  }
  commits(gitlabProvider: string, projectId: number): Observable<GitlabCommit[]> {
    const url = `${this.proxyBase}/${gitlabProvider}/api/v4/projects/${projectId}/repository/commits`;
    return this.http.get<GitlabCommit[]>(url);
  }
  fetchCommit(gitlabProvider: string, gitlabProjectId: number, projectInDto: { projectId: string, }, type?: 'branches' | 'tags' | 'commits', id?: string): Observable<RootObject> {
    let params = '';
    if ((type === undefined) !== (id === undefined)) {
      throw new Error('Both type and id must be specified');
    } else if (type === undefined && id === undefined) {
    } else {
      params = `/${type}/${id}`;
    }
    const url = `/user/oauth/api/gitlab/${gitlabProvider}/files/${gitlabProjectId}${params}`;
    return this.http.post<RootObject>(url, projectInDto);
  }
  // projectClone(gitlabProvider: string, projectId: number): Observable<GitLabProjectListResponse> {
  //   const url = `/user/oauth/api/gitlab/${gitlabProvider}/clone/${projectId}`;
  //   return this.http.get<GitLabProjectListResponse>(url);
  // }
  // projectDownload(gitlabProvider: string, projectId: number): Observable<GitLabProjectListResponse> {
  //   const url = `/user/oauth/api/gitlab/${gitlabProvider}/download/${projectId}`;
  //   return this.http.get<GitLabProjectListResponse>(url);
  // }
  projectFileDownload(gitlabProvider: string, gitlabProjectId: number, projectInDto: { projectId: string, systemPrompt: string }, type?: 'branches' | 'tags' | 'commits', id?: string): Observable<RootObject> {
    let params = '';
    if ((type === undefined) !== (id === undefined)) {
      throw new Error('Both type and id must be specified');
    } else if (type === undefined && id === undefined) {
    } else {
      params = `/${type}/${id}`;
    }
    const url = `/user/oauth/api/gitlab/${gitlabProvider}/files/${gitlabProjectId}${params}`;
    return this.http.post<RootObject>(url, projectInDto);
  }
}


// Base interface for a GitLab Group
export interface GitLabGroup {
  id: number; // Group ID
  name: string; // Group name
  path: string; // Group URL path
  description?: string; // Optional group description
  visibility: 'private' | 'internal' | 'public'; // Group visibility level
  web_url: string; // Web URL for the group
  avatar_url?: string; // Optional URL for the group's avatar
  full_name: string; // Full name of the group
  full_path: string; // Full URL path of the group
  parent_id?: number; // Parent group ID, if any
  projects?: GitLabProject[]; // Optional list of projects within the group
}

// Parameters for fetching groups (GET /groups)
export interface GitLabGroupQueryParams {
  skip_groups?: number[]; // List of group IDs to exclude from results
  all_available?: boolean; // Include all groups current user has access to
  search?: string; // Filter groups by name or path
  order_by?: 'name' | 'path'; // Order results by name or path
  sort?: 'asc' | 'desc'; // Sort order, ascending or descending
  statistics?: boolean; // Include group statistics in results
  owned?: boolean; // Limit to groups owned by the authenticated user
  min_access_level?: number; // Minimum access level filter
}

// Response for a list of groups (GET /groups)
export type GitLabGroupListResponse = GitLabGroup[];

// Example: Interface for creating or updating a group (POST/PUT /groups)
export interface GitLabGroupPayload {
  name: string; // Group name
  path: string; // Group URL path
  description?: string; // Optional group description
  visibility?: 'private' | 'internal' | 'public'; // Group visibility level
  lfs_enabled?: boolean; // Enable/disable LFS for the group
  request_access_enabled?: boolean; // Allow users to request access
  parent_id?: number; // Parent group ID, if any
}

// Interface for the full GitLab Group API
export interface GitLabGroupsAPI {
  getGroups(params?: GitLabGroupQueryParams): Promise<GitLabGroupListResponse>; // Fetch groups
  getGroup(groupId: number): Promise<GitLabGroup>; // Fetch a single group by ID
  createGroup(payload: GitLabGroupPayload): Promise<GitLabGroup>; // Create a new group
  updateGroup(groupId: number, payload: GitLabGroupPayload): Promise<GitLabGroup>; // Update a group
  deleteGroup(groupId: number): Promise<void>; // Delete a group
}
export interface GitlabBranch {
  name: string;
  commit: {
    id: string;
    short_id: string;
    created_at: string;
    title: string;
    message: string;
    author_name: string;
    author_email: string;
  };
  merged: boolean;
  protected: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
}

export interface GitlabTag {
  name: string;
  message: string;
  target: string;
  commit: {
    id: string;
    short_id: string;
    title: string;
    created_at: string;
    parent_ids: string[];
  };
  release?: {
    tag_name: string;
    description: string;
  };
}

export interface GitlabCommit {
  id: string;
  short_id: string;
  created_at: string;
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  committer_name: string;
  committer_email: string;
  parent_ids: string[];
}

// 全体を取得するデータ型
export interface GitLabData {
  branches: GitlabBranch[];
  tags: GitlabTag[];
  commits: GitlabCommit[];
}

export interface GitLabProject {
  id: number;
  description: string | null;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  created_at: string;
  default_branch: string;
  tag_list: string[];
  topics: string[];
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  web_url: string;
  readme_url: string;
  forks_count: number;
  avatar_url: string | null;
  star_count: number;
  last_activity_at: string;
  namespace: Namespace;
  repository_storage: string;
  _links: Links;
  packages_enabled: boolean;
  empty_repo: boolean;
  archived: boolean;
  visibility: string;
  resolve_outdated_diff_discussions: boolean;
  container_expiration_policy: ContainerExpirationPolicy;
  repository_object_format: string;
  issues_enabled: boolean;
  merge_requests_enabled: boolean;
  wiki_enabled: boolean;
  jobs_enabled: boolean;
  snippets_enabled: boolean;
  container_registry_enabled: boolean;
  service_desk_enabled: boolean;
  service_desk_address: string | null;
  can_create_merge_request_in: boolean;
  issues_access_level: string;
  repository_access_level: string;
  merge_requests_access_level: string;
  forking_access_level: string;
  wiki_access_level: string;
  builds_access_level: string;
  snippets_access_level: string;
  pages_access_level: string;
  analytics_access_level: string;
  container_registry_access_level: string;
  security_and_compliance_access_level: string;
  releases_access_level: string;
  environments_access_level: string;
  feature_flags_access_level: string;
  infrastructure_access_level: string;
  monitor_access_level: string;
  model_experiments_access_level: string;
  model_registry_access_level: string;
  emails_disabled: boolean;
  emails_enabled: boolean;
  shared_runners_enabled: boolean;
  lfs_enabled: boolean;
  creator_id: number;
  import_url: string | null;
  import_type: string | null;
  import_status: string;
  open_issues_count: number;
  description_html: string;
  updated_at: string;
  ci_default_git_depth: number;
  ci_delete_pipelines_in_seconds: number | null;
  ci_forward_deployment_enabled: boolean;
  ci_forward_deployment_rollback_allowed: boolean;
  ci_job_token_scope_enabled: boolean;
  ci_separated_caches: boolean;
  ci_allow_fork_pipelines_to_run_in_parent_project: boolean;
  ci_id_token_sub_claim_components: string[];
  build_git_strategy: string;
  keep_latest_artifact: boolean;
  restrict_user_defined_variables: boolean;
  ci_pipeline_variables_minimum_override_role: string;
  runners_token: string;
  runner_token_expiration_interval: number | null;
  group_runners_enabled: boolean;
  auto_cancel_pending_pipelines: string;
  build_timeout: number;
  auto_devops_enabled: boolean;
  auto_devops_deploy_strategy: string;
  ci_push_repository_for_job_token_allowed: boolean;
  ci_config_path: string | null;
  public_jobs: boolean;
  shared_with_groups: any[];
  only_allow_merge_if_pipeline_succeeds: boolean;
  allow_merge_on_skipped_pipeline: any | null;
  request_access_enabled: boolean;
  only_allow_merge_if_all_discussions_are_resolved: boolean;
  remove_source_branch_after_merge: boolean;
  printing_merge_request_link_enabled: boolean;
  merge_method: string;
  squash_option: string;
  enforce_auth_checks_on_uploads: boolean;
  suggestion_commit_message: string | null;
  merge_commit_template: string | null;
  squash_commit_template: string | null;
  issue_branch_template: string | null;
  warn_about_potentially_unwanted_characters: boolean;
  autoclose_referenced_issues: boolean;
  permissions: Permissions;
  owner?: Owner;
}

interface Namespace {
  id: number;
  name: string;
  path: string;
  kind: string;
  full_path: string;
  parent_id: number | null;
  avatar_url: string | null;
  web_url: string;
}

interface Links {
  self: string;
  issues: string;
  merge_requests: string;
  repo_branches: string;
  labels: string;
  events: string;
  members: string;
  cluster_agents: string;
}

interface ContainerExpirationPolicy {
  cadence: string;
  enabled: boolean;
  keep_n: number;
  older_than: string;
  name_regex: string;
  name_regex_keep: string | null;
  next_run_at: string;
}

interface Permissions {
  project_access: ProjectAccess | null;
  group_access: GroupAccess | null;
}

interface ProjectAccess {
  access_level: number;
  notification_level: number;
}

interface GroupAccess {
  access_level: number;
  notification_level: number;
}

interface Owner {
  id: number;
  username: string;
  name: string;
  state: string;
  locked: boolean;
  avatar_url: string;
  web_url: string;
}

export type GitLabProjectListResponse = GitLabProject[];

interface GitProjectCommit {
  id: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  createdIp: string;
  updatedIp: string;
  provider: string;
  gitProjectId: number;
  commitId: string;
  fileGroupId: string;
}

interface FileGroup {
  createdBy: string;
  updatedBy: string;
  createdIp: string;
  updatedIp: string;
  projectId: string;
  type: string;
  label: string;
  description: string; // JSON
  uploadedBy: string;
  isActive: boolean;
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

interface RootObject {
  gitProjectCommit: GitProjectCommit;
  fileGroup: FileGroup;
}

export interface GitLabUser {
  id: number,
  username: string,
  name: string,
  state: string,
  locked: false,
  avatar_url?: string,
  web_url: string,
}