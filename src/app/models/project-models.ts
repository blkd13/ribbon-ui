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

export enum MessageGroupType {
    Single = 'Single',
    Parallel = 'Parallel',
    Regenerated = 'Regenerated'
}

export enum ContentPartType {
    TEXT = 'text',
    BASE64 = 'base64',
    URL = 'url',
    FILE = 'file'
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
    title: string;
    description: string;
    visibility: ThreadVisibility;
}

export interface ThreadUpdateDto {
    title?: string;
    description?: string;
    visibility?: ThreadVisibility;
}

export interface ThreadResponseDto {
    id: UUID;
    projectId: UUID;
    title: string;
    description: string;
    visibility: ThreadVisibility;
    createdAt: Date;
    updatedAt: Date;
}

// MessageGroup and Message DTOs
export interface ContentPartDto {
    type: ContentPartType;
    content: string;
}

export interface MessageUpsertDto {
    messageId?: UUID; // 更新の場合に使用
    groupType: MessageGroupType;
    role: string;
    label: string;
    parentId?: UUID;
    contents: ContentPartDto[];
}

export interface MessageGroupResponseDto {
    id: UUID;
    threadId: UUID;
    type: MessageGroupType;
    role: string;
    label: string;
    parentId?: UUID;
    createdAt: Date;
    updatedAt: Date;
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

export interface MessageGroupDetailsResponseDto {
    messageGroup: MessageGroupResponseDto;
    message: MessageResponseDto;
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


// import { UUID, TeamType, TeamMemberRoleType, ProjectVisibility, ThreadVisibility, MessageGroupType, ContentPartType } from './dto-types';

export interface ITeam extends BaseEntity {
    name: string;
    label: string;
    description?: string;
    teamType: TeamType;
}

export class Team implements ITeam {
    constructor(
        public id: UUID,
        public name: string,
        public label: string,
        public teamType: TeamType,
        public createdBy: UUID,
        public updatedBy: UUID,
        public createdAt: Date,
        public updatedAt: Date,
        public description?: string,
    ) { }

    get isPersonal(): boolean {
        return this.teamType === TeamType.Alone;
    }
}

export interface ITeamMember {
    id: UUID;
    userId: UUID;
    teamId: UUID;
    role: TeamMemberRoleType;
}

export class TeamMember implements ITeamMember {
    constructor(
        public id: UUID,
        public userId: UUID,
        public teamId: UUID,
        public role: TeamMemberRoleType,
    ) { }

    get canManageTeam(): boolean {
        return this.role === TeamMemberRoleType.Owner || this.role === TeamMemberRoleType.Admin;
    }
}

export interface IProject {
    id: UUID;
    name: string;
    label: string;
    description?: string;
    visibility: ProjectVisibility;
    teamId: UUID;
}

export class Project implements IProject {
    constructor(
        public id: UUID,
        public name: string,
        public label: string,
        public visibility: ProjectVisibility,
        public teamId: UUID,
        public description?: string
    ) { }

    get isPublic(): boolean {
        return this.visibility === ProjectVisibility.Public;
    }
}

export interface IThread {
    id: UUID;
    projectId: UUID;
    title: string;
    description: string;
    visibility: ThreadVisibility;
}

export class Thread implements IThread {
    constructor(
        public id: UUID,
        public projectId: UUID,
        public title: string,
        public description: string,
        public visibility: ThreadVisibility,
    ) { }

    get isPublic(): boolean {
        return this.visibility === ThreadVisibility.Public;
    }
}

export interface IMessageGroup {
    id: UUID;
    threadId: UUID;
    type: MessageGroupType;
    role: string;
    label: string;
    parentId?: UUID;
}

export class MessageGroup implements IMessageGroup {
    constructor(
        public id: UUID,
        public threadId: UUID,
        public type: MessageGroupType,
        public role: string,
        public label: string,
        public parentId?: UUID
    ) { }

    get isParallel(): boolean {
        return this.type === MessageGroupType.Parallel;
    }
}

export interface IMessage {
    id: UUID;
    messageGroupId: UUID;
    label: string;
}

export class Message implements IMessage {
    constructor(
        public id: UUID,
        public messageGroupId: UUID,
        public label: string,
    ) { }
}

export interface IContentPart {
    id: UUID;
    messageId: UUID;
    type: ContentPartType;
    content: string;
    seq: number;
}

export class ContentPart implements IContentPart {
    constructor(
        public id: UUID,
        public messageId: UUID,
        public type: ContentPartType,
        public content: string,
        public seq: number,
    ) { }

    get isText(): boolean {
        return this.type === ContentPartType.TEXT;
    }

    get isFile(): boolean {
        return this.type === ContentPartType.FILE;
    }
}