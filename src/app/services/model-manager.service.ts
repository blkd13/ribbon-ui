import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable, of, tap } from 'rxjs';
import { BaseEntity } from '../models/project-models';
import { ChatCompletionCreateParamsWithoutMessages } from '../models/models';
import { UserRoleType } from '../models/models';

export enum AIProviderType {
  OPENAI = 'openai',
  AZURE_OPENAI = 'azure_openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  VERTEXAI = 'vertexai',
  ANTHROPIC_VERTEXAI = 'anthropic_vertexai',
  OPENAPI_VERTEXAI = 'openapi_vertexai',
  COHERE = 'cohere',
  GEMINI = 'gemini',
  OPENAI_COMPATIBLE = 'openai_compatible',

  GROQ = 'groq',
  MISTRAL = 'mistral',
  LOCAL = 'local',
  CEREBRAS = 'cerebras',
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

export interface ScopeInfoForView extends ScopeInfo {
  label: string;
}

export interface CredentialMetadata {
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  location?: string;
  credentials?: Record<string, any>;
  [key: string]: any;
}

export interface AIProviderTemplateEntity extends BaseEntity {
  provider: AIProviderType;
  scopeInfo: ScopeInfo;
  label: string;
  metadata?: CredentialMetadata;
  description?: string;
  templateDefinition?: TemplateDefinition;
  isActive: boolean;
}

export interface AIProviderEntity extends BaseEntity {
  type: AIProviderType;
  name: string;
  scopeInfo: ScopeInfo;
  label: string;
  description?: string;
  config: CredentialMetadata[]; // 複数ある時はラウンドロビン
  isActive: boolean;
}

// Service to handle AI Provider Entity operations
@Injectable({ providedIn: 'root' })
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

  getProviderTemplates() {
    return this.http.get<AIProviderTemplateEntity[]>(`/admin/ai-provider-templates`).pipe(
      tap(res => {
        res.forEach(provider => {
          provider.createdAt = new Date(provider.createdAt);
          provider.updatedAt = new Date(provider.updatedAt);
        });
        res.sort((a, b) => a.label.localeCompare(b.label));
        res.forEach(provider => {
          provider.scopeInfo = {
            scopeType: provider.scopeInfo.scopeType,
            scopeId: provider.scopeInfo.scopeId || '',
          };
          provider.metadata = provider.metadata || {};
          provider.isActive = provider.isActive ?? true;
        });
      }),
      tap(providers => {
        // this.providers = providers;
      }),
    );
  }

  upsertProviderTemplate(provider: AIProviderTemplateEntity) {
    this.http.post<AIProviderTemplateEntity>(`/admin/ai-provider-template`, provider).subscribe({
      next: (res) => {
        res.createdAt = new Date(res.createdAt);
        res.updatedAt = new Date(res.updatedAt);
        // this.providers.push(res);
      },
      error: (err) => {
        console.error('Error upserting provider:', err);
      }
    });
    return provider;
  }

  deleteProviderTemplate(id: string) {
    this.providers = this.providers.filter(provider => provider.id !== id);
    return true;
  }



  getProviders(includeOverridden: boolean = false): Observable<AIProviderEntity[]> {
    return this.http.get<AIProviderEntity[]>(`/admin/ai-providers?includeOverridden=${includeOverridden}`).pipe(
      tap(res => {
        res.forEach(provider => {
          provider.createdAt = new Date(provider.createdAt);
          provider.updatedAt = new Date(provider.updatedAt);
        });
        res.sort((a, b) => a.label.localeCompare(b.label));
        res.forEach(provider => {
          provider.scopeInfo = {
            scopeType: provider.scopeInfo.scopeType,
            scopeId: provider.scopeInfo.scopeId || '',
          };
          provider.config = provider.config || {};
          provider.isActive = provider.isActive ?? true;
        });
      }),
      tap(providers => {
        this.providers = providers;
      }),
    );
  }

  upsertProvider(provider: AIProviderEntity) {
    (provider.id
      ? this.http.put<AIProviderEntity>(`/admin/ai-provider/${provider.id}`, provider)
      : this.http.post<AIProviderEntity>(`/admin/ai-provider`, provider)
    ).subscribe({
      next: (res) => {
        res.createdAt = new Date(res.createdAt);
        res.updatedAt = new Date(res.updatedAt);
        this.providers.push(res);
      },
      error: (err) => {
        console.error('Error upserting provider:', err);
      }
    });
    return provider;
  }

