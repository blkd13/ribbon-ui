import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, tap } from 'rxjs';
import { BaseEntity } from '../models/project-models';

export enum AIProviderType {
  OPENAI = 'openai',
  AZURE_OPENAI = 'azure_openai',
  // AZURE = 'azure',
  GROQ = 'groq',
  MISTRAL = 'mistral',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  LOCAL = 'local',
  VERTEXAI = 'vertexai',
  ANTHROPIC_VERTEXAI = 'anthropic_vertexai',
  OPENAPI_VERTEXAI = 'openapi_vertexai',
  CEREBRAS = 'cerebras',
  COHERE = 'cohere',
  GEMINI = 'gemini',
}

export enum ScopeType {
  USER = 'USER', DIVISION = 'DIVISION', ORGANIZATION = 'ORGANIZATION',
  PROJECT = 'PROJECT', TEAM = 'TEAM', GLOBAL = 'GLOBAL',
}

// Interfaces
export interface ScopeInfo {
  scopeType: ScopeType;
  scopeId: string;
}

export interface CredentialMetadata {
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  location?: string;
  credentials?: Record<string, any>;
  [key: string]: any;
}

export interface AIProviderEntity extends BaseEntity {
  provider: AIProviderType;
  scopeInfo: ScopeInfo;
  label: string;
  orgKey: string;
  metadata?: CredentialMetadata;
  isActive: boolean;
}

// Service to handle AI Provider Entity operations
export class AIProviderManagerService {
  private providers: AIProviderEntity[] = [];
  private providerTypes: AIProviderType[] = Object.values(AIProviderType);
  private scopeTypes: ScopeType[] = Object.values(ScopeType);
  private scopeInfoTypes: ScopeInfo[] = this.scopeTypes.map(type => ({
    scopeType: type,
    scopeId: ''
  }));
  private credentialMetadataTypes: CredentialMetadata[] = this.providerTypes.map(type => ({
    apiKey: '',
    organizationId: '',
    projectId: '',
    location: '',
    credentials: {},
  }));
  readonly http: HttpClient = inject(HttpClient);

  getProviders() {
    return this.http.get<AIProviderEntity[]>(`/maintainer/ai-providers`).pipe(
      tap(res => {
        res.forEach(provider => {
          provider.createdAt = new Date(provider.createdAt);
          provider.updatedAt = new Date(provider.updatedAt);
        });
      }),
      tap(providers => {
        this.providers = providers;
      }),
    );
  }

  getProvider(provider: AIProviderType) {
    return this.http.get<AIProviderEntity[]>(`/maintainer/ai-providers`).pipe(
      tap(res => {
        res.forEach(provider => {
          provider.createdAt = new Date(provider.createdAt);
          provider.updatedAt = new Date(provider.updatedAt);
        });
      }),
      tap(providers => {
        this.providers = providers;
      }),
    );
  }

  upsertProvider(provider: AIProviderEntity) {
    const index = this.providers.findIndex(p => p.provider === provider.provider);
    if (index !== -1) {
      // Update existing provider
      this.providers[index] = { ...provider, updatedAt: new Date() };
    } else {
      // Add new provider
      const newProvider = {
        ...provider,
        id: provider.id || Date.now().toString(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.providers.push(newProvider);
    }
    return provider;
  }

  deleteProvider(id: string) {
    this.providers = this.providers.filter(provider => provider.id !== id);
    return true;
  }
}


export enum AIModelStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  EXPERIMENTAL = 'experimental',
}
export enum Modality {
  TEXT = 'text',
  PDF = 'pdf',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  // EMBEDDING = 'embedding',
  // EMBEDDED = 'embedded',
}
export interface AIModelEntity extends BaseEntity {
  /** AI プロバイダー種別 */
  provider: AIProviderType;

  /** プロバイダー内モデルの一意 ID */
  providerModelId: string;

  /** モデル名 */
  name: string;

  /** 略称 */
  shortName: string;

  /** スロットリングキー（流量制御のためのキー） */
  throttleKey: string;

  // /** モデルのバージョン */
  // version: string;

  /** モデルのステータス */
  status: AIModelStatus;

  /** モデルの説明 */
  description?: string | null;

  /** モデルの説明（詳細） */
  details?: string[] | null;

  /** 対応モダリティ一覧 */
  modalities: Modality[];

  /** 入力コンテキスト最大トークン数 */
  maxContextTokens: number;

  /** 出力最大トークン数 */
  maxOutputTokens: number;

  /** 入力フォーマット（nullable） */
  inputFormats?: Modality[] | null;

  /** 生成物のフォーマット（nullable） */
  outputFormats?: Modality[] | null;

  /** デフォルトパラメータ（任意の JSON） */
  defaultParameters?: Record<string, any> | null;

