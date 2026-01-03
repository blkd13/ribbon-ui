import { Component, Inject, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ContextHubService } from '../../../services/context-hub.service';
import {
  ContextResourceForView,
  ContextResourceCreateDto,
  ContextResourceUpdateDto,
  MattermostResourceConfig,
} from '../../../models/context-hub.models';
import { UUID } from '../../../models/project-models';

import { MattermostChannelSelectorComponent, MattermostSelection } from './mattermost-channel-selector.component';

export interface MattermostWizardData {
  mode: 'create' | 'edit';
  contextHubId?: UUID;
  providerName?: string;
  resource?: ContextResourceForView;
}

@Component({
  selector: 'app-mattermost-resource-wizard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MattermostChannelSelectorComponent,
  ],
  template: `
    <div class="wizard-container">
      <!-- Header（プログレスインジケーター統合） -->
      <div class="wizard-header">
        <div class="wizard-title">
          <div class="wizard-title-icon">💬</div>
          <span>Mattermost リソース{{ data.mode === 'create' ? '追加' : '編集' }}</span>
        </div>
        <!-- インラインプログレス -->
        <div class="wizard-progress">
          <div class="progress-step" [class.active]="currentStep === 1" [class.completed]="currentStep > 1">
            <div class="step-number">{{ currentStep > 1 ? '✓' : '1' }}</div>
            <div class="step-label">選択</div>
          </div>
          <div class="progress-line" [class.completed]="currentStep > 1"></div>
          <div class="progress-step" [class.active]="currentStep === 2">
            <div class="step-number">2</div>
            <div class="step-label">設定</div>
          </div>
        </div>
        <button class="wizard-close" mat-dialog-close>&times;</button>
      </div>

      <!-- Body -->
      <div class="wizard-body">
        <!-- Step 1: ソース選択 -->
        @if (currentStep === 1) {
          <div class="step-content step-1">
            <app-mattermost-channel-selector
              [providerName]="providerName"
              [initialSelection]="initialSelection"
              (selectionChanged)="onSelectionChanged($event)">
            </app-mattermost-channel-selector>
          </div>
        }

        <!-- Step 2: 詳細設定 -->
        @if (currentStep === 2) {
          <div class="step-content step-2">
            <!-- 選択サマリ -->
            <div class="selection-summary">
              <div class="summary-icon">
                <mat-icon>{{ selection?.sourceType === 'timeline' ? 'view_timeline' : 'tag' }}</mat-icon>
              </div>
              <div class="summary-content">
                <div class="summary-label">選択中のソース</div>
                <div class="summary-value">
                  @if (selection?.sourceType === 'timeline') {
                    {{ selection?.timelineName }}
                  } @else {
                    {{ selection?.channelNames?.join(', ') }}
                    <span class="summary-count">({{ selection?.channelNames?.length || 0 }}チャンネル)</span>
                  }
                </div>
              </div>
              <button type="button" class="btn-change" (click)="goToStep(1)">
                <mat-icon>edit</mat-icon> 変更
              </button>
            </div>

            <!-- 設定フォーム -->
            <form [formGroup]="form" class="settings-form">
              <div class="form-row">
                <div class="form-group flex-1">
                  <label class="form-label">リソース名<span class="required">*</span></label>
                  <input type="text" class="form-input" formControlName="label"
                         placeholder="例: 開発チームの会話">
                </div>
                <div class="form-group flex-2">
                  <label class="form-label">説明</label>
                  <input type="text" class="form-input" formControlName="description"
                         placeholder="このリソースの説明を入力...">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">取得期間</label>
                <div class="period-chips">
                  @for (period of periodOptions; track period.value) {
                    <button type="button" class="period-chip"
                            [class.selected]="form.get('periodDays')?.value === period.value"
                            (click)="selectPeriod(period.value)">
                      {{ period.label }}
                    </button>
                  }
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">キーワードフィルター</label>
                <div class="tags-input-container">
                  @for (tag of keywordTags; track tag) {
                    <span class="tag">
                      {{ tag }}
                      <span class="tag-remove" (click)="removeKeywordTag(tag)">&times;</span>
                    </span>
                  }
                  <input type="text" class="tags-input"
                         placeholder="キーワードを入力してEnter..."
                         (keydown.enter)="addKeywordTag($event)">
                </div>
                <div class="form-hint">指定したキーワードを含むメッセージのみを取得</div>
              </div>

              <!-- 詳細オプション -->
              <div class="advanced-section">
                <button type="button" class="advanced-toggle" (click)="showAdvanced = !showAdvanced">
                  <mat-icon>{{ showAdvanced ? 'expand_less' : 'expand_more' }}</mat-icon>
                  詳細オプション
                </button>

                @if (showAdvanced) {
                  <div class="advanced-options">
                    <div class="form-group">
                      <label class="form-label">メッセージタイプ</label>
                      <div class="checkbox-row">
                        <label class="checkbox-item">
                          <input type="checkbox" formControlName="includeNormal"> 通常
                        </label>
                        <label class="checkbox-item">
                          <input type="checkbox" formControlName="includeThreads"> スレッド
                        </label>
                        <label class="checkbox-item">
                          <input type="checkbox" formControlName="includeSystem"> システム
                        </label>
                        <label class="checkbox-item">
                          <input type="checkbox" formControlName="includeAttachments"> 添付あり
                        </label>
                      </div>
                    </div>

                    <div class="form-row">
                      <div class="form-group">
                        <label class="form-label">最大取得件数</label>
                        <input type="number" class="form-input" formControlName="maxMessages"
                               min="1" max="10000" style="max-width: 150px;">
                      </div>
                      <div class="form-group">
                        <label class="form-label">ユーザーフィルター</label>
                        <input type="text" class="form-input" formControlName="userFilter"
                               placeholder="@username">
                      </div>
                    </div>
                  </div>
                }
              </div>
            </form>
          </div>
        }
      </div>

      <!-- Footer -->
      <div class="wizard-footer">
        @if (currentStep === 1) {
          <button type="button" class="btn btn-secondary" mat-dialog-close>キャンセル</button>
          <button type="button" class="btn btn-primary" [disabled]="!canProceedStep1()" (click)="goToStep(2)">
            次へ <mat-icon>arrow_forward</mat-icon>
          </button>
        } @else {
          <button type="button" class="btn btn-secondary" (click)="goToStep(1)">
            <mat-icon>arrow_back</mat-icon> 戻る
          </button>
          <button type="button" class="btn btn-primary" [disabled]="!form.valid || isSaving" (click)="save()">
            @if (isSaving) {
              <mat-spinner diameter="18"></mat-spinner>
            } @else {
              {{ data.mode === 'create' ? '登録' : '保存' }}
            }
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      --primary-color: #1a73e8;
      --primary-dark: #1557b0;
      --bg-dark: #1e2128;
      --bg-card: #282c34;
      --bg-input: #3a3f4a;
      --text-primary: #ffffff;
      --text-secondary: #8b929a;
      --text-muted: #666;
      --border-color: #3a3f4a;
      --error-color: #ea4335;
      --success-color: #34a853;
    }

    .wizard-container {
      display: flex;
      flex-direction: column;
      width: 1000px;
      max-width: 95vw;
      height: calc(100vh - 80px);
      max-height: 800px;
      background-color: var(--bg-card);
      color: var(--text-primary);
      border-radius: 12px;
      overflow: hidden;
    }

    /* Header（プログレス統合） */
    .wizard-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .wizard-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
    }

    .wizard-title-icon {
      width: 26px;
      height: 26px;
      background: #0058cc;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }

    .wizard-close {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 6px;
      font-size: 18px;
      transition: all 0.2s;

      &:hover {
        background-color: var(--bg-input);
        color: var(--text-primary);
      }
    }

    /* Progress - ヘッダー内インライン */
    .wizard-progress {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      padding: 0;
    }

    .progress-step {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 12px;
      transition: all 0.2s;

      &.active {
        background: rgba(26, 115, 232, 0.15);

        .step-number {
          background: var(--primary-color);
          color: white;
        }

        .step-label {
          color: var(--primary-color);
          font-weight: 600;
        }
      }

      &.completed {
        .step-number {
          background: var(--success-color);
          color: white;
        }
      }
    }

    .step-number {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--bg-input);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .step-label {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .progress-line {
      width: 24px;
      height: 2px;
      background: var(--bg-input);
      margin: 0 4px;

      &.completed {
        background: var(--success-color);
      }
    }

    /* Body */
    .wizard-body {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .step-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .step-1 {
      padding: 12px 20px;
      overflow: hidden;

      app-mattermost-channel-selector {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
    }

    .step-2 {
      padding: 24px;
      overflow-y: auto;
    }

    /* Selection Summary */
    .selection-summary {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: rgba(26, 115, 232, 0.1);
      border: 1px solid rgba(26, 115, 232, 0.3);
      border-radius: 10px;
      margin-bottom: 24px;
    }

    .summary-icon {
      width: 44px;
      height: 44px;
      background: var(--primary-color);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon { color: white; font-size: 22px; width: 22px; height: 22px; }
    }

    .summary-content {
      flex: 1;
    }

    .summary-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 2px;
    }

    .summary-value {
      font-size: 15px;
      font-weight: 500;
    }

    .summary-count {
      color: var(--text-secondary);
      font-weight: 400;
      margin-left: 4px;
    }

    .btn-change {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;

      mat-icon { font-size: 16px; width: 16px; height: 16px; }

      &:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }
    }

    /* Form */
    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .form-row {
      display: flex;
      gap: 16px;

      .flex-1 { flex: 1; }
      .flex-2 { flex: 2; }
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);

      .required {
        color: var(--error-color);
        margin-left: 2px;
      }
    }

    .form-input {
      padding: 12px 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      transition: border-color 0.2s;

      &:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      &::placeholder {
        color: var(--text-muted);
      }
    }

    .form-hint {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Period Chips */
    .period-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .period-chip {
      padding: 8px 16px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--primary-color);
        color: var(--text-primary);
      }

      &.selected {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: white;
      }
    }

    /* Tags */
    .tags-input-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      min-height: 48px;
      align-items: center;

      &:focus-within {
        border-color: var(--primary-color);
      }
    }

    .tag {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--primary-color);
      border-radius: 14px;
      font-size: 12px;
    }

    .tag-remove {
      cursor: pointer;
      opacity: 0.7;
      font-size: 14px;

      &:hover { opacity: 1; }
    }

    .tags-input {
      flex: 1;
      min-width: 120px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      outline: none;
      font-size: 14px;

      &::placeholder { color: var(--text-muted); }
    }

    /* Advanced */
    .advanced-section {
      margin-top: 8px;
    }

    .advanced-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 0;
      background: none;
      border: none;
      color: var(--primary-color);
      font-size: 14px;
      cursor: pointer;

      mat-icon { font-size: 20px; width: 20px; height: 20px; }

      &:hover { text-decoration: underline; }
    }

    .advanced-options {
      padding: 16px;
      background: rgba(26, 115, 232, 0.05);
      border-radius: 8px;
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .checkbox-row {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }

    .checkbox-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      cursor: pointer;

      input {
        accent-color: var(--primary-color);
        width: 16px;
        height: 16px;
      }
    }

    /* Footer */
    .wizard-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }

    .btn-secondary {
      background: var(--bg-input);
      color: var(--text-primary);

      &:hover { background: #4a4f5a; }
    }

    .btn-primary {
      background: var(--primary-color);
      color: white;

      &:hover:not(:disabled) { background: var(--primary-dark); }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }

    @media (max-width: 768px) {
      .wizard-container {
        width: 100vw;
        height: 100vh;
        max-height: none;
        border-radius: 0;
      }

      .form-row {
        flex-direction: column;
      }
    }
  `]
})
export class MattermostResourceWizardComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly contextHubService = inject(ContextHubService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<MattermostResourceWizardComponent>);

  private destroy$ = new Subject<void>();

  currentStep = 1;
  form!: FormGroup;
  isSaving = false;
  showAdvanced = false;

  providerName: string;
  selection: MattermostSelection | null = null;
  initialSelection?: MattermostSelection;
  keywordTags: string[] = [];

  periodOptions = [
    { value: 1, label: '今日' },
    { value: 7, label: '今週' },
    { value: 30, label: '今月' },
    { value: 90, label: '今四半期' },
    { value: 365, label: '今年' },
    { value: 0, label: '全期間' },
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public data: MattermostWizardData) {
    this.providerName = data.providerName || '';
  }

  ngOnInit(): void {
    this.initForm();

    if (this.data.mode === 'edit' && this.data.resource) {
      this.populateFromResource(this.data.resource);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.form = this.fb.group({
      label: ['', Validators.required],
      description: [''],
      periodDays: [30],
      includeNormal: [true],
      includeThreads: [true],
      includeSystem: [false],
      includeAttachments: [true],
      maxMessages: [1000],
      userFilter: [''],
    });
  }

  private populateFromResource(resource: ContextResourceForView): void {
    const config = resource.config as MattermostResourceConfig;

    this.form.patchValue({
      label: resource.label,
      description: resource.description || '',
      periodDays: config.periodDays || 30,
    });

    this.initialSelection = {
      sourceType: config.sourceType,
      teamId: config.teamId || '',
      teamName: '',
      channelIds: config.channelIds,
      timelineId: config.timelineId,
    };

    this.selection = this.initialSelection;
  }

  onSelectionChanged(selection: MattermostSelection): void {
    this.selection = selection;

    // 自動でラベルを設定
    if (!this.form.get('label')?.value) {
      if (selection.sourceType === 'timeline' && selection.timelineName) {
        this.form.patchValue({ label: selection.timelineName });
      } else if (selection.channelNames && selection.channelNames.length > 0) {
        const label = selection.channelNames.length <= 3
          ? selection.channelNames.join(', ')
          : `${selection.channelNames.slice(0, 3).join(', ')} 他${selection.channelNames.length - 3}件`;
        this.form.patchValue({ label });
      }
    }
  }

  canProceedStep1(): boolean {
    if (!this.selection) return false;
    if (this.selection.sourceType === 'channel') {
      return (this.selection.channelIds?.length || 0) > 0;
    } else {
      return !!this.selection.timelineId;
    }
  }

  goToStep(step: number): void {
    this.currentStep = step;
  }

  selectPeriod(days: number): void {
    this.form.patchValue({ periodDays: days });
  }

  addKeywordTag(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (value && !this.keywordTags.includes(value)) {
      this.keywordTags.push(value);
      input.value = '';
    }
    event.preventDefault();
  }

  removeKeywordTag(tag: string): void {
    this.keywordTags = this.keywordTags.filter(t => t !== tag);
  }

  save(): void {
    if (!this.form.valid || !this.selection) return;

    this.isSaving = true;
    const formValue = this.form.value;

    const config: MattermostResourceConfig = {
      sourceType: this.selection.sourceType,
      teamId: this.selection.teamId,
      channelIds: this.selection.sourceType === 'channel' ? this.selection.channelIds : undefined,
      timelineId: this.selection.sourceType === 'timeline' ? this.selection.timelineId : undefined,
      rangeType: 'period',
      periodDays: formValue.periodDays || 30,
      keywords: this.keywordTags.length > 0 ? this.keywordTags : undefined,
    };

    if (this.data.mode === 'create') {
      const dto: ContextResourceCreateDto = {
        contextHubId: this.data.contextHubId!,
        providerType: 'mattermost',
        providerName: this.providerName,
        label: formValue.label,
        description: formValue.description || undefined,
        config,
      };

      this.contextHubService.addResource(dto)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('リソースを追加しました', '閉じる', { duration: 2000 });
            this.dialogRef.close(true);
          },
          error: err => {
            console.error('Failed to create resource:', err);
            this.snackBar.open('追加に失敗しました', '閉じる', { duration: 3000 });
            this.isSaving = false;
          }
        });
    } else {
      const dto: ContextResourceUpdateDto = {
        label: formValue.label,
        description: formValue.description || undefined,
        config,
      };

      this.contextHubService.updateResource(this.data.resource!.id, dto)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('リソースを更新しました', '閉じる', { duration: 2000 });
            this.dialogRef.close(true);
          },
          error: err => {
            console.error('Failed to update resource:', err);
            this.snackBar.open('更新に失敗しました', '閉じる', { duration: 3000 });
            this.isSaving = false;
          }
        });
    }
  }
}
