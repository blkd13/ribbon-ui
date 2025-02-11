import { Observable } from "rxjs";
import { OpenAI } from "openai";
import { ChatCompletionStreamInDto, UserStatus } from "./models";
import { CountTokensResponse } from "../services/chat.service";

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
    Text = 'text',
    Error = 'error',
    Base64 = 'base64',
    Url = 'url',
    File = 'file',
    Tool = 'tool', // function_call
    Meta = 'meta', // メタ情報。groundingの結果など。
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
//     lastUpdate: Date;
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
//     lastUpdate: Date;
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
    lastUpdate: Date;
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
    lastUpdate: Date;
    role: OpenAI.ChatCompletionRole;
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
    lastUpdate: Date;
    label: string;
    cacheId?: string;
    editedRootMessageId?: UUID;
}

export enum MessageStatusType {
    Initial = 'Initial',
    // Normal = 'Normal',
    Editing = 'Editing',
    Loading = 'Loading',
    Loaded = 'Loaded',
    // Error = 'Error',
    // Deleted = 'Deleted',
}
export interface MessageForView extends Message {
    editing: number;
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
    meta?: any;
    fileGroupId?: string;
    tokenCount?: { [modelId: string]: CountTokensResponse }; // JSON型を保存
}
