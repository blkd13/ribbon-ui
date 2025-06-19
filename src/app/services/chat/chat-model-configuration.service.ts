import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { BaseApiService } from '../../shared/base/base-api.service';
import { LlmModel, ChatModelSettings } from './chat-types';
import { ErrorHandlerUtil } from '../../shared/utils/error-handler.util';
import { environment } from '../../../environments/environment';

export interface ModelValidationResult {
  isNotPdf?: string[];
  isNotDomestic?: string[];
  message: string;
}

/**
 * チャットモデル設定・管理サービス
 * AIモデルの設定、バリデーション、設定管理を担当
 */
@Injectable({ providedIn: 'root' })
export class ChatModelConfigurationService extends BaseApiService<LlmModel> {
  protected baseUrl = `${environment.apiUrl}/models`;
  protected entityName = 'AIモデル';

  private modelsSubject = new BehaviorSubject<LlmModel[]>([]);
  private selectedModelSubject = new BehaviorSubject<string>('');
  private modelSettingsSubject = new BehaviorSubject<ChatModelSettings>({
    modelId: '',
    temperature: 0.7,
    maxTokens: 4096
  });

  // チェック済みモデル（警告表示制御用）
  private checkedModels = new Set<string>();

  // Observable streams
  public models$ = this.modelsSubject.asObservable();
  public selectedModel$ = this.selectedModelSubject.asObservable();
  public modelSettings$ = this.modelSettingsSubject.asObservable();

  /**
   * 利用可能なモデル一覧を取得
   * @param force キャッシュを無視して強制取得
   * @returns モデル一覧
   */
  getAvailableModels(force = false): Observable<LlmModel[]> {
    return this.getAll(force).pipe(
      map(models => {
        this.modelsSubject.next(models);
        return models;
      }),
      catchError(error => {
        const errorInfo = ErrorHandlerUtil.handleHttpError(error, 'モデル一覧の取得');
        console.error(errorInfo);
        return of([]);
      })
    );
  }

  /**
   * 有効なモデルのみを取得
   * @returns 有効なモデル一覧
   */
  getEnabledModels(): Observable<LlmModel[]> {
    return this.models$.pipe(
      map(models => models.filter(model => model.isEnable))
    );
  }

  /**
   * タグ別にモデルをグループ化
   * @returns タグ別モデルマップ
   */
  getModelsByTag(): Observable<{ [tag: string]: LlmModel[] }> {
    return this.models$.pipe(
      map(models => {
        const groupedModels: { [tag: string]: LlmModel[] } = {};
        models.forEach(model => {
          if (!groupedModels[model.tag]) {
            groupedModels[model.tag] = [];
          }
          groupedModels[model.tag].push(model);
        });
        return groupedModels;
      })
    );
  }

  /**
   * クラス別にモデルをグループ化
   * @returns クラス別モデルマップ
   */
  getModelsByClass(): Observable<{ [className: string]: LlmModel[] }> {
    return this.models$.pipe(
      map(models => {
        const groupedModels: { [className: string]: LlmModel[] } = {};
        models.forEach(model => {
          if (!groupedModels[model.class]) {
            groupedModels[model.class] = [];
          }
          groupedModels[model.class].push(model);
        });
        return groupedModels;
      })
    );
  }

  /**
   * 指定されたモデルIDでモデルを取得
   * @param modelId モデルID
   * @returns モデル情報
   */
  getModelById(modelId: string): Observable<LlmModel | null> {
    return this.models$.pipe(
      map(models => models.find(model => model.id === modelId) || null)
    );
  }

  /**
   * 選択中のモデルを設定
   * @param modelId モデルID
   */
  setSelectedModel(modelId: string): void {
    this.selectedModelSubject.next(modelId);
    
    // モデル設定も同時に更新
    const currentSettings = this.modelSettingsSubject.value;
    this.modelSettingsSubject.next({
      ...currentSettings,
      modelId
    });
  }

  /**
   * 現在選択中のモデルを取得
   * @returns モデルID
   */
  getSelectedModel(): string {
    return this.selectedModelSubject.value;
  }

  /**
   * モデル設定を更新
   * @param settings モデル設定
   */
  updateModelSettings(settings: Partial<ChatModelSettings>): void {
    const currentSettings = this.modelSettingsSubject.value;
    const newSettings = { ...currentSettings, ...settings };
    this.modelSettingsSubject.next(newSettings);
  }

