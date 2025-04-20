import { Observable } from "rxjs";
import { OpenAI } from "openai";
import { ChatCompletionStreamInDto, UserStatus } from "./models";
import { CountTokensResponse } from "../services/chat.service";
import { ChatCompletionChunk, ChatCompletionToolMessageParam } from "openai/resources/index.mjs";
import { ToolCallGroup, ToolCallGroupForView, ToolCallGroupStatus } from "../services/tool-call.service";

// 共通の型定義
export type UUID = string;

// 列挙型の定義
export enum TeamType {
    Alone = 'Alone',
    Team = 'Team'
}

export enum TeamMemberRoleType {
    Owner = 'Owner',
    Admin = 'Admin',
    Member = 'Member',
    Viewer = 'Viewer',
    Guest = 'Guest'
}

export enum ProjectVisibility {
    Default = 'Default',
    Public = 'Public',
    Team = 'Team',
    Login = 'Login'
}

export enum ThreadGroupVisibility {
    Public = 'Public',
    Team = 'Team',
    Login = 'Login',
    Temporary = 'Temporary'
}
export enum ThreadGroupType {
    Normal = 'Normal', // 通常スレッド
    Default = 'Default', // デフォルトスレッド
    Template = 'Template', // テンプレートスレッド
    // Announcement = 'Announcement', // お知らせスレッド
    // Temporary = 'Temporary', // 一時的なスレッド
}

export enum MessageClusterType {
    Single = 'Single',
    Parallel = 'Parallel',
    Regenerated = 'Regenerated'
}
export enum MessageGroupType {
    Single = 'Single',
    Parallel = 'Parallel',
    Regenerated = 'Regenerated'
}

export enum ContentPartType {
    TEXT = 'text',
    ERROR = 'error',
    BASE64 = 'base64', // 軽量コンテンツをロードするときに使う、メッセージオブジェクトの配下にくっつけてやるパターン。最初の一回はBase64で登録して、使うときはfileになっている感じ。
    URL = 'url', // インターネットのリンク。基本使わないつもり。
    STORE = 'store', // GCPのStorageに登録されているもの。gs://
    FILE = 'file', // サーバー側にファイルとして保存済みのもの // fileになっているものは登録済みなので、登録処理の時は無視する。
    TOOL = 'tool', // function_call
    META = 'meta', // メタ情報。groundingの結果など。
}

// Team DTOs
export interface TeamCreateDto {
    name: string;
    label: string;
    description?: string;
    teamType: TeamType;
}

export interface TeamUpdateDto {
    name?: string;
    label?: string;
    description?: string;
}

export interface TeamResponseDto {
    id: UUID;
    name: string;
    label: string;
    description?: string;
    teamType: TeamType;
    createdAt: Date;
    updatedAt: Date;
}

// TeamMember DTOs
export interface TeamMemberAddDto {
    userId: UUID;
    role: TeamMemberRoleType;
}

export interface TeamMemberUpdateDto {
    role: TeamMemberRoleType;
}

export interface TeamMemberResponseDto {
    id: UUID;
    userId: UUID;
    teamId: UUID;
    role: TeamMemberRoleType;
    createdAt: Date;
    updatedAt: Date;
}

// Project DTOs
export interface ProjectCreateDto {
    name: string;
    label: string;
    description?: string;
    visibility: ProjectVisibility;
    teamId: UUID;
}

export interface ProjectUpdateDto {
    name?: string;
    label?: string;
    description?: string;
    visibility?: ProjectVisibility;
    teamId?: UUID;
}

export interface ProjectResponseDto {
    id: UUID;
    name: string;
    label: string;
    description?: string;
    visibility: ProjectVisibility;
    teamId: UUID;
    createdAt: Date;
    updatedAt: Date;
}

// Thread DTOs
export interface ThreadGroupUpsertDto {
    id?: UUID; // 更新の場合に使用
    title: string;
    description: string;
    visibility: ThreadGroupVisibility;
    threadList: ThreadUpsertDto[];
}
export interface ThreadUpsertDto {
    id?: UUID; // 更新の場合に使用
    inDto: ChatCompletionStreamInDto;
}

// export interface ThreadResponseDto {
//     id: UUID;
//     projectId: UUID;
//     title: string;
//     description: string;
//     seq: number;
//     // inDtoJson: string;
//     inDto: ChatCompletionStreamInDto;
//     visibility: ThreadVisibility;
//     createdAt: Date;
//     updatedAt: Date;
// }

// MessageGroup and Message DTOs
// export interface ContentPartDto {
//     type: ContentPartType;
//     content: string;
// }