  /** モデルの機能情報 */
  capabilities?: Record<ModelCapability, any> | null;

  /** メタデータ */
  metadata?: Record<string, any> | null;

  /** エンドポイントのテンプレート URL */
  endpointTemplate?: string | null;

  /** ドキュメント URL */
  documentationUrl?: string | null;

  /** ライセンス種別 */
  licenseType?: string | null;

  /** ライセンス URL */
  licenseUrl?: string | null;

  /** ナレッジカットオフ */
  knowledgeCutoff?: Date | null;

  /** リリース日 */
  releaseDate?: Date | null;

  /** 廃止予定日 */
  deprecationDate?: Date | null;

  /** タグ一覧 */
  tags?: string[] | null;

  /** UI 上の並び順 */
  uiOrder?: number | null;

  /** ストリーミングフラグ */
  isStream?: boolean;

  /** 有効フラグ */
  isActive: boolean;
}

export interface AIModelEntityForView extends AIModelEntity {
  /** モデルの表示名 */
  aliases: string[];

  /** 価格履歴 */
  pricingHistory: ModelPricing[];

  uiOrder: number;
}

export type ModelCapability = 'text' | 'pdf' | 'image' | 'audio' | 'video' | 'tool' | 'embedding' | 'embedded';

@Injectable({ providedIn: 'root' })
export class AIModelManagerService {

  readonly http: HttpClient = inject(HttpClient);

  /** 一覧取得 */
  getAIModels(): Observable<AIModelEntityForView[]> {
    return this.http.get<AIModelEntityForView[]>(`/user/ai-models`).pipe(
      tap(res => res.sort((a, b) => {
        if (!a.releaseDate && !b.releaseDate) return 0;
        if (!a.releaseDate) return 1;
        if (!b.releaseDate) return -1;
        return new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime();
      })),
      tap(models => {
        models.forEach(model => {
          model.pricingHistory = model.pricingHistory.map(modelPricingFormat);
          model.knowledgeCutoff = model.knowledgeCutoff ? new Date(model.knowledgeCutoff) : null;
          model.releaseDate = model.releaseDate ? new Date(model.releaseDate) : null;
          model.deprecationDate = model.deprecationDate ? new Date(model.deprecationDate) : null;
          model.uiOrder = Number(model.uiOrder);
        });
        models.sort((a, b) => {
          if (!a.releaseDate && !b.releaseDate) return 0;
          if (!a.releaseDate) return 1;
          if (!b.releaseDate) return -1;
          return b.releaseDate.getTime() - a.releaseDate.getTime();
        })
      }),
    );
  }

  /** 単一取得 */
  getAIModel(id: string): Observable<AIModelEntityForView> {
    return this.http.get<AIModelEntityForView>(`/user/ai-model/${id}`);
  }

  /** 更新 */
  upsertAIModel(model: AIModelEntity): Observable<AIModelEntity> {
    return !model.id
      ? this.http.post<AIModelEntity>(`/maintainer/ai-model`, model)
      : this.http.put<AIModelEntity>(`/maintainer/ai-model/${model.id}`, model);
  }

  /** 削除 */
  deleteAIModel(id: string): Observable<void> {
    return this.http.delete<void>(`/maintainer/ai-model/${id}`);
  }
}

function modelPricingFormat(modelPricing: ModelPricing): ModelPricing {
  modelPricing.validFrom = new Date(modelPricing.validFrom);
  return modelPricing;
}

@Injectable({ providedIn: 'root' })
export class AIModelPricingService {

  readonly http: HttpClient = inject(HttpClient);

  getPricings(aiModelId: string): Observable<ModelPricing[]> {
    return this.http.get<ModelPricing[]>(`/user/ai-model/${aiModelId}/pricing`).pipe(
      map((pricings: ModelPricing[]) => pricings.map(modelPricingFormat)),
    );
  }

  upsertPricing(pricing: ModelPricing): Observable<ModelPricing> {
    return this.http.post<ModelPricing>(`/maintainer/ai-model/${pricing.modelId}/pricing`, pricing).pipe(
      map(modelPricingFormat),
    );
  }
  //   return (!pricing.id
  //     ? this.http.post<ModelPricing>(`/maintainer/ai-model/pricing`, pricing)
  //     : this.http.put<ModelPricing>(`/maintainer/ai-model/${pricing.id}/pricing`, pricing)).pipe(
  //       map(modelPricingFormat),
  //     );
  // }

  deletePricingByModelId(id: string): Observable<void> {
    return this.http.delete<void>(`/maintainer/ai-model/${id}`);
  }
}

// src/app/models/model-pricing.model.ts
export interface ModelPricing {
  id?: string;
  modelId: string;
  validFrom: Date;
  inputPricePerUnit: number;
  outputPricePerUnit: number;
  unit: string;
}
