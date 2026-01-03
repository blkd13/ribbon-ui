/**
 * Code Session Models
 * ClaudeCode/GeminiCli/CodexCliなどのセッションデータモデル
 * 
 * 📊 分析結果に基づく実データ構造:
 * - 全18ファイル、803メッセージ、17セッション、6プロジェクト
 * - メッセージタイプ: user(36.7%), assistant(52.1%), file-history-snapshot(10.1%), summary(1%), system(0.1%)
 * - ツール: Bash, Edit, Read, Write, Glob, Grep, TodoWrite, WebFetch, BashOutput
 * - モデル: claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001, claude-sonnet-4-20250514
 */

// ============================================================================
// 基本型定義
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageType = 'user' | 'assistant' | 'file-history-snapshot' | 'summary' | 'system';
export type UserType = 'external' | 'internal';
export type ToolName = 'Bash' | 'BashOutput' | 'Edit' | 'Glob' | 'Grep' | 'Read' | 'TodoWrite' | 'WebFetch' | 'Write';
export type ContentType = 'text' | 'tool_use' | 'tool_result';
export type SystemSubtype = 'compact_boundary';

// ============================================================================
// 共通フィールド
// ============================================================================

/**
 * 基本メッセージインターフェース
 * 全メッセージタイプで共通のフィールド
 */
export interface BaseMessage {
  type: MessageType;
  uuid?: string; // file-history-snapshotとsummaryにはない
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  isSidechain?: boolean;
  userType?: UserType;
}

// ============================================================================
// メッセージコンテンツ型
// ============================================================================

/**
 * テキストコンテンツ
 */
export interface TextContent {
  type: 'text';
  text: string;
}

/**
 * ツール使用コンテンツ
 */
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: ToolName | string; // 未知のツールもサポート
  input: Record<string, any>;
}

/**
 * ツール結果コンテンツ
 */
export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export type MessageContent = TextContent | ToolUseContent | ToolResultContent;

// ============================================================================
// メッセージ構造
// ============================================================================

/**
 * メッセージ本体（userとassistantで共通）
 */
export interface MessageBody {
  role: MessageRole;
  content: string | MessageContent[]; // userは文字列、assistantは配列
  model?: string; // assistantのみ
  id?: string; // assistantのみ
  type?: 'message'; // assistantのみ
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
    cache_creation?: {
      ephemeral_5m_input_tokens?: number;
      ephemeral_1h_input_tokens?: number;
    };
    service_tier?: string;
  };
}

// ============================================================================
// 具体的なメッセージ型
// ============================================================================

/**
 * ユーザーメッセージ
 */
export interface UserMessage extends BaseMessage {
  type: 'user';
  message: MessageBody;
  thinkingMetadata?: {
    level: string;
    disabled: boolean;
    triggers: string[];
  };
  toolUseResult?: {
    // ツール実行結果（構造は多様なのでanyで）
    type?: string;
    filePath?: string;
    oldString?: string;
    newString?: string;
    originalFile?: string;
    structuredPatch?: any[];
    userModified?: boolean;
    replaceAll?: boolean;
    [key: string]: any;
  };
  // その他のフラグ
  isMeta?: boolean;
  isCompactSummary?: boolean;
  isVisibleInTranscriptOnly?: boolean;
}

/**
 * アシスタントメッセージ
 */
export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  message: MessageBody;
  requestId?: string;
}

/**
 * ファイル変更履歴のスナップショット
 */
export interface FileHistorySnapshot extends BaseMessage {
  type: 'file-history-snapshot';
  messageId: string;
  snapshot: {
    messageId: string;
    trackedFileBackups: Record<string, {
      backupFileName: string | null;
      version: number;
      backupTime: string;
    }>;
    timestamp: string;
  };
  isSnapshotUpdate?: boolean;
}

/**
 * サマリーメッセージ
 */
export interface SummaryMessage {
  type: 'summary';
  summary: string;
  leafUuid: string;
}

/**
 * システムメッセージ
 */
export interface SystemMessage extends BaseMessage {
  type: 'system';
  subtype?: SystemSubtype;
  content?: string;
  level?: string;
  logicalParentUuid?: string;
  isMeta?: boolean;
  compactMetadata?: {
    trigger: string;
    preTokens: number;
  };
}

