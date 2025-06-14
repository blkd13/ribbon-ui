// ./src/app/models.ts

import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions';
import { BaseEntity } from './project-models';
import { ScopeInfo } from '../services/model-manager.service';

export enum UserStatus {
    // アクティブ系
    Active = "Active",                // アクティブ状態
    Inactive = "Inactive",            // 非アクティブ状態

    // セキュリティ系
    Suspended = "Suspended",          // アクセス停止
    Locked = "Locked",                // アカウントロック
    Banned = "Banned",                // アクセス禁止

    // アカウントの状態系
    Deleted = "Deleted",              // 削除済み
    Archived = "Archived",            // アーカイブ済み
}

export enum UserRoleType {
    // Maintainer = 'Maintainer', // メンテナ
    User = 'User', // ユーザー
    // Owner = 'Owner', // 所有者
    // BizAdmin = 'BizAdmin', // ビジネス管理者
    // SysAdmin = 'SysAdmin', // システム管理者
    MemberManager = 'MemberManager', // メンバー管理者
    AIManager = 'AIManager', // AI管理者
    APIManager = 'APIManager', // API管理者
    Auditor = 'Auditor', // 監査者
    Admin = 'Admin', // 管理者
    SuperAdmin = 'SuperAdmin', // スーパーユーザー
    // Member = 'Member', // メンバー
    // Viewer = 'Viewer', // 閲覧者
    // Guest = 'Guest', // ゲスト
}

export interface UserRole {
    scopeInfo: ScopeInfo;
    role: UserRoleType;
}

export interface User {
    id: string;
    name: string;
    email: string;
    roleList: UserRole[];
    status: UserStatus;
    orgKey: string;

    // public profilePictureUrl: string
}
export interface TwoFactorAuthDetails {
    userId: number;
    secret: string;
    qrCodeUrl: string;
}

export type GPTModels = 'gpt-4o'
    | 'gpt-4o-mini'
    | 'gpt-4'
    | 'gpt-4.1'
    | 'gpt-4-vision-preview'
    | 'gemini-1.5-flash'
    | 'gemini-1.5-pro'
    | 'gemini-1.5-flash-001'
    | 'gemini-1.5-pro-001'
    | 'gemini-1.5-flash-002'
    | 'gemini-1.5-pro-002'
    | 'gemini-1.0-pro'
    | 'gemini-1.0-pro-vision'
    | 'claude-3-5-sonnet-v2@20241022'
    | 'claude-3-7-sonnet'
    | 'claude-3-7-sonnet-20250219'
    | 'claude-3-7-sonnet-thinking-20250219'
    | 'claude-3-7-sonnet@20250219'
    | 'claude-3-7-sonnet-thinking@20250219'
    | 'gemini-2.0-flash-exp';


export interface CachedContent {
    id: string;
    name: string;
    model: string;
    createTime: string;
    updateTime: string;
    expireTime: string;
}

export type ChatCompletionCreateParamsWithoutMessages = Omit<ChatCompletionCreateParamsBase, 'messages'> & { providerName: string, isGoogleSearch?: boolean, cachedContent?: CachedContent, safetySettings?: SafetyRating[] };
export interface ChatCompletionStreamInDto {
    args: ChatCompletionCreateParamsWithoutMessages;
    options?: {};
}

export type SafetyRatingCategory = 'HARM_CATEGORY_HATE_SPEECH' | 'HARM_CATEGORY_DANGEROUS_CONTENT' | 'HARM_CATEGORY_HARASSMENT' | 'HARM_CATEGORY_SEXUALLY_EXPLICIT';
export const safetyRatingLabelMap: Record<SafetyRatingCategory, string> = {
    HARM_CATEGORY_HATE_SPEECH: '悪意のある表現（ヘイトスピーチ）', // ID や保護されている属性をターゲットとする否定的なコメントや有害なコメント
    HARM_CATEGORY_DANGEROUS_CONTENT: '危険なコンテンツ', // 有害な商品、サービス、アクティビティへのアクセスを促進または可能にする
    HARM_CATEGORY_HARASSMENT: 'ハラスメントコンテンツ', // 他人をターゲットにした悪口、威圧表現、いじめ、虐待的な内容を含むコメント
    HARM_CATEGORY_SEXUALLY_EXPLICIT: '性的に露骨なコンテンツ', // 性行為やわいせつな内容に関する情報が含まれるコンテンツ
};
export interface SafetyRating {
    category: SafetyRatingCategory;
    blocked?: boolean;
    probability: string;
    probabilityScore: number;
    severity: string;
    severityScore: number
}


export type MessageGroupType = 'SINGLE' | 'PARALLEL' | 'REGENERATED';
// export type MessageGroup = { seq: number, id: string, previousMessageId: string, type: MessageGroupType, messages: MessageForView[], selected: boolean, };

// export interface ChatInputDto {
//     messageList: MessageForView[];
//     model?: GPTModels;
//     max_tokens?: number | null;
//     temperature?: number | null;
//     top_p?: number | null;

//     // Gemini用:コンテキストキャッシュ
//     cachedContent?: CachedContent;
//     // Gemini用:安全性設定
//     safetySettings?: SafetyRating[];
// }


export interface GenerateContentRequestForCache {
    ttl?: { seconds: number, nanos: number };
    expire_time?: string; // "expire_time":"2024-06-30T09:00:00.000000Z"
}

export enum ExtApiProviderAuthType {
    OAuth2 = 'OAuth2',
    APIKey = 'APIKey',
}

export enum ExtApiProviderPostType {
    json = 'json',
    params = 'params',
    // form = 'form',
}

export interface OAuth2ConfigTemplate {
    pathAuthorize: string;
    pathAccessToken: string;
    scope: string;
    postType: ExtApiProviderPostType;
    redirectUri: string;
}
export interface OAuth2Config extends OAuth2ConfigTemplate {
    clientId: string;
    clientSecret: string;
    requireMailAuth: boolean;
}
export interface ExtApiProviderTemplateEntity extends BaseEntity {
    name: string; // 'gitlab' | 'gitea' | etc
    authType: ExtApiProviderAuthType;
    pathUserInfo: string;
    uriBaseAuth: string;
    oAuth2Config?: OAuth2ConfigTemplate;
    description?: string;
}
export interface ExtApiProviderEntity extends ExtApiProviderTemplateEntity {
    type: string; // 'gitlab' | 'gitea' | etc
    label: string; // 'GitLab' | 'Gitea' | etc
    uriBase: string;
    oAuth2Config?: OAuth2Config;
    sortSeq: number;
}

export interface OrganizationSiteConfig {
    theme?: string;
    logoUrl?: string;
    contactEmail?: string;
    supportUrl?: string;
    privacyPolicyUrl?: string;
    termsOfServiceUrl?: string;
    oauth2RedirectUriList?: string[];
    pathTop?: string;
}

export interface OrganizationEntity extends BaseEntity {
    partentId?: string;
    key: string;
    label: string;
    description?: string;
    siteConfig: OrganizationSiteConfig;
    isActive: boolean;
}