  /**
   * 現在のモデル設定を取得
   * @returns モデル設定
   */
  getCurrentModelSettings(): ChatModelSettings {
    return { ...this.modelSettingsSubject.value };
  }

  /**
   * モデルの属性をバリデーション
   * @param modelIds バリデーション対象のモデルID配列
   * @returns バリデーション結果
   */
  validateModelAttributes(modelIds: string[]): Observable<ModelValidationResult> {
    return this.models$.pipe(
      map(models => {
        const modelMap = Object.fromEntries(models.map(model => [model.id, model]));
        const result: ModelValidationResult = { message: '' };

        const newModelIds = modelIds.filter(id => !this.checkedModels.has(id));
        
        if (newModelIds.length === 0) {
          return result; // 全て既にチェック済み
        }

        newModelIds.forEach(modelId => {
          const model = modelMap[modelId];
          if (!model) return;

          // PDF未対応チェック
          if (!model.isPdf) {
            if (!result.isNotPdf) {
              result.isNotPdf = [];
            }
            result.isNotPdf.push(model.label || modelId);
          }

          // 海外モデルチェック
          if (!model.isDomestic) {
            if (!result.isNotDomestic) {
              result.isNotDomestic = [];
            }
            result.isNotDomestic.push(model.label || modelId);
          }

          // チェック済みとしてマーク
          this.checkedModels.add(modelId);
        });

        // メッセージ構築
        let message = '';
        if (result.isNotDomestic?.length) {
          const modelList = result.isNotDomestic.map(model => `・${model}`).join('\n');
          message += `以下のモデルは海外リージョンを利用します。\n個人情報は絶対に入力しないでください。\n${modelList}\n\n`;
        }
        if (result.isNotPdf?.length) {
          const modelList = result.isNotPdf.map(model => `・${model}`).join('\n');
          message += `以下のモデルはPDF/Word/PowerPointが未対応です。\nもし入れた場合は無視されますのでご認識ください。\nテキスト（各種ソースコード等）、画像(png/jpg/etc...)は利用できます。\n${modelList}\n\n`;
        }
        result.message = message;

        return result;
      })
    );
  }

  /**
   * モデルの推定コストを計算
   * @param modelId モデルID
   * @param inputTokens 入力トークン数
   * @param outputTokens 出力トークン数
   * @returns 推定コスト
   */
  calculateEstimatedCost(modelId: string, inputTokens: number, outputTokens: number): Observable<number> {
    return this.getModelById(modelId).pipe(
      map(model => {
        if (!model || !model.price || model.price.length < 2) {
          return 0;
        }

        const [inputPrice, outputPrice] = model.price;
        const inputCost = (inputTokens / 1000) * inputPrice;
        const outputCost = (outputTokens / 1000) * outputPrice;
        
        return inputCost + outputCost;
      })
    );
  }

  /**
   * モデルの最大トークン数制限をチェック
   * @param modelId モデルID
   * @param inputLength 入力長
   * @param requestedTokens 要求トークン数
   * @returns 制限チェック結果
   */
  checkTokenLimits(modelId: string, inputLength: number, requestedTokens: number): Observable<{
    isValid: boolean;
    maxInputTokens: number;
    maxOutputTokens: number;
    inputExceeded: boolean;
    outputExceeded: boolean;
    suggestions?: string[];
  }> {
    return this.getModelById(modelId).pipe(
      map(model => {
        if (!model) {
          return {
            isValid: false,
            maxInputTokens: 0,
            maxOutputTokens: 0,
            inputExceeded: true,
            outputExceeded: true
          };
        }

        const inputExceeded = inputLength > model.maxInputTokens;
        const outputExceeded = requestedTokens > model.maxTokens;
        const isValid = !inputExceeded && !outputExceeded;

        const suggestions: string[] = [];
        if (inputExceeded) {
          suggestions.push(`入力を${model.maxInputTokens}トークン以下に削減してください`);
        }
        if (outputExceeded) {
          suggestions.push(`出力トークン数を${model.maxTokens}以下に設定してください`);
        }

        return {
          isValid,
          maxInputTokens: model.maxInputTokens,
          maxOutputTokens: model.maxTokens,
          inputExceeded,
          outputExceeded,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        };
      })
    );
  }

