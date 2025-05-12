import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
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

  // /** 入力フォーマット（nullable） */
  // inputFormats?: Modality[] | null;

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

export type ModelCapability = 'tool' | 'think' | 'embedding' | 'chat' | 'image' | 'audio' | 'video' | 'text' | 'embedding' | 'embedded';


@Injectable({ providedIn: 'root' })
export class AIModelManagerService {

  readonly http: HttpClient = inject(HttpClient);

  /** 一覧取得 */
  getAIModels(): Observable<AIModelEntityForView[]> {
    return this.http.get<AIModelEntityForView[]>(`/user/ai-models`);
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