  deleteProvider(id: string) {
    return this.http.delete<void>(`/admin/ai-provider/${id}`).pipe(
      tap(() => {
        console.log(`Provider with ID ${id} deleted successfully.`);
        this.providers = this.providers.filter(provider => provider.id !== id);
      }),
    );
  }
}

export interface RequiredField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  label: string;
  description?: string;
  placeholder?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

export interface OptionalField extends RequiredField {
  defaultValue?: any;
}

export interface TemplateDefinition {
  authType: 'API_KEY' | 'OAUTH2' | 'SERVICE_ACCOUNT';
  requiredFields: RequiredField[];
  optionalFields: OptionalField[];
  endpointTemplate?: string;
  documentationUrl?: string;
}

// export interface AIProviderTemplateEntity {
//   id: string;
//   orgKey: string;
//   provider: string;
//   label: string;
//   description?: string;
//   templateDefinition: TemplateDefinition;
//   isActive: boolean;
//   createdAt: Date;
//   updatedAt: Date;
//   createdBy: string;
//   updatedBy: string;
//   createdIp: string;
//   updatedIp: string;
// }

@Injectable({ providedIn: 'root' })
export class AIProviderTemplateManagerService {
  private apiUrl = `/admin/ai-provider-template`;

  constructor(private http: HttpClient) { }

  // Get all provider templates
  getProviderTemplates(filters?: {
    provider?: string;
    isActive?: boolean;
  }): Observable<AIProviderTemplateEntity[]> {
    let params: any = {};
    if (filters?.provider) params.provider = filters.provider;
    if (filters?.isActive !== undefined) params.isActive = filters.isActive;

    return this.http.get<AIProviderTemplateEntity[]>(`${this.apiUrl}s`, { params });
  }

  // Get single provider template
  getProviderTemplate(id: string): Observable<AIProviderTemplateEntity> {
    return this.http.get<AIProviderTemplateEntity>(`${this.apiUrl}/${id}`);
  }

  // Create or update provider template
  upsertProviderTemplate(template: Partial<AIProviderTemplateEntity>): Observable<AIProviderTemplateEntity> {
    if (template.id) {
      return this.http.put<AIProviderTemplateEntity>(`${this.apiUrl}/${template.id}`, template);
    } else {
      return this.http.post<AIProviderTemplateEntity>(this.apiUrl, template);
    }
  }

  // Delete provider template
  deleteProviderTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  // Validate template definition
  validateTemplateDefinition(definition: TemplateDefinition): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate required fields
    if (!definition.requiredFields || definition.requiredFields.length === 0) {
      errors.push('At least one required field must be defined');
    } else {
      definition.requiredFields.forEach((field, index) => {
        if (!field.name?.trim()) {
          errors.push(`Required field ${index + 1}: Field name is required`);
        }
        if (!field.label?.trim()) {
          errors.push(`Required field ${index + 1}: Display label is required`);
        }
        if (!field.type) {
          errors.push(`Required field ${index + 1}: Field type is required`);
        }
      });
    }

    // Validate optional fields
    definition.optionalFields?.forEach((field, index) => {
      if (field.name && !field.label?.trim()) {
        errors.push(`Optional field ${index + 1}: Display label is required when field name is specified`);
      }
    });

    // Check for duplicate field names
    const allFields = [...definition.requiredFields, ...(definition.optionalFields || [])];
    const fieldNames = allFields.map(f => f.name).filter(name => name?.trim());
    const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate field names: ${duplicates.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
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
  providerNameList: string[];

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

  /** スコープ情報 */
  scopeInfo: ScopeInfo;

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

  isGSearch: boolean;
}

export type ModelCapability = 'text' | 'pdf' | 'image' | 'audio' | 'video' | 'tool' | 'embedding' | 'embedded';

@Injectable({ providedIn: 'root' })
export class AIModelManagerService {

  readonly http: HttpClient = inject(HttpClient);
  readonly tagService: TagService = inject(TagService);

  /** AI モデルの一覧を取得するためのキャッシュ */
  private stockedModels: AIModelEntityForView[] = [];
  modelList: AIModelEntityForView[] = [];
  modelMap: Record<string, AIModelEntityForView> = {};

