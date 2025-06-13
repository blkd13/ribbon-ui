import { Component, Inject, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AIModelEntity, AIModelManagerService } from '../../services/model-manager.service';
import { ModelSelectorComponent } from "../model-selector/model-selector.component";
import { ChatCompletionCreateParamsWithoutMessages } from '../../models/models';
import { MermaidValidatorService } from '../../services/mermaid-validator.service';

export interface MermaidFixDialogData {
    errors: Array<{ code: string; error: string; startIndex: number; endIndex: number }>;
}

export interface MermaidFixDialogResult {
    proceed: boolean;
    model?: string;
    customPrompt?: string;
}

@Component({
    selector: 'app-mermaid-fix-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        MatInputModule,
        MatIconModule,
        ModelSelectorComponent,
    ],
    template: `
    <h2 mat-dialog-title class="flex items-center gap-2">
      <mat-icon class="text-red-500">error_outline</mat-icon>
      Mermaid構文エラー検出
    </h2>
    <mat-dialog-content class="min-w-96">
      <div class="mb-4">
        <p class="mb-2">{{data.errors.length}}個のMermaidコードに構文エラーが見つかりました：</p>
        <div class="max-h-32 overflow-y-auto">
          @for(error of data.errors; track $index) {
            <div class="error-message mb-2">
              <div class="font-medium text-sm">エラー {{$index + 1}}:</div>
              <div class="text-xs">{{error.error}}</div>
            </div>
          }
        </div>
      </div>

      <div class="mb-4">
          <mat-label>修正に使用するAIモデル</mat-label>
          <app-model-selector name="model-select" [args]="args" (argsChange)="changeModel($event)"></app-model-selector>
      </div>

      <div class="mb-4">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>カスタムプロンプト（オプション）</mat-label>
          <textarea 
            matInput 
            [(ngModel)]="customPrompt" 
            placeholder="特定の修正指示がある場合は入力してください..."
            rows="3"
            class="resize-none">
          </textarea>
          <mat-hint>空欄の場合はデフォルトのプロンプトを使用します</mat-hint>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    
    <mat-dialog-actions class="flex gap-2 justify-end">
      <button mat-button (click)="onCancel()">キャンセル</button>
      <button 
        mat-raised-button 
        color="primary" 
        (click)="onFix()"
        [disabled]="!args.model">
        AI修正を実行
      </button>
    </mat-dialog-actions>
  `,
    styles: [`
    .error-message {
      background-color: #ffebee;
      color: #c62828;
      padding: 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 0.9em;
      border-left: 4px solid #f44336;
    }
    
    mat-dialog-content {
      max-height: 70vh;
      overflow-y: auto;
    }
    
    .resize-none {
      resize: none;
    }
  `]
})
export class MermaidFixDialogComponent {
    private readonly aiModelManager = inject(AIModelManagerService);
    private readonly mermaidValidatorService = inject(MermaidValidatorService);

    customPrompt: string = '';
    availableModels: AIModelEntity[] = [];
    args = {
        model: this.mermaidValidatorService.defaultModel,
    } as ChatCompletionCreateParamsWithoutMessages;

    constructor(
        public dialogRef: MatDialogRef<MermaidFixDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: MermaidFixDialogData
    ) {
        this.customPrompt = this.mermaidValidatorService.defaultSystemPrompt;
        this.loadAvailableModels();
    }
    private loadAvailableModels() {
        this.aiModelManager.getAIModels().subscribe(models => {
            this.availableModels = models.filter(model => model.isActive);
            // デフォルトで最初の利用可能なモデルを選択
            if (this.availableModels.length > 0 && !this.args.model) {
                this.args.model = this.availableModels[0].id;
            }
        });
    }

    changeModel(args: ChatCompletionCreateParamsWithoutMessages): void {
        this.args = args;
    }

    onCancel(): void {
        this.dialogRef.close({ proceed: false });
    }

    onFix(): void {
        const result: MermaidFixDialogResult = {
            proceed: true,
            model: this.args.model,
            customPrompt: this.customPrompt.trim() || undefined
        };
        this.dialogRef.close(result);
    }
}
