// Context Hub Models
// リソースプロバイダー共通の型定義

import { BaseEntity, UUID } from './project-models';

// ============================================
// 共通型定義
// ============================================

/** リソースプロバイダーの種類 */
export type ContextResourceProviderType =
  | 'local'        // ローカルファイル/フォルダ
  | 'box'          // Box
  | 'confluence'   // Confluence
  | 'jira'         // Jira
  | 'gitlab'       // GitLab
  | 'gitea'        // Gitea
  | 'mattermost'   // Mattermost
  | 'web';         // Webサイト

/** リソースの同期状態 */
export type ContextResourceSyncStatus =
  | 'pending'      // 同期待ち
  | 'syncing'      // 同期中
  | 'synced'       // 同期完了
  | 'error'        // エラー
  | 'disabled';    // 無効

/** 階層深度の設定 */
export interface DepthConfig {
  type: 'none' | 'limited' | 'unlimited';
  depth?: number; // typeが'limited'の場合の深度
}

// ============================================
// Context Hub エンティティ
// ============================================

/** Context Hub本体 */
export interface ContextHub extends BaseEntity {
  projectId: UUID;
  name: string;
  description?: string;
  isActive: boolean;
}

/** Context Hubに登録されたリソースプロバイダー */
export interface ContextResourceProvider extends BaseEntity {
  contextHubId: UUID;
  providerType: ContextResourceProviderType;
  providerName: string;  // 外部APIプロバイダー名（OAuth2接続先）
  label: string;
  description?: string;
  isActive: boolean;
  syncStatus: ContextResourceSyncStatus;
  lastSyncAt?: Date;
  sortOrder: number;
}

// ============================================
// 各プロバイダー固有の設定
// ============================================

// --- Box ---
export interface BoxResourceConfig {
  folderId: string;
  folderPath?: string;  // 表示用パス
  depth: DepthConfig;
  filePatterns?: string[];  // *.pdf, *.docx など
  excludePatterns?: string[];
  maxFileSizeMB?: number;
}

export interface ContextResourceBox extends ContextResourceProvider {
  providerType: 'box';
  config: BoxResourceConfig;
}

// --- Confluence ---
export interface ConfluenceResourceConfig {
  spaceKey: string;
  spaceName?: string;
  pageId?: string;       // 特定ページを指定する場合
  pagePath?: string;     // 表示用パス
  depth: DepthConfig;    // 子ページの取得深度
  labels?: string[];     // ラベルフィルタ
  includeAttachments?: boolean;
}

export interface ContextResourceConfluence extends ContextResourceProvider {
  providerType: 'confluence';
  config: ConfluenceResourceConfig;
}

// --- Jira ---
export interface JiraResourceConfig {
  queryType: 'project' | 'jql';
  projectKey?: string;   // queryType='project'の場合
  jql?: string;          // queryType='jql'の場合
  maxResults?: number;
  includeFields: JiraIncludeField[];
}

export type JiraIncludeField =
  | 'summary'
  | 'description'
  | 'comments'
  | 'attachments'
  | 'subtasks'
  | 'links';

export interface ContextResourceJira extends ContextResourceProvider {
  providerType: 'jira';
  config: JiraResourceConfig;
}

// --- GitLab ---
export interface GitLabResourceConfig {
  projectId: number;
  projectPath?: string;  // 表示用

  // 参照設定（複数ブランチ/タグ対応）
  refs?: GitRef[];               // 複数のブランチ/タグを指定
  ref?: string;                  // 後方互換: 単一指定の場合
  refType?: 'branch' | 'tag' | 'commit';

  // 取得対象の設定
  includeTargets: GitLabIncludeTarget[];

  // ファイルパターン（ソースコード取得時）
  filePatterns?: string[];       // src/**/*.ts など
  excludePatterns?: string[];    // node_modules, dist など

  // MR/Issue取得オプション
  mrState?: 'opened' | 'merged' | 'closed' | 'all';
  issueState?: 'opened' | 'closed' | 'all';
  maxItems?: number;             // MR/Issue/コミットの最大取得件数
}

/** Git参照（ブランチまたはタグ） */
export interface GitRef {
  name: string;
  type: 'branch' | 'tag';
  isDefault?: boolean;
}

/** GitLab取得対象 */
export type GitLabIncludeTarget =
  | 'source'      // ソースコード
  | 'mr'          // マージリクエスト
  | 'issues'      // Issues
  | 'pipelines'   // パイプライン
  | 'commits';    // コミット履歴

export const GITLAB_INCLUDE_TARGET_OPTIONS: { value: GitLabIncludeTarget; label: string; icon: string }[] = [
  { value: 'source', label: 'ソースコード', icon: 'code' },
  { value: 'mr', label: 'マージリクエスト', icon: 'merge' },
  { value: 'issues', label: 'Issues', icon: 'bug_report' },
  { value: 'pipelines', label: 'パイプライン', icon: 'play_circle' },
  { value: 'commits', label: 'コミット履歴', icon: 'history' },
];

export interface ContextResourceGitLab extends ContextResourceProvider {
  providerType: 'gitlab';
  config: GitLabResourceConfig;
}

// --- Gitea ---
export interface GiteaResourceConfig {
  owner: string;
  repo: string;
  repoFullName?: string; // 表示用

  // 参照設定（複数ブランチ/タグ対応）
  refs?: GitRef[];               // 複数のブランチ/タグを指定
  ref?: string;                  // 後方互換: 単一指定の場合
  refType?: 'branch' | 'tag' | 'commit';

  // 取得対象の設定
  includeTargets: GiteaIncludeTarget[];