  /**
   * AIモデルのソートロジック（共通関数）
   * 優先順位: リリース日（新しい順） → uiOrder → 名前（アルファベット順）
   */
  sortModels<T extends Pick<AIModelEntity, 'releaseDate' | 'uiOrder' | 'name'>>(models: T[]): T[] {
    return models.sort((a, b) => {
      // First priority: Release date (newest first)
      if (!a.releaseDate && !b.releaseDate) {
        // Both have no release date, continue to uiOrder comparison
      } else if (!a.releaseDate) {
        return 1; // Models without release date go to the end
      } else if (!b.releaseDate) {
        return -1; // Models without release date go to the end
      } else {
        const dateComparison = b.releaseDate.getTime() - a.releaseDate.getTime();
        if (dateComparison !== 0) return dateComparison;
      }

      // Second priority: UI Order
      const aOrder = (a.uiOrder as number) || 0;
      const bOrder = (b.uiOrder as number) || 0;
      if (aOrder !== bOrder) return aOrder - bOrder;

      // Third priority: Name (alphabetical order)
      return a.name.localeCompare(b.name);
    });
  }

  /** 一覧取得 */
  getAIModels(includeOverridden: boolean = false, force: boolean = false): Observable<AIModelEntityForView[]> {
    if (this.stockedModels.length > 0 && !force) {
      return of(this.stockedModels);
    }
    return this.http.get<AIModelEntityForView[]>(`/user/ai-models?includeOverridden=${includeOverridden}`).pipe(
      tap(models => {
        this.stockedModels = models;
        this.modelList = models;
        this.modelMap = {};
        models.forEach(model => {
          this.modelMap[model.name] = model;
          model.aliases = model.aliases || [];
          model.pricingHistory = model.pricingHistory || [];
          model.pricingHistory = model.pricingHistory.map(modelPricingFormat);
          model.tags = model.tags || [];
          model.details = model.details || [];
          model.description = model.description || '';
          model.name = model.name || '';
          model.providerModelId = model.providerModelId || '';
          // Set up scopeInfo if not present
          model.scopeInfo = model.scopeInfo || {
            scopeType: ScopeType.GLOBAL,
            scopeId: 'system'
          };
          model.knowledgeCutoff = model.knowledgeCutoff ? new Date(model.knowledgeCutoff) : null;
          model.releaseDate = model.releaseDate ? new Date(model.releaseDate) : null;
          model.deprecationDate = model.deprecationDate ? new Date(model.deprecationDate) : null;
          model.uiOrder = Number(model.uiOrder) || 0;
          // TODO ここでGSearchのフラグを設定するのはおかしい。metaddataに設定するべき
          model.isGSearch = (model.name.startsWith('gemini') && !model.name.includes('flash-lite'));
          if (model.defaultParameters) {
            try {
              JSON.stringify(model.defaultParameters);
            } catch (e) {
              console.warn(`Invalid defaultParameters for ${model.providerModelId}`, e);
              model.defaultParameters = {};
            }
          }
        });
        // Use the common sort function
        this.sortModels(models);
      }),
    );
  }

  // /** 単一取得 */
  // getAIModel(id: string): Observable<AIModelEntityForView> {
  //   return this.http.get<AIModelEntityForView>(`/user/ai-model/${id}`);
  // }

  /** 更新 */
  upsertAIModel(model: AIModelEntity): Observable<AIModelEntity> {
    return (!model.id
      ? this.http.post<AIModelEntity>(`/admin/ai-model`, model)
      : this.http.put<AIModelEntity>(`/admin/ai-model/${model.id}`, model)).pipe(
        map(response => {
          // モデルのタグを更新
          this.tagService.refreshTags();
          return response;
        })
      );
  }

  /** 削除 */
  deleteAIModel(id: string): Observable<void> {
    return this.http.delete<void>(`/admin/ai-model/${id}`);
  }

  checkOkModels = new Set<string>();

