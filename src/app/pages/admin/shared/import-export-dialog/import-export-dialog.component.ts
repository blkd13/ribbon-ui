/**
 * Import/Export Dialog Component
 * AIモデル・プロバイダー設定のインポート/エクスポート用ダイアログ
 */
import { CommonModule } from '@angular/common';
import { Component, inject, Inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import {
  AdminExportService,
  ExportData,
  ImportValidationResult,
  AIModelExportData,
  AIProviderExportData
} from '../../../../services/admin-export.service';
import {
  AIModelEntityForView,
  AIModelManagerService,
  AIProviderEntity,
  AIProviderManagerService,
  ScopeInfo
} from '../../../../services/model-manager.service';

export type ImportExportDataType = 'models' | 'providers' | 'all';

export interface ImportExportDialogData {
  mode: 'export' | 'import' | 'both';
  dataType: ImportExportDataType;
  scopeInfo: ScopeInfo | null;
  models?: AIModelEntityForView[];
  providers?: AIProviderEntity[];
}

export interface ImportExportDialogResult {
  action: 'exported' | 'imported' | 'cancelled';
  importedModels?: number;
  importedProviders?: number;
}

@Component({
  selector: 'app-import-export-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatProgressBarModule,
    TranslateModule,
  ],
  templateUrl: './import-export-dialog.component.html',
  styleUrls: ['./import-export-dialog.component.scss']
})
export class ImportExportDialogComponent implements OnInit {
  private readonly exportService = inject(AdminExportService);
  private readonly modelService = inject(AIModelManagerService);
  private readonly providerService = inject(AIProviderManagerService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ImportExportDialogComponent>);

  // タブ制御
  selectedTabIndex = 0;

  // エクスポート設定
  exportModels = true;
  exportProviders = true;

  // インポート状態
  importFile: File | null = null;
  importData: ExportData | null = null;
  validationResult: ImportValidationResult | null = null;
  isValidating = false;
  isImporting = false;
  isDragOver = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ImportExportDialogData
  ) {}

  ngOnInit(): void {
    // モードに応じてタブを選択
    if (this.data.mode === 'import') {
      this.selectedTabIndex = 1;
    }
  }

  // ========== エクスポート ==========

  get canExport(): boolean {
    return this.exportModels || this.exportProviders;
  }

  get modelsCount(): number {
    return this.data.models?.length || 0;
  }

  get providersCount(): number {
    return this.data.providers?.length || 0;
  }

  onExport(): void {
    if (!this.canExport) return;

    const models = this.exportModels ? (this.data.models || []) : [];
    const providers = this.exportProviders ? (this.data.providers || []) : [];

    if (this.exportModels && this.exportProviders) {
      this.exportService.exportAll(models, providers, this.data.scopeInfo);
    } else if (this.exportModels) {
      this.exportService.exportModels(models, this.data.scopeInfo);
    } else if (this.exportProviders) {
      this.exportService.exportProviders(providers, this.data.scopeInfo);
    }

    this.snackBar.open('Export completed', 'Close', { duration: 3000 });
    this.dialogRef.close({ action: 'exported' } as ImportExportDialogResult);
  }

  // ========== インポート ==========

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      await this.processFile(files[0]);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      await this.processFile(input.files[0]);
    }
  }

  private async processFile(file: File): Promise<void> {
    if (!file.name.endsWith('.json')) {
      this.snackBar.open('Please select a JSON file', 'Close', { duration: 3000 });
      return;
    }

    this.importFile = file;
    this.isValidating = true;

    try {
      this.importData = await this.exportService.parseImportFile(file);
      this.validationResult = this.exportService.validateImportData(
        this.importData,
        this.data.models || [],
        this.data.providers || []
      );
    } catch (error: any) {
      this.snackBar.open(`Error parsing file: ${error.message}`, 'Close', { duration: 5000 });
      this.importFile = null;
      this.importData = null;
      this.validationResult = null;
    } finally {
      this.isValidating = false;
    }
  }

  clearImport(): void {
    this.importFile = null;
    this.importData = null;
    this.validationResult = null;
  }

  get canImport(): boolean {
    return this.validationResult?.isValid === true && !this.isImporting;
  }

  async onImport(): Promise<void> {
    if (!this.canImport || !this.importData) return;

    this.isImporting = true;
    let modelsImported = 0;
    let providersImported = 0;
    const errors: string[] = [];

    try {
      // プロバイダーのインポート（モデルより先に）
      const providers = this.exportService.getProvidersFromExportData(this.importData);
      for (const provider of providers) {
        try {
          const existingProvider = this.data.providers?.find(p => p.name === provider.name);
          const providerData = {
            ...provider,
            scopeInfo: this.data.scopeInfo || provider.scopeInfo,
          } as AIProviderEntity;

          if (existingProvider) {
            // 更新
            this.providerService.upsertProvider({ ...providerData, id: existingProvider.id });
          } else {
            // 新規作成
            this.providerService.upsertProvider(providerData);
          }
          providersImported++;
        } catch (error: any) {
          errors.push(`Provider "${provider.name}": ${error.message}`);
        }
      }

      // モデルのインポート
      const models = this.exportService.getModelsFromExportData(this.importData);
      for (const model of models) {
        try {
          const existingModel = this.data.models?.find(m => m.providerModelId === model.providerModelId);
          const modelData = {
            ...model,
            scopeInfo: this.data.scopeInfo || model.scopeInfo,
          } as any;

          if (existingModel) {
            // 更新
            await this.modelService.upsertAIModel({ ...modelData, id: existingModel.id }).toPromise();
          } else {
            // 新規作成
            await this.modelService.upsertAIModel(modelData).toPromise();
          }
          modelsImported++;
        } catch (error: any) {
          errors.push(`Model "${model.name}": ${error.message}`);
        }
      }

      if (errors.length > 0) {
        this.snackBar.open(
          `Import completed with errors: ${modelsImported} models, ${providersImported} providers`,
          'Close',
          { duration: 5000 }
        );
      } else {
        this.snackBar.open(
          `Import successful: ${modelsImported} models, ${providersImported} providers`,
          'Close',
          { duration: 3000 }
        );
      }

      this.dialogRef.close({
        action: 'imported',
        importedModels: modelsImported,
        importedProviders: providersImported
      } as ImportExportDialogResult);

    } catch (error: any) {
      this.snackBar.open(`Import failed: ${error.message}`, 'Close', { duration: 5000 });
    } finally {
      this.isImporting = false;
    }
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancelled' } as ImportExportDialogResult);
  }
}
