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
  JiraResourceConfig,
  JiraIncludeField,
  JIRA_FIELD_OPTIONS,
} from '../../../models/context-hub.models';
import { UUID } from '../../../models/project-models';

import { JiraProjectSelectorComponent, JiraSelection } from './jira-project-selector.component';

export interface JiraWizardData {
  mode: 'create' | 'edit';
  contextHubId?: UUID;
  providerName?: string;
  resource?: ContextResourceForView;
}

@Component({
  selector: 'app-jira-resource-wizard',
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
    JiraProjectSelectorComponent,
  ],
  template: `
    <div class="wizard-container">
      <!-- Header（プログレスインジケーター統合） -->
      <div class="wizard-header">
        <div class="wizard-title">
          <div class="wizard-title-icon">
            <img src="image/jira-logo.svg" alt="Jira" width="16" height="16"
                 onerror="this.style.display='none'; this.parentElement.innerText='📋'">
          </div>
          <span>Jira リソース{{ data.mode === 'create' ? '追加' : '編集' }}</span>
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
            <app-jira-project-selector
              [providerName]="providerName"
              [initialSelection]="initialSelection"
              (selectionChanged)="onSelectionChanged($event)">
            </app-jira-project-selector>
          </div>
        }

        <!-- Step 2: 詳細設定 -->
        @if (currentStep === 2) {
          <div class="step-content step-2">
            <!-- 選択サマリ -->
            <div class="selection-summary">
              <div class="summary-icon">
                <mat-icon>{{ selection?.queryType === 'jql' ? 'code' : 'folder' }}</mat-icon>
              </div>
              <div class="summary-content">
                <div class="summary-label">選択中のソース</div>
                <div class="summary-value">
                  @if (selection?.queryType === 'jql') {
                    <span class="jql-badge">JQL</span>
                    <code class="jql-preview">{{ getJqlPreview() }}</code>
                  } @else {
                    {{ selection?.projectName }}
                    <span class="summary-key">({{ selection?.projectKey }})</span>
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
                         placeholder="例: 現在のスプリントタスク">
                </div>
                <div class="form-group flex-2">
                  <label class="form-label">説明</label>
                  <input type="text" class="form-input" formControlName="description"
                         placeholder="このリソースの説明を入力...">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">取得件数上限</label>
                <div class="count-chips">
                  @for (count of maxResultsOptions; track count.value) {
                    <button type="button" class="count-chip"
                            [class.selected]="form.get('maxResults')?.value === count.value"
                            (click)="selectMaxResults(count.value)">
                      {{ count.label }}
                    </button>
                  }
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">取得する項目</label>
                <div class="field-chips">
                  @for (field of fieldOptions; track field.value) {
                    <button type="button" class="field-chip"
                            [class.selected]="selectedFields.has(field.value)"
                            (click)="toggleField(field.value)">
                      <mat-icon class="chip-icon">{{ getFieldIcon(field.value) }}</mat-icon>
                      {{ field.label }}
                    </button>
                  }
                </div>
                <div class="form-hint">課題から取得するフィールドを選択します</div>
              </div>

              <!-- 詳細オプション -->
              <div class="advanced-section">
                <button type="button" class="advanced-toggle" (click)="showAdvanced = !showAdvanced">
                  <mat-icon>{{ showAdvanced ? 'expand_less' : 'expand_more' }}</mat-icon>
                  詳細オプション
                </button>

                @if (showAdvanced) {
                  <div class="advanced-options">
                    <div class="form-row">
                      <div class="form-group">
                        <label class="form-label">スプリントフィルター</label>
                        <select class="form-select" formControlName="sprintFilter">
                          <option value="">全て</option>
                          <option value="open">アクティブなスプリント</option>
                          <option value="current">現在のスプリントのみ</option>
                          <option value="closed">完了したスプリント</option>
                        </select>
                      </div>
                      <div class="form-group">
                        <label class="form-label">担当者フィルター</label>
                        <select class="form-select" formControlName="assigneeFilter">
                          <option value="">全員</option>
                          <option value="currentUser">自分のみ</option>
                          <option value="unassigned">未割り当て</option>
                        </select>
                      </div>
                    </div>

                    <div class="form-group">
                      <label class="form-label">ステータスフィルター</label>
                      <div class="status-chips">
                        @for (status of statusOptions; track status.value) {
                          <button type="button" class="status-chip"
                                  [class.selected]="selectedStatuses.has(status.value)"
                                  [style.--status-color]="status.color"
                                  (click)="toggleStatus(status.value)">
                            {{ status.label }}
                          </button>
                        }
                      </div>
                    </div>

                    <div class="form-group">
                      <label class="form-label">更新日フィルター</label>
                      <div class="period-chips">
                        @for (period of periodOptions; track period.value) {
                          <button type="button" class="period-chip"
                                  [class.selected]="form.get('updatedWithin')?.value === period.value"
                                  (click)="selectPeriod(period.value)">
                            {{ period.label }}
                          </button>
                        }
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
      --primary-color: #0052cc;
      --primary-dark: #003d99;
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
      background: #0052cc;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;

      img {
        width: 16px;
        height: 16px;
      }
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
        background: rgba(0, 82, 204, 0.15);

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
      padding: 16px 24px;

      app-jira-project-selector {
        flex: 1;
        min-height: 0;
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
      background: rgba(0, 82, 204, 0.1);
      border: 1px solid rgba(0, 82, 204, 0.3);
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
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .summary-key {
      color: var(--text-secondary);
      font-weight: 400;
    }

    .jql-badge {
      padding: 2px 8px;
      background: var(--primary-color);
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }

    .jql-preview {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      color: var(--text-secondary);
      max-width: 400px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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

    .form-input,
    .form-select {
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

    /* Count Chips */
    .count-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .count-chip {
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

    /* Field Chips */
    .field-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .field-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;

      .chip-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

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

    /* Status Chips */
    .status-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .status-chip {
      padding: 8px 14px;
      background: var(--bg-input);
      border: 2px solid var(--border-color);
      border-radius: 20px;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--status-color);
        color: var(--status-color);
      }

      &.selected {
        background: var(--status-color);
        border-color: var(--status-color);
        color: white;
      }
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
      background: rgba(0, 82, 204, 0.05);
      border-radius: 8px;
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 16px;
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
export class JiraResourceWizardComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly contextHubService = inject(ContextHubService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<JiraResourceWizardComponent>);

  private destroy$ = new Subject<void>();

  currentStep = 1;
  form!: FormGroup;
  isSaving = false;
  showAdvanced = false;

  providerName: string;
  selection: JiraSelection | null = null;
  initialSelection?: JiraSelection;

  fieldOptions = JIRA_FIELD_OPTIONS;
  selectedFields = new Set<JiraIncludeField>(['summary', 'description']);

  selectedStatuses = new Set<string>(['todo', 'inprogress']);

  maxResultsOptions = [
    { value: 50, label: '50件' },
    { value: 100, label: '100件' },
    { value: 200, label: '200件' },
    { value: 500, label: '500件' },
    { value: 1000, label: '1000件' },
  ];

  statusOptions = [
    { value: 'todo', label: 'To Do', color: '#8b929a' },
    { value: 'inprogress', label: 'In Progress', color: '#0052cc' },
    { value: 'done', label: 'Done', color: '#34a853' },
    { value: 'blocked', label: 'Blocked', color: '#ea4335' },
  ];

  periodOptions = [
    { value: 0, label: '全期間' },
    { value: 7, label: '1週間以内' },
    { value: 30, label: '1ヶ月以内' },
    { value: 90, label: '3ヶ月以内' },
    { value: 365, label: '1年以内' },
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public data: JiraWizardData) {
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
      maxResults: [100],
      sprintFilter: [''],
      assigneeFilter: [''],
      updatedWithin: [0],
    });
  }

  private populateFromResource(resource: ContextResourceForView): void {
    const config = resource.config as JiraResourceConfig;

    this.form.patchValue({
      label: resource.label,
      description: resource.description || '',
      maxResults: config.maxResults || 100,
    });

    if (config.includeFields) {
      this.selectedFields = new Set(config.includeFields);
    }

    this.initialSelection = {
      queryType: config.queryType,
      projectKey: config.projectKey,
      jql: config.jql,
    };

    this.selection = this.initialSelection;
  }

  onSelectionChanged(selection: JiraSelection): void {
    this.selection = selection;

    // 自動でラベルを設定
    if (!this.form.get('label')?.value) {
      if (selection.queryType === 'jql') {
        this.form.patchValue({ label: 'JQLクエリ結果' });
      } else if (selection.projectName) {
        this.form.patchValue({ label: `${selection.projectName} の課題` });
      }
    }
  }

  getJqlPreview(): string {
    if (!this.selection?.jql) return '';
    const jql = this.selection.jql;
    return jql.length > 50 ? jql.substring(0, 50) + '...' : jql;
  }

  canProceedStep1(): boolean {
    if (!this.selection) return false;
    if (this.selection.queryType === 'project') {
      return !!this.selection.projectKey;
    } else {
      return !!this.selection.jql?.trim();
    }
  }

  goToStep(step: number): void {
    this.currentStep = step;
  }

  selectMaxResults(value: number): void {
    this.form.patchValue({ maxResults: value });
  }

  toggleField(field: JiraIncludeField): void {
    if (this.selectedFields.has(field)) {
      this.selectedFields.delete(field);
    } else {
      this.selectedFields.add(field);
    }
  }

  toggleStatus(status: string): void {
    if (this.selectedStatuses.has(status)) {
      this.selectedStatuses.delete(status);
    } else {
      this.selectedStatuses.add(status);
    }
  }

  selectPeriod(days: number): void {
    this.form.patchValue({ updatedWithin: days });
  }

  getFieldIcon(field: JiraIncludeField): string {
    const icons: Record<JiraIncludeField, string> = {
      summary: 'title',
      description: 'description',
      comments: 'comment',
      attachments: 'attach_file',
      subtasks: 'account_tree',
      links: 'link',
    };
    return icons[field] || 'label';
  }

  save(): void {
    if (!this.form.valid || !this.selection) return;

    this.isSaving = true;
    const formValue = this.form.value;

    const config: JiraResourceConfig = {
      queryType: this.selection.queryType,
      projectKey: this.selection.queryType === 'project' ? this.selection.projectKey : undefined,
      jql: this.selection.queryType === 'jql' ? this.selection.jql : undefined,
      maxResults: formValue.maxResults,
      includeFields: Array.from(this.selectedFields),
    };

    if (this.data.mode === 'create') {
      const dto: ContextResourceCreateDto = {
        contextHubId: this.data.contextHubId!,
        providerType: 'jira',
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