  /**
   * 互換性のあるモデルを検索
   * @param requirements 要件
   * @returns 互換モデル一覧
   */
  findCompatibleModels(requirements: {
    minInputTokens?: number;
    minOutputTokens?: number;
    supportsPdf?: boolean;
    isDomestic?: boolean;
    supportsGSearch?: boolean;
    maxPrice?: number;
  }): Observable<LlmModel[]> {
    return this.getEnabledModels().pipe(
      map(models => {
        return models.filter(model => {
          if (requirements.minInputTokens && model.maxInputTokens < requirements.minInputTokens) {
            return false;
          }
          if (requirements.minOutputTokens && model.maxTokens < requirements.minOutputTokens) {
            return false;
          }
          if (requirements.supportsPdf !== undefined && model.isPdf !== requirements.supportsPdf) {
            return false;
          }
          if (requirements.isDomestic !== undefined && model.isDomestic !== requirements.isDomestic) {
            return false;
          }
          if (requirements.supportsGSearch !== undefined && model.isGSearch !== requirements.supportsGSearch) {
            return false;
          }
          if (requirements.maxPrice && model.price && model.price[0] > requirements.maxPrice) {
            return false;
          }
          return true;
        });
      })
    );
  }

  /**
   * デフォルトモデルを取得
   * @returns デフォルトモデルID
   */
  getDefaultModel(): Observable<string> {
    return this.getEnabledModels().pipe(
      map(models => {
        // 優先順位: 賢いタグ > 普通タグ > その他
        const priorityOrder = ['賢い', '普通', '速い', '思考'];
        
        for (const tag of priorityOrder) {
          const tagModels = models.filter(model => model.tag === tag);
          if (tagModels.length > 0) {
            return tagModels[0].id;
          }
        }
        
        return models.length > 0 ? models[0].id : '';
      })
    );
  }

  /**
   * モデル設定をリセット
   */
  resetModelSettings(): void {
    this.modelSettingsSubject.next({
      modelId: '',
      temperature: 0.7,
      maxTokens: 4096
    });
    this.selectedModelSubject.next('');
  }

  /**
   * チェック済みモデルキャッシュをクリア
   */
  clearCheckedModelsCache(): void {
    this.checkedModels.clear();
  }

  /**
   * モデル情報をローカルキャッシュから取得
   * @returns キャッシュされたモデル一覧
   */
  getCachedModels(): LlmModel[] {
    return this.modelsSubject.value;
  }

  /**
   * 特定の機能をサポートするモデルを取得
   * @param feature 機能名
   * @returns サポートするモデル一覧
   */
  getModelsSupportingFeature(feature: 'pdf' | 'gsearch' | 'domestic'): Observable<LlmModel[]> {
    return this.getEnabledModels().pipe(
      map(models => {
        switch (feature) {
          case 'pdf':
            return models.filter(model => model.isPdf);
          case 'gsearch':
            return models.filter(model => model.isGSearch);
          case 'domestic':
            return models.filter(model => model.isDomestic);
          default:
            return models;
        }
      })
    );
  }

  /**
   * モデルの詳細情報を取得（説明、制限事項等）
   * @param modelId モデルID
   * @returns モデル詳細情報
   */
  getModelDetails(modelId: string): Observable<{
    model: LlmModel;
    features: string[];
    limitations: string[];
    recommendations: string[];
  } | null> {
    return this.getModelById(modelId).pipe(
      map(model => {
        if (!model) return null;

        const features: string[] = [];
        const limitations: string[] = [];
        const recommendations: string[] = [];

        // 機能
        if (model.isPdf) features.push('PDF/Word/PowerPoint対応');
        if (model.isGSearch) features.push('Google検索機能');
        if (model.isDomestic) features.push('国内リージョン');

        // 制限事項
        if (!model.isPdf) limitations.push('ファイルアップロード未対応');
        if (!model.isDomestic) limitations.push('海外リージョン（個人情報注意）');
        if (model.maxInputTokens < 50000) limitations.push('入力トークン数制限が厳しい');

        // 推奨用途
        if (model.tag === '賢い') recommendations.push('複雑な推論や分析作業');
        if (model.tag === '速い' || model.tag === '爆速') recommendations.push('簡単な質問や下書き作成');
        if (model.tag === '思考') recommendations.push('論理的思考が必要な作業');
        if (model.isGSearch) recommendations.push('最新情報が必要な質問');

        return {
          model,
          features,
          limitations,
          recommendations
        };
      })
    );
  }
}