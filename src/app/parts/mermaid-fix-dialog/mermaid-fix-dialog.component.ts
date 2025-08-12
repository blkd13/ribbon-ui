import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ChatCompletionCreateParamsWithoutMessages } from '../../models/models';
import { MermaidValidatorService } from '../../services/mermaid-validator.service';
import { AIModelEntity, AIModelManagerService } from '../../services/model-manager.service';
import { BaseDialogComponent } from '../../shared/base/base-dialog.component';
import { ModelSelectorComponent } from "../model-selector/model-selector.component";

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
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule,
    ModelSelectorComponent,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title class="flex items-center gap-2">
      <mat-icon class="text-red-500">error_outline</mat-icon>
      {{ 'MERMAID_SYNTAX_ERROR_DETECTED' | translate }}
    </h2>
    <mat-dialog-content class="min-w-96">
      <div class="mb-4">
        <p class="mb-2">{{ 'MERMAID_ERRORS_FOUND' | translate: { count: data.errors.length } }}</p>
        <div class="max-h-32 overflow-y-auto">
          @for(error of data.errors; track $index) {
            <div class="error-message mb-2">
              <div class="font-medium text-sm">{{ 'ERROR_NUMBER' | translate: { number: $index + 1 } }}</div>
              <div class="text-xs">{{error.error}}</div>
            </div>
          }
        </div>
      </div>

      <form [formGroup]="form">
        <div class="mb-4">
          <mat-label>{{ 'AI_MODEL_FOR_CORRECTION' | translate }}</mat-label>
          <app-model-selector name="model-select" [args]="args" (argsChange)="changeModel($event)"></app-model-selector>
          @if (hasError('model')) {
            <div class="text-red-600 text-sm mt-1">{{ getErrorMessage('model') }}</div>
          }
        </div>

        <div class="mb-4">
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>{{ 'CUSTOM_PROMPT_OPTIONAL' | translate }}</mat-label>
            <textarea
              matInput
              formControlName="customPrompt"
              [placeholder]="'CUSTOM_PROMPT_PLACEHOLDER' | translate"
              rows="3"
              class="resize-none">
            </textarea>
            <mat-hint>{{ 'DEFAULT_PROMPT_HINT' | translate }}</mat-hint>
          </mat-form-field>
        </div>
      </form>

      @if (error) {
        <div class="mb-4 text-red-600 text-sm">
          {{ error }}
        </div>
      }
    </mat-dialog-content>
    
    <mat-dialog-actions class="flex gap-2 justify-end">
      <button mat-button (click)="onCancel()" [disabled]="isSaving">{{ 'CANCEL' | translate }}</button>
      <button
        mat-raised-button
        color="primary"
        (click)="onFix()"
        [disabled]="!args.model || isSaving">
        @if (isSaving) {
          {{ 'CORRECTION_IN_PROGRESS' | translate }}
        } @else {
          {{ 'EXECUTE_AI_CORRECTION' | translate }}
        }
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
export class MermaidFixDialogComponent extends BaseDialogComponent<MermaidFixDialogData, MermaidFixDialogResult> implements OnInit {
  private readonly aiModelManager = inject(AIModelManagerService);
  private readonly mermaidValidatorService = inject(MermaidValidatorService);
  readonly translate = inject(TranslateService);

  protected availableModels: AIModelEntity[] = [];
  protected args = {
    model: '',
  } as ChatCompletionCreateParamsWithoutMessages;

  // リアクティブフォーム
  protected readonly form = new FormGroup({
    model: new FormControl('', [Validators.required]),
    customPrompt: new FormControl(this.mermaidValidatorService.defaultSystemPrompt)
  });

  ngOnInit(): void {
    this.initializeComponent();
  }

  private async initializeComponent(): Promise<void> {
    try {
      this.setLoading(true);

      await this.executeAsync(async () => {
        const models = await this.aiModelManager.getAIModels().toPromise();
        this.availableModels = models?.filter(model => model.isActive) || [];

        // デフォルトモデルを設定
        const defaultModel = this.mermaidValidatorService.defaultModel;
        if (defaultModel && this.availableModels.find(m => m.name === defaultModel)) {
          this.args.model = defaultModel;
          this.form.patchValue({ model: defaultModel });
        } else if (this.availableModels.length > 0) {
          this.args.model = this.availableModels[0].name;
          this.form.patchValue({ model: this.availableModels[0].name });
        }

        return this.availableModels;
      }, undefined, this.translate.instant('FAILED_TO_LOAD_MODEL_LIST'));
    } finally {
      this.setLoading(false);
    }
  }

  protected changeModel(args: ChatCompletionCreateParamsWithoutMessages): void {
    this.args = args;
    this.form.patchValue({ model: args.model });
  }

  protected onCancel(): void {
    this.cancel();
  }

  protected async onFix(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    try {
      this.setSaving(true);

      const result: MermaidFixDialogResult = {
        proceed: true,
        model: this.args.model,
        customPrompt: this.form.value.customPrompt?.trim() || undefined
      };

      this.confirm(result);
    } finally {
      this.setSaving(false);
    }
  }

  private validateForm(): boolean {
    if (!this.args.model) {
      this.setError(this.translate.instant('PLEASE_SELECT_AI_MODEL'));
      return false;
    }

    this.clearError();
    return true;
  }

  // BaseDialogComponentのメソッドオーバーライド
  protected hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!(control?.invalid && control?.touched);
  }

  protected override getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control?.errors) return '';

    if (control.errors['required']) {
      if (controlName === 'model') {
        return this.translate.instant('AI_MODEL_SELECTION_REQUIRED');
      }
      return this.translate.instant('FIELD_IS_REQUIRED', { field: controlName });
    }
    return this.translate.instant('INPUT_ERROR_IN_FIELD', { field: controlName });
  }
}
