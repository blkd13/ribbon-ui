import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';

import { BoxFolderSelectorComponent, BoxSelection } from './box-folder-selector.component';
import {
  ContextResource,
  ContextResourceBox,
  BoxResourceConfig,
  DepthConfig,
  DEPTH_OPTIONS,
  ContextSearchMode,
} from '../../../models/context-hub.models';

export interface BoxResourceWizardData {
  mode: 'create' | 'edit';
  providerName: string;
  contextHubId: string;
  existingResource?: ContextResourceBox;
}

export interface BoxResourceWizardResult {
  action: 'save' | 'cancel';
  resource?: Partial<ContextResource>;
}

@Component({
  selector: 'app-box-resource-wizard',
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
    MatSelectModule,
    MatCheckboxModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    BoxFolderSelectorComponent,
  ],
  template: `
    <div class="wizard-container">
      <!-- ヘッダー（プログレスインジケーター統合） -->
      <div class="wizard-header">
        <div class="header-title">
          <mat-icon class="provider-icon">cloud_queue</mat-icon>
          <h2>{{ data.mode === 'create' ? 'Boxリソースを追加' : 'Boxリソースを編集' }}</h2>
        </div>
        <!-- インラインプログレスインジケーター -->
        <div class="progress-indicator">
          <div class="step" [class.active]="currentStep === 1" [class.completed]="currentStep > 1">
            <div class="step-number">{{ currentStep > 1 ? '✓' : '1' }}</div>
            <span class="step-label">選択</span>
          </div>
          <div class="step-line" [class.completed]="currentStep > 1"></div>
          <div class="step" [class.active]="currentStep === 2">
            <div class="step-number">2</div>
            <span class="step-label">設定</span>
          </div>
        </div>
        <button mat-icon-button (click)="cancel()">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- コンテンツエリア -->
      <div class="wizard-content">
        <!-- Step 1: フォルダ/ファイル選択 -->
        @if (currentStep === 1) {
          <div class="step-content step1">
            <app-box-folder-selector
              [providerName]="data.providerName"
              [initialSelection]="initialSelection"
              (folderSelected)="onFolderSelected($event)">
            </app-box-folder-selector>
          </div>
        }

        <!-- Step 2: 詳細設定 -->
        @if (currentStep === 2) {
          <div class="step-content step2">
            <!-- 2カラムレイアウト -->
            <div class="step2-layout">
              <!-- 左: 選択済みプレビュー（目立つカード） -->
              <div class="step2-preview">
                <div class="preview-card">
                  <div class="preview-header">
                    <div class="preview-title">
                      <mat-icon>check_circle</mat-icon>
                      <span>選択済み</span>
                    </div>
                    <button class="edit-selection-btn" (click)="currentStep = 1">
                      <mat-icon>edit</mat-icon>
                      変更
                    </button>
                  </div>
                  <div class="preview-stats">
                    <div class="stat-chip selected">
                      <mat-icon>folder</mat-icon>
                      <span class="stat-number">{{ selectedItems.length }}</span>
                      <span class="stat-unit">件選択</span>
                    </div>
                    @if (excludedItemsCount > 0) {
                      <div class="stat-chip excluded">
                        <mat-icon>block</mat-icon>
                        <span class="stat-number">{{ excludedItemsCount }}</span>
                        <span class="stat-unit">件除外</span>
                      </div>
                    }
                  </div>
                  <div class="preview-items">
                    @for (item of selectedItems.slice(0, 5); track item.id) {
                      <div class="preview-item" [class.folder]="item.type === 'folder'">
                        <div class="item-icon">
                          @if (item.type === 'folder') {
                            <mat-icon class="folder-icon">folder</mat-icon>
                          } @else {
                            <mat-icon class="file-icon">description</mat-icon>
                          }
                        </div>
                        <div class="item-info">
                          <span class="item-name">{{ item.name }}</span>
                          @if (item.path) {
                            <span class="item-path">{{ item.path }}</span>
                          }
                        </div>
                      </div>
                    }
                    @if (selectedItems.length > 5) {
                      <div class="preview-more">
                        <mat-icon>more_horiz</mat-icon>
                        他 {{ selectedItems.length - 5 }}件
                      </div>
                    }
                  </div>
                </div>
              </div>

              <!-- 右: 設定フォーム -->
              <div class="step2-main">
                <form [formGroup]="settingsForm" class="settings-form">
                  <!-- 基本情報カード -->
                  <div class="form-card">
                    <div class="card-header">
                      <mat-icon>label</mat-icon>
                      <h3>基本情報</h3>
                    </div>
                    <div class="card-body">
                      <mat-form-field appearance="outline">
                        <mat-label>リソース名</mat-label>
                        <input matInput formControlName="label" placeholder="例: プロジェクトドキュメント">
                        <mat-icon matPrefix>drive_file_rename_outline</mat-icon>
                      </mat-form-field>
                      <mat-form-field appearance="outline">
                        <mat-label>説明（任意）</mat-label>
                        <textarea matInput formControlName="description" rows="2"
                                  placeholder="このリソースの用途や補足説明..."></textarea>
                        <mat-icon matPrefix>notes</mat-icon>
                      </mat-form-field>
                    </div>
                  </div>

                  <!-- 検索モード -->
                  <div class="form-card">
                    <div class="card-header">
                      <mat-icon>search</mat-icon>
                      <h3>検索モード</h3>
                    </div>
                    <div class="card-body">
                      <mat-radio-group formControlName="searchMode" class="horizontal-radio-group">
                        <mat-radio-button value="realtime">リアルタイム検索</mat-radio-button>
                        <mat-radio-button value="vector">ベクトル検索</mat-radio-button>
                      </mat-radio-group>
                      <div class="radio-hint">
                        @if (settingsForm.get('searchMode')?.value === 'realtime') {
                          Box Search APIを使用して最新データを検索（推奨）
                        } @else {
                          事前同期したデータでセマンティック検索
                        }
                      </div>
                    </div>
                  </div>

                  <!-- 取得設定カード -->
                  <div class="form-card">
                    <div class="card-header">
                      <mat-icon>tune</mat-icon>
                      <h3>取得設定</h3>
                    </div>
                    <div class="card-body">
                      <!-- 階層深度 -->
                      <div class="setting-row">
                        <span class="setting-label">階層深度</span>
                        <div class="setting-controls">
                          <mat-radio-group formControlName="depthType" class="horizontal-radio-group compact">
                            @for (opt of depthOptions; track opt.value) {
                              <mat-radio-button [value]="opt.value">{{ opt.label }}</mat-radio-button>
                            }
                          </mat-radio-group>
                          @if (settingsForm.get('depthType')?.value === 'limited') {
                            <input type="number" class="simple-input narrow"
                                   formControlName="depthValue" min="1" max="10">
                          }
                        </div>
                      </div>

                      <!-- 最大ファイルサイズ -->
                      <div class="setting-row">
                        <span class="setting-label">最大サイズ</span>
                        <div class="setting-controls">
                          <div class="input-with-suffix">
                            <input type="number" class="simple-input narrow"
                                   formControlName="maxFileSizeMB" min="1" max="100" placeholder="--">
                            <span class="input-suffix">MB</span>
                          </div>
                          <span class="setting-hint">省略時は制限なし</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- フィルター設定カード -->
                  <div class="form-card optional">
                    <div class="card-header">
                      <mat-icon>filter_alt</mat-icon>
                      <h3>フィルター</h3>
                      <span class="optional-badge">任意</span>
                    </div>
                    <div class="card-body">
                      <div class="filter-grid">
                        <div class="filter-field">
                          <div class="filter-label">
                            <mat-icon class="include">add_circle</mat-icon>
                            <span>対象パターン</span>
                          </div>
                          <mat-form-field appearance="outline">
                            <input matInput formControlName="filePatterns" placeholder="*.pdf, *.docx">
                          </mat-form-field>
                        </div>
                        <div class="filter-field">
                          <div class="filter-label">
                            <mat-icon class="exclude">remove_circle</mat-icon>
                            <span>除外パターン</span>
                          </div>
                          <mat-form-field appearance="outline">
                            <input matInput formControlName="excludePatterns" placeholder="~$*, *.tmp">
                          </mat-form-field>
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- フッター -->
      <div class="wizard-footer">
        <div class="footer-left">
          @if (currentStep === 1) {
            <div class="selection-status" [class.has-selection]="selectedItems.length > 0">
              <mat-icon>{{ selectedItems.length > 0 ? 'check_circle' : 'info' }}</mat-icon>
              <span>{{ selectedItems.length > 0
                ? selectedItems.length + '件選択中'
                : 'フォルダまたはファイルを選択してください' }}</span>
            </div>
          }
        </div>
        <div class="footer-actions">
          @if (currentStep === 1) {
            <button mat-button (click)="cancel()">キャンセル</button>
            <button mat-flat-button color="primary"
                    [disabled]="selectedItems.length === 0"
                    (click)="nextStep()">
              次へ <mat-icon>arrow_forward</mat-icon>
            </button>
          } @else {
            <button mat-button (click)="prevStep()">
              <mat-icon>arrow_back</mat-icon> 戻る
            </button>
            <button mat-flat-button color="primary"
                    [disabled]="!settingsForm.valid"
                    (click)="save()">
              <mat-icon>save</mat-icon> 保存
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ホストスタイル */
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .wizard-container {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      background: var(--bg-dialog, #1e2128);
      color: var(--text-primary, #e0e0e0);
      overflow: hidden;
    }

    /* ヘッダー（プログレスインジケーター統合） */
    .wizard-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-color, #3a3f4a);
      flex-shrink: 0;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;

      .provider-icon {
        font-size: 14px;
        width: 26px;
        height: 26px;
        color: #fff;
        background: #0061d5; // Box blue
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
      }
    }

    /* プログレスインジケーター - ヘッダー内インライン版 */
    .progress-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      padding: 0;
    }

    .step {
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0.5;
      transition: all 0.2s;

      &.active, &.completed { opacity: 1; }

      .step-number {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--bg-input, rgba(255,255,255,0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 600;
        transition: all 0.2s;
      }

      &.active .step-number {
        background: #2196f3;
        color: white;
      }

      &.completed .step-number {
        background: #4caf50;
        color: white;
      }

      .step-label {
        font-size: 11px;
        color: var(--text-secondary, #8b929a);
      }

      &.active .step-label { color: var(--text-primary, #e0e0e0); }
    }

    .step-line {
      width: 24px;
      height: 2px;
      background: var(--border-color, #3a3f4a);
      transition: background 0.2s;

      &.completed { background: #4caf50; }
    }

    /* コンテンツエリア */
    .wizard-content {
      flex: 1;
      min-height: 0; /* flexbox overflow fix */
      overflow: hidden;
      padding: 0 20px 8px;
      display: flex;
      flex-direction: column;
    }

    .step-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .step1 {
      padding: 0;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .step2 {
      padding: 16px 0;
      overflow-y: auto;
    }

    /* Step2 2カラムレイアウト（左右逆転：左にプレビュー、右にフォーム） */
    .step2-layout {
      display: flex;
      gap: 24px;
      height: 100%;
    }

    /* 左カラム: 選択済みプレビュー */
    .step2-preview {
      width: 320px;
      min-width: 320px;
      display: flex;
      flex-direction: column;
    }

    .preview-card {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: linear-gradient(135deg, rgba(0, 97, 213, 0.12) 0%, rgba(76, 175, 80, 0.08) 100%);
      border: 1px solid rgba(0, 97, 213, 0.3);
      border-radius: 12px;
      overflow: hidden;
    }

    .preview-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: rgba(0, 0, 0, 0.25);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .preview-title {
      display: flex;
      align-items: center;
      gap: 8px;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #4caf50;
      }

      span {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary, #e0e0e0);
      }
    }

    .edit-selection-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-secondary, #8b929a);
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
        color: var(--text-primary, #fff);
      }
    }

    .preview-stats {
      display: flex;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .stat-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 13px;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .stat-number {
        font-size: 18px;
        font-weight: 700;
      }

      .stat-unit {
        font-size: 11px;
        opacity: 0.8;
      }

      &.selected {
        background: rgba(76, 175, 80, 0.2);
        color: #81c784;

        mat-icon { color: #4caf50; }
        .stat-number { color: #4caf50; }
      }

      &.excluded {
        background: rgba(239, 83, 80, 0.15);
        color: #ef9a9a;

        mat-icon { color: #ef5350; }
        .stat-number { color: #ef5350; }
      }
    }

    .preview-items {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.15) transparent;
    }

    .preview-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      transition: all 0.15s;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .item-icon {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
      }

      .folder-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #ffc107;
      }

      .file-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--text-muted, #666);
      }

      .item-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .item-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-path {
        font-size: 10px;
        color: var(--text-muted, #666);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .preview-more {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px;
      font-size: 11px;
      color: var(--text-muted, #666);

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    /* 右カラム: 設定フォーム */
    .step2-main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* フォームカード */
    .form-card {
      background: var(--bg-card, #22262e);
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 10px;
      overflow: hidden;
      transition: border-color 0.2s;

      &:focus-within {
        border-color: rgba(33, 150, 243, 0.5);
      }

      &.optional {
        border-style: dashed;
        opacity: 0.85;

        &:focus-within {
          opacity: 1;
          border-style: solid;
        }
      }
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid var(--border-color, #3a3f4a);

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #2196f3;
      }

      h3 {
        flex: 1;
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary, #e0e0e0);
      }

      .optional-badge {
        font-size: 10px;
        padding: 2px 8px;
        background: rgba(255, 255, 255, 0.08);
        color: var(--text-muted, #666);
        border-radius: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }

    .card-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* 設定行レイアウト */
    .setting-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 8px 0;

      &:not(:last-child) {
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
    }

    .setting-label {
      flex-shrink: 0;
      width: 80px;
      font-size: 13px;
      color: var(--text-secondary, #8b929a);
    }

    .setting-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .setting-hint {
      font-size: 11px;
      color: var(--text-muted, #666);
    }

    /* シンプルなinput */
    .simple-input {
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      color: var(--text-primary, #e0e0e0);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;

      &:focus {
        border-color: #2196f3;
      }

      &::placeholder {
        color: var(--text-muted, #666);
      }

      &.narrow {
        width: 70px;
        text-align: center;
      }

      /* number inputのスピンボタンを非表示 */
      &[type="number"]::-webkit-inner-spin-button,
      &[type="number"]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      &[type="number"] {
        -moz-appearance: textfield;
      }
    }

    .input-with-suffix {
      display: flex;
      align-items: center;
      gap: 6px;

      .input-suffix {
        font-size: 12px;
        color: var(--text-secondary, #8b929a);
      }
    }

    /* フィルター設定用グリッド */
    .filter-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .filter-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .filter-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 500;
      color: var(--text-secondary, #8b929a);

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;

        &.include { color: #4caf50; }
        &.exclude { color: #ef5350; }
      }
    }

    /* 横並びラジオグループ */
    .horizontal-radio-group {
      display: flex;
      flex-direction: row;
      gap: 16px;
      align-items: center;

      &.compact {
        gap: 12px;

        ::ng-deep .mdc-label {
          font-size: 12px;
        }
      }
    }

    .radio-hint {
      font-size: 11px;
      color: var(--text-secondary, #8b929a);
      margin-top: 4px;
      padding-left: 2px;
    }

    mat-form-field {
      width: 100%;

      ::ng-deep {
        .mat-mdc-form-field-subscript-wrapper {
          margin-top: 2px;
        }

        .mat-mdc-text-field-wrapper {
          background: rgba(255, 255, 255, 0.03);
        }

        .mdc-notched-outline__leading,
        .mdc-notched-outline__notch,
        .mdc-notched-outline__trailing {
          border-color: rgba(255, 255, 255, 0.12) !important;
        }

        &.mat-focused .mdc-notched-outline__leading,
        &.mat-focused .mdc-notched-outline__notch,
        &.mat-focused .mdc-notched-outline__trailing {
          border-color: #2196f3 !important;
        }

        .mat-mdc-form-field-icon-prefix {
          padding-right: 8px;

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            color: var(--text-muted, #666);
          }
        }
      }
    }

    /* フッター */
    .wizard-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-top: 1px solid var(--border-color, #3a3f4a);
      flex-shrink: 0;
      background: var(--bg-dialog, #1e2128);
    }

    .footer-left {
      flex: 1;
    }

    .selection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-muted, #666);

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &.has-selection {
        color: #4caf50;
      }
    }

    .footer-actions {
      display: flex;
      gap: 12px;

      button mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }
  `]
})
export class BoxResourceWizardComponent implements OnInit {
  currentStep = 1;
  settingsForm!: FormGroup;

  selectedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string }[] = [];
  excludedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string; parentId: string }[] = [];
  currentPath = '';
  currentFolderId = '0';

  /** 編集モード用の初期選択 */
  initialSelection?: {
    selectedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string }[];
    excludedItems?: { id: string; name: string; type: 'folder' | 'file'; path?: string; parentId: string }[];
  };

  depthOptions = DEPTH_OPTIONS;

  get excludedItemsCount(): number {
    return this.excludedItems.length;
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<BoxResourceWizardComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: BoxResourceWizardData
  ) {}

  ngOnInit(): void {
    this.initForm();

    // 編集モードの場合、既存データをロード
    if (this.data.mode === 'edit' && this.data.existingResource) {
      this.loadExistingData(this.data.existingResource);
    }
  }

  private initForm(): void {
    this.settingsForm = this.fb.group({
      label: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      searchMode: ['realtime'],
      depthType: ['limited'],
      depthValue: [3],
      filePatterns: [''],
      excludePatterns: [''],
      maxFileSizeMB: [null],
    });
  }

  private loadExistingData(resource: ContextResourceBox): void {
    const config = resource.config;

    this.currentFolderId = config.folderId;
    this.currentPath = config.folderPath || '/';

    this.settingsForm.patchValue({
      label: resource.label,
      description: resource.description || '',
      searchMode: resource.searchMode || 'realtime',
      depthType: config.depth?.type || 'none',
      depthValue: config.depth?.depth || 1,
      filePatterns: config.filePatterns?.join(', ') || '',
      excludePatterns: config.excludePatterns?.join(', ') || '',
      maxFileSizeMB: config.maxFileSizeMB || null,
    });

    // 選択済みアイテムを設定
    // folderNameが保存されていればそれを使用、なければパスから推測
    const selectedItem = {
      id: config.folderId,
      name: config.folderName || config.folderPath?.split('/').pop() || 'Root',
      type: 'folder' as const,
      path: config.folderPath || '/',
    };

    this.selectedItems = [selectedItem];

    // フォルダセレクターに渡す初期選択を設定
    this.initialSelection = {
      selectedItems: [selectedItem],
      excludedItems: [],
    };
  }

  onFolderSelected(selection: BoxSelection): void {
    this.currentFolderId = selection.folderId;
    this.currentPath = selection.folderPath;
    this.selectedItems = selection.selectedItems;
    this.excludedItems = selection.excludedItems || [];

    // ラベルが未入力なら自動設定
    if (!this.settingsForm.get('label')?.value && selection.selectedItems.length > 0) {
      const firstItem = selection.selectedItems[0];
      this.settingsForm.patchValue({
        label: selection.selectedItems.length === 1
          ? firstItem.name
          : `Box - ${selection.selectedItems.length}件`
      });
    }
  }

  nextStep(): void {
    if (this.selectedItems.length > 0) {
      this.currentStep = 2;
    }
  }

  prevStep(): void {
    this.currentStep = 1;
  }

  save(): void {
    if (!this.settingsForm.valid || this.selectedItems.length === 0) return;

    const formValue = this.settingsForm.value;

    // 深度設定の構築
    const depth: DepthConfig = {
      type: formValue.depthType,
    };
    if (formValue.depthType === 'limited') {
      depth.depth = formValue.depthValue;
    }

    // ファイルパターンのパース
    const parsePatterns = (str: string): string[] | undefined => {
      if (!str) return undefined;
      const patterns = str.split(',').map(p => p.trim()).filter(p => p);
      return patterns.length > 0 ? patterns : undefined;
    };

    // 選択アイテムの情報を使用
    const selectedItem = this.selectedItems[0];
    const config: BoxResourceConfig = {
      folderId: selectedItem.id,
      folderPath: selectedItem.path || this.currentPath,
      folderName: selectedItem.name,  // 名前も保存して編集時に正しく復元できるようにする
      depth,
      filePatterns: parsePatterns(formValue.filePatterns),
      excludePatterns: parsePatterns(formValue.excludePatterns),
      maxFileSizeMB: formValue.maxFileSizeMB || undefined,
    };

    const resource: Partial<ContextResourceBox> = {
      contextHubId: this.data.contextHubId,
      providerType: 'box',
      providerName: this.data.providerName,
      label: formValue.label,
      description: formValue.description || undefined,
      config,
      isActive: true,
      syncStatus: 'pending',
      sortOrder: 0,
      searchMode: formValue.searchMode as ContextSearchMode,
    };

    // 編集モードの場合はIDを保持
    if (this.data.mode === 'edit' && this.data.existingResource) {
      resource.id = this.data.existingResource.id;
    }

    this.dialogRef.close({
      action: 'save',
      resource,
    } as BoxResourceWizardResult);
  }

  cancel(): void {
    this.dialogRef.close({ action: 'cancel' } as BoxResourceWizardResult);
  }
}