  validateModelAttributes(argsList: ChatCompletionCreateParamsWithoutMessages[]): { isNotPdf?: string[], isNotDomestic?: string[], message: string } {
    const ret: { isNotPdf?: string[], isNotDomestic?: string[], message: string } = { message: '' };
    const modelMas = Object.fromEntries(this.modelList.map(model => [model.id, model]));

    argsList.forEach(args => {
      const model = args.model;
      // if (this.checkOkModels.has(model)) {
      //   // 既にアラート出したことのあるモデルは除外。
      //   return;
      // } else { }
      if (modelMas[model]) {
        // Check if the model is not a PDF
        if (!modelMas[model].modalities.includes(Modality.PDF)) {
          if (!ret.isNotPdf) {
            ret.isNotPdf = []; // Initialize the array if not already done
          } else { }
          ret.isNotPdf.push(model); // Add the model to isNotPdf
        } else { }

        // Check if the model is not domestic
        if (modelMas[model].tags?.includes('海外')) {
          if (!ret.isNotDomestic) {
            ret.isNotDomestic = []; // Initialize the array if not already done
          } else { }
          ret.isNotDomestic.push(model); // Add the model to isNotDomestic
        } else { }
        this.checkOkModels.add(model);
      } else { }
    });


    if (Object.keys(ret).length > 0) {
      let message = '';
      // if (ret.isNotDomestic) {
      //   const modelList = ret.isNotDomestic.map(model => `・${model}`).join('\n');
      //   message += `以下のモデルは海外リージョンを利用します。\n個人情報は絶対に入力しないでください。\n${modelList}\n\n`;
      // } else { }
      // if (ret.isNotPdf) {
      //   const modelList = ret.isNotPdf.map(model => `・${model}`).join('\n');
      //   message += `以下のモデルはPDF/Word/PowerPointが未対応です。\nもし入れた場合は無視されますのでご認識ください。\nテキスト（各種ソースコード等）、画像(png/jpg/etc...）は利用できます。\n${modelList}\n\n`;
      // } else { }
      ret.message = message;
    } else {
      // アラート不用
    }

    return ret; // Return the result object
    // return { message: '' }; // Placeholder return value
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
    return this.http.post<ModelPricing>(`/admin/ai-model/${pricing.modelId}/pricing`, pricing).pipe(
      map(modelPricingFormat),
    );
  }
  //   return (!pricing.id
  //     ? this.http.post<ModelPricing>(`/admin/ai-model/pricing`, pricing)
  //     : this.http.put<ModelPricing>(`/admin/ai-model/${pricing.id}/pricing`, pricing)).pipe(
  //       map(modelPricingFormat),
  //     );
  // }

  deletePricingByModelId(id: string): Observable<void> {
    return this.http.delete<void>(`/admin/ai-model/${id}`);
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


// =================================
// Tag Types & Interfaces
// =================================
export interface TagEntity extends BaseEntity {
  id: string;
  name: string;
  label?: string;
  description?: string;
  color?: string;
  category?: string; // タグのカテゴリ（オプション）
  sortOrder?: number;
  overrideOthers?: boolean;
  usageCount: number;
  isActive: boolean;
}

export interface TagCreateRequest {
  name: string;
  label?: string;
  description?: string;
  category?: string; // タグのカテゴリ（オプション）
  color?: string;
  isActive?: boolean;
  sortOrder?: number;
  overrideOthers?: boolean;
}

export interface TagUpdateRequest extends TagCreateRequest {
  // 更新用は同じフィールド
}

// =================================
// Tag Service
// =================================

@Injectable({ providedIn: 'root' })
export class TagService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `/admin/tag`;

  // タグ一覧のキャッシュ
  private tagsSubject = new BehaviorSubject<TagEntity[]>([]);
  public tags$ = this.tagsSubject.asObservable();

  /**
   * 全タグ一覧取得
   */
  getTags(includeOverridden: boolean = false): Observable<TagEntity[]> {
    return this.http.get<TagEntity[]>(`/user/tags?includeOverridden=${includeOverridden}`).pipe(
      tap(tags => this.tagsSubject.next(tags))
    );
  }

  /**
   * タグ作成
   */
  createTag(tag: TagCreateRequest): Observable<TagEntity> {
    return this.http.post<TagEntity>(this.baseUrl, tag).pipe(
      tap(() => this.refreshTags())
    );
  }

  /**
   * タグ更新
   */
  updateTag(id: string, tag: TagUpdateRequest): Observable<TagEntity> {
    return this.http.put<TagEntity>(`${this.baseUrl}/${id}`, tag).pipe(
      tap(() => this.refreshTags())
    );
  }

  /**
   * タグ削除
   */
  deleteTag(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => this.refreshTags())
    );
  }

  /**
   * タグ一覧を再取得してキャッシュを更新
   */
  refreshTags(): void {
    this.getTags().subscribe();
  }

  /**
   * 現在のタグ一覧を取得（同期）
   */
  getCurrentTags(): TagEntity[] {
    return this.tagsSubject.value;
  }

  /**
   * 名前でタグを検索
   */
  findTagByName(name: string): TagEntity | undefined {
    return this.getCurrentTags().find(tag => tag.name === name);
  }

  /**
   * 複数の名前でタグを検索
   */
  findTagsByNames(names: string[]): TagEntity[] {
    const currentTags = this.getCurrentTags();
    return names.map(name =>
      currentTags.find(tag => tag.name === name)
    ).filter(tag => tag !== undefined) as TagEntity[];
  }
}