// export interface MessageUpsertDto {
//     messageGroupId?: UUID; // 更新の場合に使用
//     messageId?: UUID; // 更新の場合に使用
//     messageClusterType: MessageClusterType;
//     messageGroupType: MessageGroupType;
//     role: OpenAI.ChatCompletionRole;
//     label: string;
//     previousMessageId?: UUID;
//     contents: ContentPart[];
// }

// export interface MessageGroupResponseDto {
//     id: UUID;
//     threadId: UUID;
//     messageGroupType: MessageGroupType;
//     role: OpenAI.ChatCompletionRole;
//     label: string;
//     seq: number;
//     previousMessageGroupId?: UUID;
//     // selectedIndex: number;
//     createdAt: Date;
//     updatedAt: Date;
//     messages: MessageForView[];
// }

export interface MessageResponseDto {
    id: UUID;
    messageGroupId: UUID;
    label: string;
    createdAt: Date;
    updatedAt: Date;
}

// export interface ContentPartResponseDto {
//     id: UUID;
//     messageId: UUID;
//     type: ContentPartType;
//     content: string;
//     seq: number;
//     createdAt: Date;
//     updatedAt: Date;
// }

// export interface MessageUpsertResponseDto {
//     messageGroup: MessageGroup;
//     message: Message;
//     contentParts: ContentPart[];
// }
// export interface MessageUpsertResponseDtoForView {
//     messageGroup: MessageGroupForView;
//     message: MessageForView;
//     contentParts: ContentPart[];
// }

// export interface MessageGroupListResponseDto {
//     messageGroups: MessageGroupResponseDto[];
//     total: number;
//     page: number;
//     limit: number;
//     totalPages: number;
// }





export interface BaseEntity {
    id: UUID;
    createdBy: UUID;
    updatedBy: UUID;
    createdAt: Date;
    updatedAt: Date;
}
export type BaseEntityFields = keyof BaseEntity;

export interface Team extends BaseEntity {
    name: string;
    label: string;
    description?: string;
    teamType: TeamType;
    members: TeamMemberForView[];
}
export interface TeamForView extends Team {
    projects: Project[];
}

export interface TeamMember extends BaseEntity {
    userId: UUID;
    teamId: UUID;
    role: TeamMemberRoleType;
}
export interface TeamMemberForView extends TeamMember {
    user: {
        id: UUID;
        name: string;
        email: string;
        role: TeamMemberRoleType;
        status: UserStatus;
    }
}

export interface Project extends BaseEntity {
    name: string;
    label: string;
    description?: string;
    visibility: ProjectVisibility;
    teamId: UUID;
}

export interface ThreadGroup extends BaseEntity {
    projectId: UUID;
    type: ThreadGroupType;
    title: string;
    description: string;
    visibility: ThreadGroupVisibility;
    threadList: Thread[];
}
export interface Thread extends BaseEntity {
    threadGroupId: UUID;
    status: 'Normal' | 'Deleted';
    inDto: ChatCompletionStreamInDto;
}

export interface MessageGroup extends BaseEntity {
    threadId: UUID;
    type: MessageGroupType; // Single, Parallel, Regenerated
    seq: number;
    role: OpenAI.ChatCompletionRole;
    source?: 'user' | string;
    // label: string;
    previousMessageGroupId?: UUID;
    // editedRootMessageGroupId?: UUID;
}

export interface MessageGroupForView extends MessageGroup {
    // editing: number;
    // status: number;
    messages: MessageForView[];
    selectedIndex: number; // messagesではなくnextMessageGroupIdのindex
    isExpanded?: boolean;
}

export interface Message extends BaseEntity {
    messageGroupId: UUID;
    seq: number;
    subSeq: number; // 並列メッセージの場合のサブシーケンス
    label: string;
    cacheId?: string;
    editedRootMessageId?: UUID;
}

export enum MessageStatusType {
    Initial = 'Initial',
    // Normal = 'Normal',
    Editing = 'Editing', // 手動編集中
    Waiting = 'Waiting', // AI自動生成開始待ち
    Loading = 'Loading', // AI自動生成中
    Loaded = 'Loaded', // 通常
    Canceled = 'Canceled', // キャンセル
    // Error = 'Error',
    // Deleted = 'Deleted',
}
export interface MessageForView extends Message {
    editing: number; // 0: 通常, 1: 編集中, 2: AI自動生成中
    status: MessageStatusType;
    selected: boolean;
    contents: ContentPart[];
    observer?: Observable<OpenAI.ChatCompletionChunk>;
}

export interface ContentPart extends BaseEntity {
    messageId: UUID;
    type: ContentPartType;
    seq: number;
    text?: string;
    toolCallGroup?: ToolCallGroupForView;
    meta?: any;
    linkId?: string;
    tokenCount?: { [modelId: string]: CountTokensResponse }; // JSON型を保存
}
