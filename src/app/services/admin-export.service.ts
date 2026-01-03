/**
 * Admin Export/Import Service
 * 管理者画面のデータをエクスポート/インポートするサービス
 */
import { Injectable, inject } from '@angular/core';
import { saveAs } from 'file-saver';
import {
  AIModelEntity,
  AIModelEntityForView,
  AIProviderEntity,
  ScopeInfo
} from './model-manager.service';

// エクスポートデータの形式
export interface ExportData {
  version: string;
  exportedAt: string;
  scopeInfo: ScopeInfo | null;
  data: {
    aiModels?: AIModelExportData[];
    aiProviders?: AIProviderExportData[];
  };
}

// エクスポート用のAIモデルデータ（IDを除外）
export interface AIModelExportData extends Omit<AIModelEntity, 'id' | 'createAt' | 'updateAt' | 'createBy' | 'updateBy'> {
  aliases?: string[];
  pricingHistory?: any[];
}

// エクスポート用のAIプロバイダーデータ（IDを除外）
export interface AIProviderExportData extends Omit<AIProviderEntity, 'id' | 'createAt' | 'updateAt' | 'createBy' | 'updateBy'> {
}

// インポート検証結果
export interface ImportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    modelsToAdd: number;
    modelsToUpdate: number;
    providersToAdd: number;
    providersToUpdate: number;
  };
}

// インポート結果
export interface ImportResult {
  success: boolean;
  modelsAdded: number;
  modelsUpdated: number;
  modelsFailed: number;
  providersAdded: number;
  providersUpdated: number;
  providersFailed: number;
  errors: string[];
}

@Injectable({ providedIn: 'root' })
export class AdminExportService {
  private readonly EXPORT_VERSION = '1.0';

  /**
   * AIモデルをエクスポート
   */
  exportModels(models: AIModelEntityForView[], scopeInfo: ScopeInfo | null): void {
    const exportData = this.createExportData(scopeInfo);
    exportData.data.aiModels = models.map(m => this.prepareModelForExport(m));
    this.downloadJson(exportData, 'ai-models');
  }

  /**
   * AIプロバイダーをエクスポート
   */
  exportProviders(providers: AIProviderEntity[], scopeInfo: ScopeInfo | null): void {
    const exportData = this.createExportData(scopeInfo);
    exportData.data.aiProviders = providers.map(p => this.prepareProviderForExport(p));
    this.downloadJson(exportData, 'ai-providers');
  }

  /**
   * 全データをエクスポート
   */
  exportAll(
    models: AIModelEntityForView[],
    providers: AIProviderEntity[],
    scopeInfo: ScopeInfo | null
  ): void {
    const exportData = this.createExportData(scopeInfo);
    exportData.data.aiModels = models.map(m => this.prepareModelForExport(m));
    exportData.data.aiProviders = providers.map(p => this.prepareProviderForExport(p));
    this.downloadJson(exportData, 'ai-config');
  }

  /**
   * ファイルをパースしてインポートデータを取得
   */
  async parseImportFile(file: File): Promise<ExportData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content) as ExportData;
          resolve(data);
        } catch (error) {
          reject(new Error('Invalid JSON format'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * インポートデータを検証
   */
  validateImportData(
    data: ExportData,
    existingModels: AIModelEntityForView[],
    existingProviders: AIProviderEntity[]
  ): ImportValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let modelsToAdd = 0;
    let modelsToUpdate = 0;
    let providersToAdd = 0;
    let providersToUpdate = 0;

    // バージョンチェック
    if (!data.version) {
      errors.push('Missing version information');
    }

    // データ構造チェック
    if (!data.data) {
      errors.push('Missing data field');
    }

    // モデルデータの検証
    if (data.data?.aiModels) {
      const existingModelNames = new Set(existingModels.map(m => m.providerModelId));

      for (const model of data.data.aiModels) {
        // 必須フィールドチェック
        if (!model.name) {
          errors.push(`Model missing required field: name`);
        }
        if (!model.providerModelId) {
          errors.push(`Model "${model.name}" missing required field: providerModelId`);
        }
        if (!model.providerNameList || model.providerNameList.length === 0) {
          errors.push(`Model "${model.name}" missing required field: providerNameList`);
        }

        // 既存データとの重複チェック
        if (existingModelNames.has(model.providerModelId)) {
          modelsToUpdate++;
          warnings.push(`Model "${model.name}" (${model.providerModelId}) will be updated`);
        } else {
          modelsToAdd++;
        }
      }
    }

    // プロバイダーデータの検証
    if (data.data?.aiProviders) {
      const existingProviderNames = new Set(existingProviders.map(p => p.name));

      for (const provider of data.data.aiProviders) {
        // 必須フィールドチェック
        if (!provider.name) {
          errors.push(`Provider missing required field: name`);
        }
        if (!provider.type) {
          errors.push(`Provider "${provider.name}" missing required field: type`);
        }

        // 既存データとの重複チェック
        if (existingProviderNames.has(provider.name)) {
          providersToUpdate++;
          warnings.push(`Provider "${provider.name}" will be updated`);
        } else {
          providersToAdd++;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        modelsToAdd,
        modelsToUpdate,
        providersToAdd,
        providersToUpdate
      }
    };
  }

  /**
   * エクスポートデータのベースを作成
   */
  private createExportData(scopeInfo: ScopeInfo | null): ExportData {
    return {
      version: this.EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      scopeInfo: scopeInfo,
      data: {}
    };
  }

  /**
   * モデルをエクスポート用に準備（IDなどを除外）
   */
  private prepareModelForExport(model: AIModelEntityForView): AIModelExportData {
    const { id, createAt, updateAt, createBy, updateBy, ...exportModel } = model as any;
    return exportModel;
  }

  /**
   * プロバイダーをエクスポート用に準備（IDなどを除外）
   */
  private prepareProviderForExport(provider: AIProviderEntity): AIProviderExportData {
    const { id, createAt, updateAt, createBy, updateBy, ...exportProvider } = provider as any;
    return exportProvider;
  }

  /**
   * JSONファイルをダウンロード
   */
  private downloadJson(data: ExportData, prefix: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${prefix}-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    saveAs(blob, filename);
  }

  /**
   * エクスポートデータからモデルリストを取得
   */
  getModelsFromExportData(data: ExportData): AIModelExportData[] {
    return data.data?.aiModels || [];
  }

  /**
   * エクスポートデータからプロバイダーリストを取得
   */
  getProvidersFromExportData(data: ExportData): AIProviderExportData[] {
    return data.data?.aiProviders || [];
  }
}