  // ファイルパターン（ソースコード取得時）
  filePatterns?: string[];       // src/**/*.ts など
  excludePatterns?: string[];    // node_modules, dist など

  // PR/Issue取得オプション
  prState?: 'open' | 'closed' | 'all';
  issueState?: 'open' | 'closed' | 'all';
  maxItems?: number;
}

/** Gitea取得対象 */
export type GiteaIncludeTarget =
  | 'source'      // ソースコード
  | 'pr'          // プルリクエスト
  | 'issues'      // Issues
  | 'commits';    // コミット履歴

export const GITEA_INCLUDE_TARGET_OPTIONS: { value: GiteaIncludeTarget; label: string; icon: string }[] = [
  { value: 'source', label: 'ソースコード', icon: 'code' },
  { value: 'pr', label: 'プルリクエスト', icon: 'merge' },
  { value: 'issues', label: 'Issues', icon: 'bug_report' },
  { value: 'commits', label: 'コミット履歴', icon: 'history' },
];

export interface ContextResourceGitea extends ContextResourceProvider {
  providerType: 'gitea';
  config: GiteaResourceConfig;
}

// --- Mattermost ---
export interface MattermostResourceConfig {
  sourceType: 'channel' | 'timeline';
  teamId: string;
  teamName?: string;       // 表示用
  channelIds?: string[];   // sourceType='channel'の場合
  channelNames?: string[]; // 表示用
  timelineId?: string;     // sourceType='timeline'の場合
  timelineName?: string;   // 表示用
  rangeType: 'period' | 'count';
  periodDays?: number;     // rangeType='period'の場合
  messageCount?: number;   // rangeType='count'の場合
  keywords?: string[];     // キーワードフィルター
}

export interface ContextResourceMattermost extends ContextResourceProvider {
  providerType: 'mattermost';
  config: MattermostResourceConfig;
}

// --- Web ---
export interface WebResourceConfig {
  sourceType: 'url' | 'sitelist';
  urls?: string[];           // sourceType='url'の場合
  sitelistPath?: string;     // sourceType='sitelist'の場合（ローカルファイルパス）
  sitelistContent?: string;  // サイトリストの内容（保存用）
  depth: DepthConfig;        // リンクホップ深度
  domainPolicy: WebDomainPolicy;
  respectRobotsTxt: boolean;
  skipNoIndex: boolean;
  excludePatterns?: string[];
  requestIntervalSeconds?: number;
}

export interface WebDomainPolicy {
  type: 'same' | 'subdomain' | 'allowlist';
  allowedDomains?: string[];  // type='allowlist'の場合
}

export interface ContextResourceWeb extends ContextResourceProvider {
  providerType: 'web';
  config: WebResourceConfig;
}

// --- Local (ファイル/フォルダ) ---
export interface LocalResourceConfig {
  fileGroupId: string;  // FileGroupEntityへの参照
  label?: string;
}

export interface ContextResourceLocal extends ContextResourceProvider {
  providerType: 'local';
  config: LocalResourceConfig;
}

// ============================================
// Union型
// ============================================

export type ContextResource =
  | ContextResourceBox
  | ContextResourceConfluence
  | ContextResourceJira
  | ContextResourceGitLab
  | ContextResourceGitea
  | ContextResourceMattermost
  | ContextResourceWeb
  | ContextResourceLocal;

export type ContextResourceConfig =
  | BoxResourceConfig
  | ConfluenceResourceConfig
  | JiraResourceConfig
  | GitLabResourceConfig
  | GiteaResourceConfig
  | MattermostResourceConfig
  | WebResourceConfig
  | LocalResourceConfig;

// ============================================
// View用拡張型
// ============================================

export interface ContextHubForView extends ContextHub {
  resources: ContextResourceForView[];
  resourceCount: number;
}

export interface ContextResourceForView extends ContextResourceProvider {
  config: ContextResourceConfig;
  itemCount?: number;       // 取得済みアイテム数
  lastError?: string;       // 最後のエラーメッセージ
  isConnected?: boolean;    // OAuth2接続状態
  isExpanded?: boolean;     // UI展開状態
}

// ============================================
// DTO (Data Transfer Objects)
// ============================================

export interface ContextHubCreateDto {
  projectId: UUID;
  name: string;
  description?: string;
}

export interface ContextHubUpdateDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface ContextResourceCreateDto {
  contextHubId: UUID;
  providerType: ContextResourceProviderType;
  providerName: string;
  label: string;
  description?: string;
  config: ContextResourceConfig;
}

export interface ContextResourceUpdateDto {
  label?: string;
  description?: string;
  isActive?: boolean;
  config?: Partial<ContextResourceConfig>;
}

// ============================================
// フォーム用ヘルパー型
// ============================================

/** プロバイダー選択用 */
export interface ProviderOption {
  type: ContextResourceProviderType;
  name: string;
  label: string;
  icon: string;
  isConnected: boolean;
  authType: 'oauth2' | 'apikey' | 'none';
}

/** 深度選択用 */
export const DEPTH_OPTIONS = [
  { value: 'none', label: 'このフォルダのみ' },
  { value: 'limited', label: '指定階層まで' },
  { value: 'unlimited', label: 'すべて（無制限）' },
] as const;

/** Jiraフィールド選択用 */
export const JIRA_FIELD_OPTIONS: { value: JiraIncludeField; label: string }[] = [
  { value: 'summary', label: '概要' },
  { value: 'description', label: '説明' },
  { value: 'comments', label: 'コメント' },
  { value: 'attachments', label: '添付ファイル' },
  { value: 'subtasks', label: 'サブタスク' },
  { value: 'links', label: 'リンク' },
];