/**
 * 全メッセージ型の統合
 */
export type CodeSessionMessage = 
  | UserMessage 
  | AssistantMessage 
  | FileHistorySnapshot
  | SummaryMessage
  | SystemMessage;

// ============================================================================
// セッション・プロジェクト構造
// ============================================================================

/**
 * セッション情報
 */
export interface CodeSession {
  sessionId: string;
  projectPath: string;
  projectName: string;
  messages: CodeSessionMessage[];
  startTime: string;
  endTime?: string;
  messageCount: number;
  gitBranch?: string;
  version?: string;
  cwd?: string;
}

/**
 * プロジェクト情報
 */
export interface CodeProject {
  name: string;
  displayName: string; // -mnt-... を見やすく整形したもの
  path: string;
  sessions: CodeSession[];
  lastActivity: string;
  totalMessages: number;
  sessionCount: number;
}

// ============================================================================
// UI用ヘルパー型
// ============================================================================

/**
 * メッセージツリーノード（UI表示用）
 */
export interface MessageTreeNode {
  message: CodeSessionMessage;
  children: MessageTreeNode[];
  depth: number;
  isExpanded: boolean;
  index: number; // 元の配列でのインデックス
}

/**
 * ツール呼び出しペア（ToolUse + 対応するToolResult）
 */
export interface ToolCallPair {
  toolUse: {
    id: string;
    name: string;
    input: Record<string, any>;
    message: AssistantMessage;
    timestamp: string;
  };
  call?: { // toolUseのエイリアス（テンプレート互換性のため）
    id: string;
    toolName: string;
    parameters: Record<string, any>;
    timestamp: string;
  };
  toolResult?: {
    content: string;
    result: Record<string, any>;
    message: UserMessage;
    timestamp: string;
    duration?: number; // ms
  };
  result?: { // toolResultのエイリアス（テンプレート互換性のため）
    success: boolean;
    output?: string;
    error?: string;
  };
}

/**
 * ファイル変更情報
 */
export interface FileModification {
  filePath: string;
  version: number;
  backupFileName: string | null;
  backupTime: string;
  messageId: string;
  message: FileHistorySnapshot;
}

/**
 * セッション統計情報
 */
export interface SessionStatistics {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  snapshotMessages: number;
  systemMessages: number;
  summaryMessages: number;
  
  toolCalls: number;
  toolsByName: Map<string, number>;
  
  filesModified: number;
  modifiedFiles: number; // filesModifiedのエイリアス
  filesByExtension: Map<string, number>;
  
  duration: number; // milliseconds
  startTime: string;
  endTime: string;
  
  tokenUsage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    cacheHitTokens: number;
    cacheCreationTokens: number;
  };
  totalTokens?: number; // 総トークン数（input + output）
  
  modelUsage?: Map<string, number>; // モデル名 -> 使用回数
}

/**
 * タイムラインイベント（時系列表示用）
 */
export interface TimelineEvent {
  timestamp: string;
  type: 'message' | 'tool-call' | 'tool-execution' | 'file-change' | 'file-history-snapshot' | 'summary' | 'system' | 'user' | 'assistant' | 'tool-pair';
  message: CodeSessionMessage;
  description: string;
  details?: string; // 詳細情報（オプション）
  icon?: string;
  color?: string;
  // ツールペア用の追加情報
  toolCall?: {
    name: string;
    input: any;
    timestamp: string;
  };
  toolResult?: {
    success: boolean;
    output?: string;
    error?: string;
    timestamp: string;
  };
}

/**
 * 検索/フィルタ条件
 */
export interface SessionFilter {
  projectName?: string;
  dateFrom?: string;
  dateTo?: string;
  messageTypes?: MessageType[];
  toolNames?: ToolName[];
  searchQuery?: string;
  hasFileChanges?: boolean;
  minMessages?: number;
  maxMessages?: number;
}

/**
 * 検索結果
 */
export interface SearchResult {
  session: CodeSession;
  matchedMessages: CodeSessionMessage[];
  relevanceScore: number;
}
