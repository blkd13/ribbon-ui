import { ChatCompletionCreateParamsBase, ChatCompletionStreamInDto, UserStatus } from "./models";

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

export enum ThreadVisibility {
    Public = 'Public',
    Team = 'Team',
    Login = 'Login',
    Temporary = 'Temporary'
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
export interface ThreadCreateDto {
    // projectId: string;
    title: string;
    description: string;
    visibility: ThreadVisibility;
    inDtoJson: string;
}

export interface ThreadUpdateDto {
    title?: string;
    description?: string;
    visibility?: ThreadVisibility;
    seq?: number;
    inDtoJson?: string;
}

export interface ThreadResponseDto {
    id: UUID;
    projectId: UUID;
    title: string;
    description: string;
    lastUpdate: Date;
    seq: number;
    inDtoJson: string;
    visibility: ThreadVisibility;
    createdAt: Date;
    updatedAt: Date;
}

// MessageGroup and Message DTOs
// export interface ContentPartDto {
//     type: ContentPartType;
//     content: string;
// }

export interface MessageUpsertDto {
    messageClusterId?: UUID; // 更新の場合に使用
    messageGroupId?: UUID; // 更新の場合に使用
    messageId?: UUID; // 更新の場合に使用
    messageClusterType: MessageClusterType;
    messageGroupType: MessageGroupType;
    role: string;
    label: string;
    previousMessageId?: UUID;
    contents: ContentPart[];
}

export interface MessageGroupResponseDto {
    id: UUID;
    threadId: UUID;
    messageClusterId: UUID;
    messageClusterType: MessageClusterType;
    messageGroupType: MessageGroupType;
    role: 'system' | 'user' | 'assistant';
    label: string;
    seq: number;
    lastUpdate: Date;
    previousMessageId?: UUID;
    selectedIndex: number;
    createdAt: Date;
    updatedAt: Date;
    messages: MessageForView[];
}

export interface MessageResponseDto {
    id: UUID;
    messageGroupId: UUID;
    label: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ContentPartResponseDto {
    id: UUID;
    messageId: UUID;
    type: ContentPartType;
    content: string;
    seq: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface MessageUpsertResponseDto {
    messageGroup: MessageGroupResponseDto;
    message: MessageForView;
    contentParts: ContentPartResponseDto[];
}

export interface MessageGroupListResponseDto {
    messageGroups: MessageGroupResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}





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

export interface Thread extends BaseEntity {
    projectId: UUID;
    title: string;
    description: string;
    visibility: ThreadVisibility;
    lastUpdate: Date;
    seq: number;
    inDto: ChatCompletionStreamInDto;
}

export interface MessageGroup extends BaseEntity {
    threadId: UUID;
    type: MessageGroupType;
    seq: number;
    lastUpdate: Date;
    role: string;
    label: string;
    previousMessageId?: UUID;
}

export interface Message extends BaseEntity {
    messageGroupId: UUID;
    seq: number;
    lastUpdate: Date;
    label: string;
    cacheId?: string;
}

export interface MessageForView extends Message {
    editing: number;
    status: number;
    selected: boolean;
    contents: ContentPart[];
}

export interface ContentPart extends BaseEntity {
    messageId: UUID;
    type: ContentPartType;
    // content: string;
    seq: number;
    text?: string;
    fileId?: string;
}