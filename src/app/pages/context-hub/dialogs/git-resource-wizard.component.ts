import { Component, Inject, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError, finalize } from 'rxjs/operators';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ContextHubService } from '../../../services/context-hub.service';
import { ApiGitlabService, GitlabBranch, GitlabTag } from '../../../services/api-gitlab.service';
import { ApiGiteaService } from '../../../services/api-gitea.service';
import {
  ContextResourceForView,
  ContextResourceCreateDto,
  ContextResourceUpdateDto,
  GitLabResourceConfig,
  GiteaResourceConfig,
  GitRef,
  GitLabIncludeTarget,
  GiteaIncludeTarget,
  GITLAB_INCLUDE_TARGET_OPTIONS,
  GITEA_INCLUDE_TARGET_OPTIONS,
} from '../../../models/context-hub.models';
import { UUID } from '../../../models/project-models';

import { GitProjectSelectorComponent, GitProjectSelection, GitProviderType } from './git-project-selector.component';

export interface GitResourceWizardData {
  mode: 'create' | 'edit';
  providerType: GitProviderType;
  contextHubId?: UUID;
  providerName?: string;
  resource?: ContextResourceForView;
}

@Component({
  selector: 'app-git-resource-wizard',
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
    MatCheckboxModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    GitProjectSelectorComponent,
  ],
  template: `
    <div class="wizard-container">
      <!-- Header -->
      <div class="wizard-header">
        <div class="wizard-title">
          <div class="wizard-title-icon" [class.gitlab]="providerType === 'gitlab'" [class.gitea]="providerType === 'gitea'">
            {{ providerType === 'gitlab' ? '🦊' : '🍵' }}
          </div>
          <span>{{ getTitle() }}</span>
        </div>
        <button class="wizard-close" mat-dialog-close>&times;</button>
      </div>

      <!-- Progress Steps -->
      <div class="wizard-progress">
        <div class="progress-step" [class.active]="currentStep === 1" [class.completed]="currentStep > 1">
          <div class="step-number">{{ currentStep > 1 ? '✓' : '1' }}</div>
          <div class="step-label">プロジェクト選択</div>
        </div>
        <div class="progress-line" [class.completed]="currentStep > 1"></div>
        <div class="progress-step" [class.active]="currentStep === 2">
          <div class="step-number">2</div>
          <div class="step-label">詳細設定</div>
        </div>
      </div>

      <!-- Body -->
      <div class="wizard-body">
        <!-- Step 1: プロジェクト選択 -->
        @if (currentStep === 1) {
          <div class="step-content step-1">
            <app-git-project-selector
              [providerType]="providerType"
              [providerName]="providerName"
              [selectedProjectId]="selectedProject?.projectId"
              (projectSelected)="onProjectSelected($event)">
            </app-git-project-selector>
          </div>
        }

        <!-- Step 2: 詳細設定 -->
        @if (currentStep === 2) {
          <div class="step-content step-2">
            <!-- 選択サマリ -->
            <div class="selection-summary">
              <div class="summary-icon">
                <mat-icon>code</mat-icon>
              </div>
              <div class="summary-content">
                <div class="summary-label">選択中のプロジェクト</div>
                <div class="summary-value">{{ selectedProject?.projectPath }}</div>
              </div>
              <button type="button" class="btn-change" (click)="goToStep(1)">
                <mat-icon>edit</mat-icon> 変更
              </button>
            </div>

            <!-- 設定フォーム -->
            <form [formGroup]="form" class="settings-form">
              <!-- 基本情報 -->
              <div class="form-section">
                <div class="form-row">
                  <div class="form-group flex-1">
                    <label class="form-label">リソース名<span class="required">*</span></label>
                    <input type="text" class="form-input" formControlName="label"
                           placeholder="例: メインリポジトリ">
                  </div>
                  <div class="form-group flex-2">
                    <label class="form-label">説明</label>
                    <input type="text" class="form-input" formControlName="description"
                           placeholder="このリソースの説明を入力...">
                  </div>
                </div>
              </div>

              <!-- ブランチ/タグ選択 -->
              <div class="form-section">
                <div class="section-header">
                  <mat-icon>account_tree</mat-icon>
                  <span>ブランチ / タグ</span>
                  @if (isLoadingRefs) {
                    <mat-spinner diameter="16"></mat-spinner>
                  }
                </div>

                <div class="ref-selector">
                  <!-- ブランチ -->
                  <div class="ref-column">
                    <div class="ref-header">
                      <mat-icon>merge</mat-icon> ブランチ
                      <button type="button" class="select-all-btn" (click)="toggleAllBranches()">
                        {{ areAllBranchesSelected() ? '全解除' : '全選択' }}
                      </button>
                    </div>
                    <div class="ref-list">
                      @for (branch of branches; track branch.name) {
                        <label class="ref-item" [class.selected]="isRefSelected(branch.name, 'branch')">
                          <input type="checkbox"
                                 [checked]="isRefSelected(branch.name, 'branch')"
                                 (change)="toggleRef(branch.name, 'branch', branch.name === defaultBranch)">
                          <span class="ref-name">{{ branch.name }}</span>
                          @if (branch.name === defaultBranch) {
                            <span class="default-badge">default</span>
                          }
                        </label>
                      }
                      @if (branches.length === 0 && !isLoadingRefs) {
                        <div class="empty-message">ブランチがありません</div>
                      }
                    </div>
                  </div>

                  <!-- タグ -->
                  <div class="ref-column">
                    <div class="ref-header">
                      <mat-icon>local_offer</mat-icon> タグ
                      @if (tags.length > 0) {
                        <button type="button" class="select-all-btn" (click)="toggleAllTags()">
                          {{ areAllTagsSelected() ? '全解除' : '全選択' }}
                        </button>
                      }
                    </div>
                    <div class="ref-list">
                      @for (tag of tags; track tag.name) {
                        <label class="ref-item" [class.selected]="isRefSelected(tag.name, 'tag')">
                          <input type="checkbox"
                                 [checked]="isRefSelected(tag.name, 'tag')"
                                 (change)="toggleRef(tag.name, 'tag')">
                          <span class="ref-name">{{ tag.name }}</span>
                        </label>
                      }
                      @if (tags.length === 0 && !isLoadingRefs) {
                        <div class="empty-message">タグがありません</div>
                      }
                    </div>
                  </div>
                </div>
              </div>

              <!-- 取得対象 -->
              <div class="form-section">
                <div class="section-header">
                  <mat-icon>inventory_2</mat-icon>
                  <span>取得対象</span>
                </div>
                <div class="target-chips">
                  @for (opt of includeTargetOptions; track opt.value) {
                    <label class="target-chip" [class.selected]="isTargetSelected(opt.value)">
                      <input type="checkbox"
                             [checked]="isTargetSelected(opt.value)"
                             (change)="toggleTarget(opt.value)">
                      <mat-icon>{{ opt.icon }}</mat-icon>
                      <span>{{ opt.label }}</span>
                    </label>
                  }
                </div>
              </div>

              <!-- 除外パターン（ソースコード選択時のみ） -->
              @if (isTargetSelected('source')) {
                <div class="form-section">
                  <div class="section-header">
                    <mat-icon>filter_alt</mat-icon>
                    <span>除外パターン</span>
                  </div>
                  <div class="pattern-input-container">
                    <div class="pattern-chips">
                      @for (pattern of excludePatterns; track pattern) {
                        <span class="pattern-chip">
                          {{ pattern }}
                          <span class="chip-remove" (click)="removeExcludePattern(pattern)">&times;</span>
                        </span>
                      }
                    </div>
                    <input type="text" class="pattern-input"
                           placeholder="除外パターンを入力してEnter... (例: node_modules, *.lock)"
                           (keydown.enter)="addExcludePattern($event)">
                  </div>
                  <div class="form-hint">glob形式で除外するファイル/ディレクトリを指定</div>

                  <div class="preset-patterns">
                    <span class="preset-label">プリセット:</span>
                    @for (preset of excludePresets; track preset) {
                      <button type="button" class="preset-btn"
                              [class.active]="excludePatterns.includes(preset)"
                              (click)="togglePreset(preset)">
                        {{ preset }}
                      </button>
                    }
                  </div>
                </div>
              }

              <!-- 詳細オプション -->
              <div class="advanced-section">
                <button type="button" class="advanced-toggle" (click)="showAdvanced = !showAdvanced">
                  <mat-icon>{{ showAdvanced ? 'expand_less' : 'expand_more' }}</mat-icon>
                  詳細オプション
                </button>

                @if (showAdvanced) {
                  <div class="advanced-options">
                    @if (isTargetSelected('mr') || isTargetSelected('pr')) {
                      <div class="form-group">
                        <label class="form-label">{{ providerType === 'gitlab' ? 'MR' : 'PR' }}の状態</label>
                        <div class="radio-row">
                          @for (state of mrStateOptions; track state.value) {
                            <label class="radio-item">
                              <input type="radio" formControlName="mrState" [value]="state.value">
                              {{ state.label }}
                            </label>
                          }
                        </div>
                      </div>
                    }

                    @if (isTargetSelected('issues')) {
                      <div class="form-group">
                        <label class="form-label">Issueの状態</label>
                        <div class="radio-row">
                          @for (state of issueStateOptions; track state.value) {
                            <label class="radio-item">
                              <input type="radio" formControlName="issueState" [value]="state.value">
                              {{ state.label }}
                            </label>
                          }
                        </div>
                      </div>
                    }

                    <div class="form-row">
                      <div class="form-group">
                        <label class="form-label">最大取得件数</label>
                        <input type="number" class="form-input" formControlName="maxItems"
                               min="1" max="1000" style="max-width: 150px;">
                        <div class="form-hint">MR/Issue/コミットの上限</div>
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
          <button type="button" class="btn btn-primary" [disabled]="!selectedProject" (click)="goToStep(2)">
            次へ <mat-icon>arrow_forward</mat-icon>
          </button>
        } @else {
          <button type="button" class="btn btn-secondary" (click)="goToStep(1)">
            <mat-icon>arrow_back</mat-icon> 戻る
          </button>
          <button type="button" class="btn btn-primary" [disabled]="!canSave() || isSaving" (click)="save()">
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
      --bg-hover: rgba(255,255,255,0.05);
      --text-primary: #ffffff;
      --text-secondary: #8b929a;
      --text-muted: #666;
      --border-color: #3a3f4a;
      --error-color: #ea4335;
      --success-color: #34a853;
      --gitlab-color: #fc6d26;
      --gitea-color: #609926;
    }

    .wizard-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background-color: var(--bg-card);
      color: var(--text-primary);
      overflow: hidden;
    }

    /* Header */
    .wizard-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .wizard-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 18px;
      font-weight: 600;
    }

    .wizard-title-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;

      &.gitlab { background: var(--gitlab-color); }
      &.gitea { background: var(--gitea-color); }
    }

    .wizard-close {
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 6px;
      font-size: 20px;
      transition: all 0.2s;

      &:hover {
        background-color: var(--bg-input);
        color: var(--text-primary);
      }
    }

    /* Progress */
    .wizard-progress {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 24px;
      background: var(--bg-dark);
      gap: 0;
      flex-shrink: 0;
    }

    .progress-step {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
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
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--bg-input);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .step-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .progress-line {
      width: 60px;
      height: 2px;
      background: var(--bg-input);
      margin: 0 8px;

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

      app-git-project-selector {
        flex: 1;
        min-height: 0;
      }
    }

    .step-2 {
      padding: 20px 24px;
      overflow-y: auto;
    }

    /* Selection Summary */
    .selection-summary {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 16px;
      background: rgba(26, 115, 232, 0.1);
      border: 1px solid rgba(26, 115, 232, 0.3);
      border-radius: 10px;
      margin-bottom: 20px;
    }

    .summary-icon {
      width: 40px;
      height: 40px;
      background: var(--primary-color);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon { color: white; font-size: 20px; width: 20px; height: 20px; }
    }

    .summary-content { flex: 1; }

    .summary-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-value {
      font-size: 14px;
      font-weight: 500;
      font-family: monospace;
    }

    .btn-change {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      mat-icon { font-size: 14px; width: 14px; height: 14px; }

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

    .form-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      mat-spinner {
        margin-left: auto;
      }
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
      gap: 6px;
    }

    .form-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);

      .required {
        color: var(--error-color);
        margin-left: 2px;
      }
    }

    .form-input {
      padding: 10px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 13px;
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
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Ref Selector */
    .ref-selector {
      display: flex;
      gap: 16px;
    }

    .ref-column {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--bg-dark);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }

    .ref-header {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 12px;
      background: rgba(0,0,0,0.2);
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .select-all-btn {
        margin-left: auto;
        padding: 2px 8px;
        background: transparent;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        color: var(--text-muted);
        font-size: 10px;
        cursor: pointer;

        &:hover {
          border-color: var(--primary-color);
          color: var(--primary-color);
        }
      }
    }

    .ref-list {
      max-height: 180px;
      overflow-y: auto;
      padding: 8px;
    }

    .ref-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.1s;

      &:hover {
        background: var(--bg-hover);
      }

      &.selected {
        background: rgba(26, 115, 232, 0.15);
      }

      input[type="checkbox"] {
        accent-color: var(--primary-color);
      }

      .ref-name {
        flex: 1;
        font-size: 13px;
        font-family: monospace;
      }

      .default-badge {
        padding: 2px 6px;
        background: var(--success-color);
        border-radius: 4px;
        font-size: 10px;
        color: white;
      }
    }

    .empty-message {
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Target Chips */
    .target-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .target-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: var(--bg-input);
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;

      input[type="checkbox"] {
        display: none;
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--text-secondary);
      }

      span {
        font-size: 13px;
        color: var(--text-secondary);
      }

      &:hover {
        border-color: var(--border-color);
      }

      &.selected {
        border-color: var(--primary-color);
        background: rgba(26, 115, 232, 0.1);

        mat-icon, span {
          color: var(--primary-color);
        }
      }
    }

    /* Pattern Input */
    .pattern-input-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px 12px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      min-height: 44px;
      align-items: center;

      &:focus-within {
        border-color: var(--primary-color);
      }
    }

    .pattern-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .pattern-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: rgba(234, 67, 53, 0.2);
      border-radius: 12px;
      font-size: 12px;
      font-family: monospace;
      color: #ff8a80;

      .chip-remove {
        cursor: pointer;
        opacity: 0.7;
        font-size: 14px;

        &:hover { opacity: 1; }
      }
    }

    .pattern-input {
      flex: 1;
      min-width: 200px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      outline: none;
      font-size: 13px;

      &::placeholder { color: var(--text-muted); }
    }

    .preset-patterns {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
    }

    .preset-label {
      font-size: 11px;
      color: var(--text-muted);
    }

    .preset-btn {
      padding: 4px 10px;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 12px;
      color: var(--text-muted);
      font-size: 11px;
      font-family: monospace;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--text-secondary);
        color: var(--text-secondary);
      }

      &.active {
        background: rgba(234, 67, 53, 0.15);
        border-color: #ff8a80;
        color: #ff8a80;
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
      font-size: 13px;
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

    .radio-row {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }

    .radio-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      cursor: pointer;

      input[type="radio"] {
        accent-color: var(--primary-color);
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

      .ref-selector {
        flex-direction: column;
      }
    }
  `]
})
export class GitResourceWizardComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly contextHubService = inject(ContextHubService);
  private readonly gitlabService = inject(ApiGitlabService);
  private readonly giteaService = inject(ApiGiteaService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<GitResourceWizardComponent>);

  private destroy$ = new Subject<void>();

  currentStep = 1;
  form!: FormGroup;
  isSaving = false;
  showAdvanced = false;
  isLoadingRefs = false;

  providerType: GitProviderType;
  providerName: string;

  selectedProject: GitProjectSelection | null = null;
  branches: GitlabBranch[] = [];
  tags: GitlabTag[] = [];
  defaultBranch = '';

  selectedRefs: GitRef[] = [];
  selectedTargets: Set<string> = new Set(['source']);
  excludePatterns: string[] = ['node_modules', 'dist', '.git'];

  excludePresets = ['node_modules', 'dist', '.git', '*.lock', 'vendor', '__pycache__', '.venv', 'target'];

  includeTargetOptions: { value: string; label: string; icon: string }[] = [];

  mrStateOptions = [
    { value: 'opened', label: 'オープン' },
    { value: 'merged', label: 'マージ済み' },
    { value: 'closed', label: 'クローズ' },
    { value: 'all', label: '全て' },
  ];

  issueStateOptions = [
    { value: 'opened', label: 'オープン' },
    { value: 'closed', label: 'クローズ' },
    { value: 'all', label: '全て' },
  ];

  constructor(@Inject(MAT_DIALOG_DATA) public data: GitResourceWizardData) {
    this.providerType = data.providerType;
    this.providerName = data.providerName || '';

    this.includeTargetOptions = this.providerType === 'gitlab'
      ? GITLAB_INCLUDE_TARGET_OPTIONS
      : GITEA_INCLUDE_TARGET_OPTIONS;
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
      mrState: ['opened'],
      issueState: ['opened'],
      maxItems: [100],
    });
  }

  private populateFromResource(resource: ContextResourceForView): void {
    const config = resource.config as GitLabResourceConfig | GiteaResourceConfig;

    this.form.patchValue({
      label: resource.label,
      description: resource.description || '',
      maxItems: config.maxItems || 100,
    });

    if (this.providerType === 'gitlab') {
      const gitlabConfig = config as GitLabResourceConfig;
      this.selectedProject = {
        projectId: gitlabConfig.projectId,
        projectPath: gitlabConfig.projectPath || '',
      };
      this.form.patchValue({
        mrState: gitlabConfig.mrState || 'opened',
        issueState: gitlabConfig.issueState || 'opened',
      });
      this.selectedTargets = new Set(gitlabConfig.includeTargets || ['source']);
      if (gitlabConfig.refs) {
        this.selectedRefs = [...gitlabConfig.refs];
      }
    } else {
      const giteaConfig = config as GiteaResourceConfig;
      this.selectedProject = {
        projectId: 0,
        projectPath: giteaConfig.repoFullName || `${giteaConfig.owner}/${giteaConfig.repo}`,
        owner: giteaConfig.owner,
        repo: giteaConfig.repo,
      };
      this.form.patchValue({
        mrState: giteaConfig.prState || 'open',
        issueState: giteaConfig.issueState || 'open',
      });
      this.selectedTargets = new Set(giteaConfig.includeTargets || ['source']);
      if (giteaConfig.refs) {
        this.selectedRefs = [...giteaConfig.refs];
      }
    }

    this.excludePatterns = config.excludePatterns || ['node_modules', 'dist', '.git'];

    // ブランチ/タグをロード
    this.loadRefs();
  }

  getTitle(): string {
    const provider = this.providerType === 'gitlab' ? 'GitLab' : 'Gitea';
    const action = this.data.mode === 'create' ? '追加' : '編集';
    return `${provider} リソース${action}`;
  }

  onProjectSelected(project: GitProjectSelection | undefined): void {
    if (!project) {
      this.selectedProject = null;
      this.branches = [];
      this.tags = [];
      this.selectedRefs = [];
      return;
    }

    this.selectedProject = project;
    this.defaultBranch = project.defaultBranch || 'main';

    // ラベル自動設定
    if (!this.form.get('label')?.value) {
      this.form.patchValue({ label: project.projectPath });
    }

    // ブランチ/タグをロード
    this.loadRefs();
  }

  private loadRefs(): void {
    if (!this.selectedProject) return;

    this.isLoadingRefs = true;

    if (this.providerType === 'gitlab') {
      forkJoin([
        this.gitlabService.branches(this.providerName, this.selectedProject.projectId).pipe(
          catchError(() => of([]))
        ),
        this.gitlabService.tags(this.providerName, this.selectedProject.projectId).pipe(
          catchError(() => of([]))
        ),
      ]).pipe(
        finalize(() => this.isLoadingRefs = false),
        takeUntil(this.destroy$)
      ).subscribe(([branches, tags]) => {
        this.branches = branches;
        this.tags = tags;

        // デフォルトブランチを選択状態にする（新規の場合のみ）
        if (this.data.mode === 'create' && this.selectedRefs.length === 0 && this.defaultBranch) {
          const defaultExists = branches.some(b => b.name === this.defaultBranch);
          if (defaultExists) {
            this.selectedRefs = [{
              name: this.defaultBranch,
              type: 'branch',
              isDefault: true,
            }];
          }
        }
      });
    } else {
      // Gitea の場合
      if (!this.selectedProject?.owner || !this.selectedProject?.repo) {
        this.isLoadingRefs = false;
        return;
      }

      forkJoin([
        this.giteaService.branches(this.providerName, this.selectedProject.owner, this.selectedProject.repo).pipe(
          catchError(() => of([]))
        ),
        this.giteaService.tags(this.providerName, this.selectedProject.owner, this.selectedProject.repo).pipe(
          catchError(() => of([]))
        ),
      ]).pipe(
        finalize(() => this.isLoadingRefs = false),
        takeUntil(this.destroy$)
      ).subscribe(([branches, tags]) => {
        // Gitea API の形式を GitLab と同じ形式に変換
        this.branches = branches.map(b => ({ name: b.name, commit: { id: b.commit?.id || '' } })) as any;
        this.tags = tags.map(t => ({ name: t.name })) as any;

        // デフォルトブランチを選択状態にする（新規の場合のみ）
        if (this.data.mode === 'create' && this.selectedRefs.length === 0 && this.defaultBranch) {
          const defaultExists = branches.some(b => b.name === this.defaultBranch);
          if (defaultExists) {
            this.selectedRefs = [{
              name: this.defaultBranch,
              type: 'branch',
              isDefault: true,
            }];
          }
        }
      });
    }
  }

  goToStep(step: number): void {
    this.currentStep = step;
  }

  // Ref selection
  isRefSelected(name: string, type: 'branch' | 'tag'): boolean {
    return this.selectedRefs.some(r => r.name === name && r.type === type);
  }

  toggleRef(name: string, type: 'branch' | 'tag', isDefault = false): void {
    const index = this.selectedRefs.findIndex(r => r.name === name && r.type === type);
    if (index >= 0) {
      this.selectedRefs.splice(index, 1);
    } else {
      this.selectedRefs.push({ name, type, isDefault });
    }
  }

  areAllBranchesSelected(): boolean {
    return this.branches.length > 0 && this.branches.every(b => this.isRefSelected(b.name, 'branch'));
  }

  areAllTagsSelected(): boolean {
    return this.tags.length > 0 && this.tags.every(t => this.isRefSelected(t.name, 'tag'));
  }

  toggleAllBranches(): void {
    if (this.areAllBranchesSelected()) {
      this.selectedRefs = this.selectedRefs.filter(r => r.type !== 'branch');
    } else {
      const branchRefs = this.branches.map(b => ({
        name: b.name,
        type: 'branch' as const,
        isDefault: b.name === this.defaultBranch,
      }));
      this.selectedRefs = [
        ...this.selectedRefs.filter(r => r.type !== 'branch'),
        ...branchRefs,
      ];
    }
  }

  toggleAllTags(): void {
    if (this.areAllTagsSelected()) {
      this.selectedRefs = this.selectedRefs.filter(r => r.type !== 'tag');
    } else {
      const tagRefs = this.tags.map(t => ({
        name: t.name,
        type: 'tag' as const,
      }));
      this.selectedRefs = [
        ...this.selectedRefs.filter(r => r.type !== 'tag'),
        ...tagRefs,
      ];
    }
  }

  // Target selection
  isTargetSelected(target: string): boolean {
    return this.selectedTargets.has(target);
  }

  toggleTarget(target: string): void {
    if (this.selectedTargets.has(target)) {
      this.selectedTargets.delete(target);
    } else {
      this.selectedTargets.add(target);
    }
  }

  // Exclude patterns
  addExcludePattern(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (value && !this.excludePatterns.includes(value)) {
      this.excludePatterns.push(value);
      input.value = '';
    }
    event.preventDefault();
  }

  removeExcludePattern(pattern: string): void {
    this.excludePatterns = this.excludePatterns.filter(p => p !== pattern);
  }

  togglePreset(preset: string): void {
    if (this.excludePatterns.includes(preset)) {
      this.removeExcludePattern(preset);
    } else {
      this.excludePatterns.push(preset);
    }
  }

  canSave(): boolean {
    return this.form.valid && this.selectedProject !== null && this.selectedTargets.size > 0;
  }

  save(): void {
    if (!this.canSave()) return;

    this.isSaving = true;
    const formValue = this.form.value;

    let config: GitLabResourceConfig | GiteaResourceConfig;

    if (this.providerType === 'gitlab') {
      config = {
        projectId: this.selectedProject!.projectId,
        projectPath: this.selectedProject!.projectPath,
        refs: this.selectedRefs.length > 0 ? this.selectedRefs : undefined,
        includeTargets: Array.from(this.selectedTargets) as GitLabIncludeTarget[],
        excludePatterns: this.excludePatterns.length > 0 ? this.excludePatterns : undefined,
        mrState: this.isTargetSelected('mr') ? formValue.mrState : undefined,
        issueState: this.isTargetSelected('issues') ? formValue.issueState : undefined,
        maxItems: formValue.maxItems,
      } as GitLabResourceConfig;
    } else {
      config = {
        owner: this.selectedProject!.owner || '',
        repo: this.selectedProject!.repo || '',
        repoFullName: this.selectedProject!.projectPath,
        refs: this.selectedRefs.length > 0 ? this.selectedRefs : undefined,
        includeTargets: Array.from(this.selectedTargets) as GiteaIncludeTarget[],
        excludePatterns: this.excludePatterns.length > 0 ? this.excludePatterns : undefined,
        prState: this.isTargetSelected('pr') ? formValue.mrState : undefined,
        issueState: this.isTargetSelected('issues') ? formValue.issueState : undefined,
        maxItems: formValue.maxItems,
      } as GiteaResourceConfig;
    }

    if (this.data.mode === 'create') {
      const dto: ContextResourceCreateDto = {
        contextHubId: this.data.contextHubId!,
        providerType: this.providerType,
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
