import { Component, Inject, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatSliderModule } from '@angular/material/slider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ContextHubService } from '../../../services/context-hub.service';
import {
  ContextResourceProviderType,
  ContextResourceForView,
  ContextResourceCreateDto,
  ContextResourceUpdateDto,
  BoxResourceConfig,
  ConfluenceResourceConfig,
  JiraResourceConfig,
  GitLabResourceConfig,
  GiteaResourceConfig,
  MattermostResourceConfig,
  WebResourceConfig,
  LocalResourceConfig,
  DepthConfig,
  DEPTH_OPTIONS,
  JIRA_FIELD_OPTIONS,
  JiraIncludeField,
} from '../../../models/context-hub.models';
import { UUID } from '../../../models/project-models';

// セレクターコンポーネント
import { BoxFolderSelectorComponent, BoxPathChange, BoxBreadcrumb } from './box-folder-selector.component';
import { GitProjectSelectorComponent, GitProjectSelection } from './git-project-selector.component';
import { MattermostChannelSelectorComponent, MattermostSelection } from './mattermost-channel-selector.component';

export interface ResourceDialogData {
  mode: 'create' | 'edit';
  contextHubId?: UUID;
  providerType?: ContextResourceProviderType;
  providerName?: string;
  resource?: ContextResourceForView;
}

@Component({
  selector: 'app-context-hub-resource-dialog',
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
    MatRadioModule,
    MatSliderModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTooltipModule,
    MatSnackBarModule,
    BoxFolderSelectorComponent,
    GitProjectSelectorComponent,
    MattermostChannelSelectorComponent,
  ],
  template: `
    <div class="modal-container">
      <!-- Header -->
      <div class="modal-header">
        <div class="modal-title">
          <div class="modal-title-icon" [style.background-color]="getProviderColor()">
            {{ getProviderEmoji() }}
          </div>
          <span>{{ getDialogTitle() }}</span>
          <!-- Box用パンくず -->
          @if (providerType === 'box') {
            <div class="header-breadcrumb">
              <mat-icon class="sep">chevron_right</mat-icon>
              <span class="crumb root" (click)="onBreadcrumbRootClick()">
                {{ boxSourceType === 'collection' ? 'お気に入り' : (boxSourceType === 'search' ? '検索結果' : 'Box') }}
              </span>
              @for (crumb of boxBreadcrumbs; track crumb.id; let i = $index) {
                <mat-icon class="sep">chevron_right</mat-icon>
                <span class="crumb" [class.current]="i === boxBreadcrumbs.length - 1"
                      (click)="onBreadcrumbClick(i)">{{ crumb.name }}</span>
              }
            </div>
          }
        </div>
        <button class="modal-close" mat-dialog-close>&times;</button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <form [formGroup]="form" class="resource-form">
          <!-- 共通: ラベル + 説明 (横並び) -->
          <div class="form-row-wide">
            <div class="form-group flex-2">
              <label class="form-label">リソース名<span class="required">*</span></label>
              <input type="text" class="form-input" formControlName="label"
                     [placeholder]="getLabelPlaceholder()">
            </div>
            <div class="form-group flex-3">
              <label class="form-label">説明（任意）</label>
              <input type="text" class="form-input" formControlName="description"
                     placeholder="このリソースの説明を入力...">
            </div>
          </div>

          <!-- Box設定 -->
          @if (providerType === 'box') {
            <div class="provider-config provider-config--compact" formGroupName="boxConfig">
              <h3 class="config-title">Boxフォルダ設定</h3>

              <app-box-folder-selector #boxSelector
                [providerName]="providerName"
                [selectedFolderId]="form.get('boxConfig.folderId')?.value"
                (folderSelected)="onBoxFolderSelected($event)"
                (pathChanged)="onBoxPathChanged($event)">
              </app-box-folder-selector>

              <!-- オプション: 横並び -->
              <div class="options-bar">
                <div class="option-item">
                  <label class="option-label">深さ</label>
                  <div class="range-inline">
                    <input type="range" min="1" max="10" formControlName="depthValue">
                    <span class="range-val">{{ form.get('boxConfig.depthValue')?.value }}</span>
                  </div>
                </div>
                <div class="option-item flex-2">
                  <label class="option-label">拡張子</label>
                  <input type="text" class="option-input" formControlName="filePatterns" placeholder=".pdf, .docx">
                </div>
                <div class="option-item">
                  <label class="option-label">最大サイズ</label>
                  <div class="range-inline">
                    <input type="range" min="1" max="100" formControlName="maxFileSizeMB">
                    <span class="range-val">{{ form.get('boxConfig.maxFileSizeMB')?.value }}MB</span>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- Mattermost設定 -->
          @if (providerType === 'mattermost') {
            <div class="provider-config" formGroupName="mattermostConfig">
              <h3 class="config-title">Mattermostメッセージ設定</h3>

              <app-mattermost-channel-selector
                [providerName]="providerName"
                (selectionChanged)="onMattermostSelectionChanged($event)">
              </app-mattermost-channel-selector>

              <!-- 取得期間 + キーワード (横並び) -->
              <div class="form-row-wide" style="margin-top: 16px;">
                <div class="form-group">
                  <label class="form-label">取得期間</label>
                  <div class="period-options-inline">
                    @for (period of periodOptions; track period.value) {
                      <div class="period-chip"
                           [class.selected]="form.get('mattermostConfig.periodDays')?.value === period.value"
                           (click)="selectPeriod(period.value)">
                        {{ period.label }}
                      </div>
                    }
                  </div>
                </div>
                <div class="form-group flex-2">
                  <label class="form-label">キーワードフィルター</label>
                  <div class="tags-input-inline">
                    @for (tag of keywordTags; track tag) {
                      <span class="tag-small">{{ tag }}<span class="tag-remove" (click)="removeKeywordTag(tag)">&times;</span></span>
                    }
                    <input type="text" class="tags-input" placeholder="キーワード追加..." (keydown.enter)="addKeywordTag($event)">
                  </div>
                </div>
              </div>

              <!-- 詳細オプション -->
              <div class="options-toggle" (click)="showMattermostAdvanced = !showMattermostAdvanced">
                <span>{{ showMattermostAdvanced ? '▼' : '▶' }}</span> 詳細オプション
              </div>
              @if (showMattermostAdvanced) {
                <div class="advanced-options-inline">
                  <label class="form-label">メッセージタイプ</label>
                  <div class="checkbox-inline">
                    <label class="checkbox-item-inline"><input type="checkbox" [checked]="true"> 通常</label>
                    <label class="checkbox-item-inline"><input type="checkbox" [checked]="true"> スレッド</label>
                    <label class="checkbox-item-inline"><input type="checkbox"> システム</label>
                    <label class="checkbox-item-inline"><input type="checkbox" [checked]="true"> 添付あり</label>
                  </div>
                </div>
              }
            </div>
          }

          <!-- Jira設定 -->
          @if (providerType === 'jira') {
            <div class="provider-config" formGroupName="jiraConfig">
              <h3 class="config-title">Jira課題設定</h3>

              <div class="tabs">
                <button type="button" class="tab-btn" [class.active]="jiraTabMode === 'simple'"
                        (click)="jiraTabMode = 'simple'">シンプル設定</button>
                <button type="button" class="tab-btn" [class.active]="jiraTabMode === 'jql'"
                        (click)="jiraTabMode = 'jql'">JQL設定</button>
              </div>

              @if (jiraTabMode === 'simple') {
                <div class="form-group">
                  <label class="form-label">プロジェクト<span class="required">*</span></label>
                  <input type="text" class="form-input" formControlName="projectKey"
                         placeholder="PROJ">
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">スプリント</label>
                    <select class="form-select" formControlName="sprint">
                      <option value="">全て</option>
                      <option value="current">現在のスプリント</option>
                      <option value="next">次のスプリント</option>
                      <option value="backlog">バックログ</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">担当者</label>
                    <select class="form-select" formControlName="assignee">
                      <option value="">全員</option>
                      <option value="me">自分のみ</option>
                      <option value="team">チームメンバー</option>
                    </select>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">ステータス</label>
                  <div class="checkbox-group horizontal">
                    <label class="checkbox-item">
                      <input type="checkbox" [checked]="true"> To Do
                    </label>
                    <label class="checkbox-item">
                      <input type="checkbox" [checked]="true"> In Progress
                    </label>
                    <label class="checkbox-item">
                      <input type="checkbox"> Done
                    </label>
                  </div>
                </div>
              } @else {
                <div class="form-group">
                  <label class="form-label">JQLクエリ</label>
                  <textarea class="form-textarea" formControlName="jql" rows="4"
                            placeholder="project = ALPHA AND sprint in openSprints() AND assignee = currentUser()"></textarea>
                  <div class="form-hint">JQL構文でカスタムクエリを指定します</div>
                </div>
              }

              <div class="form-group">
                <label class="form-label">取得件数上限</label>
                <input type="number" class="form-input" formControlName="maxResults"
                       style="max-width: 150px;" min="1" max="1000">
              </div>
            </div>
          }

          <!-- GitLab設定 -->
          @if (providerType === 'gitlab') {
            <div class="provider-config" formGroupName="gitlabConfig">
              <h3 class="config-title">GitLabリポジトリ設定</h3>

              <app-git-project-selector
                providerType="gitlab"
                [providerName]="providerName"
                [selectedProjectId]="form.get('gitlabConfig.projectId')?.value"
                (projectSelected)="onGitProjectSelected($event)">
              </app-git-project-selector>

              <div class="form-group">
                <label class="form-label">対象ブランチ</label>
                <div class="tags-input-container">
                  @for (branch of gitlabBranches; track branch) {
                    <span class="tag">
                      {{ branch }}
                      <span class="tag-remove" (click)="removeGitlabBranch(branch)">&times;</span>
                    </span>
                  }
                  <input type="text" class="tags-input"
                         placeholder="ブランチ名を入力..."
                         (keydown.enter)="addGitlabBranch($event)">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">監視対象</label>
                <div class="checkbox-group">
                  <label class="checkbox-item">
                    <input type="checkbox" [checked]="true"> パイプライン状態
                  </label>
                  <label class="checkbox-item">
                    <input type="checkbox" [checked]="true"> マージリクエスト
                  </label>
                  <label class="checkbox-item">
                    <input type="checkbox" [checked]="true"> Issues
                  </label>
                  <label class="checkbox-item">
                    <input type="checkbox"> コミット履歴
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">ファイルパターン（任意）</label>
                <input type="text" class="form-input" formControlName="filePatterns"
                       placeholder="src/**/*.ts, **/*.md">
                <div class="form-hint">カンマ区切りで複数指定可能</div>
              </div>
            </div>
          }

          <!-- Gitea設定 -->
          @if (providerType === 'gitea') {
            <div class="provider-config" formGroupName="giteaConfig">
              <h3 class="config-title">Giteaリポジトリ設定</h3>

              <app-git-project-selector
                providerType="gitea"
                [providerName]="providerName"
                (projectSelected)="onGiteaProjectSelected($event)">
              </app-git-project-selector>

              <div class="form-group">
                <label class="form-label">参照（ブランチ/タグ）</label>
                <input type="text" class="form-input" formControlName="ref"
                       placeholder="main, develop">
              </div>

              <div class="form-group">
                <label class="form-label">ファイルパターン（任意）</label>
                <input type="text" class="form-input" formControlName="filePatterns"
                       placeholder="src/**/*.ts">
              </div>
            </div>
          }

          <!-- Confluence設定 -->
          @if (providerType === 'confluence') {
            <div class="provider-config" formGroupName="confluenceConfig">
              <h3 class="config-title">Confluenceスペース/ページ設定</h3>

              <div class="form-group">
                <label class="form-label">スペース<span class="required">*</span></label>
                <input type="text" class="form-input" formControlName="spaceKey"
                       placeholder="DEV, DOCS など">
              </div>

              <div class="form-group">
                <label class="form-label">対象ページ</label>
                <div class="radio-group">
                  <label class="radio-item" [class.selected]="confluencePageMode === 'all'">
                    <input type="radio" name="confluence-pages" value="all"
                           [(ngModel)]="confluencePageMode" [ngModelOptions]="{standalone: true}">
                    全ページ
                  </label>
                  <label class="radio-item" [class.selected]="confluencePageMode === 'select'">
                    <input type="radio" name="confluence-pages" value="select"
                           [(ngModel)]="confluencePageMode" [ngModelOptions]="{standalone: true}">
                    選択したページ
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">ラベルフィルター</label>
                <div class="tags-input-container">
                  @for (label of confluenceLabels; track label) {
                    <span class="tag">
                      {{ label }}
                      <span class="tag-remove" (click)="removeConfluenceLabel(label)">&times;</span>
                    </span>
                  }
                  <input type="text" class="tags-input"
                         placeholder="ラベルを入力..."
                         (keydown.enter)="addConfluenceLabel($event)">
                </div>
                <div class="form-hint">指定したラベルを持つページのみを取得</div>
              </div>

              <div class="form-group">
                <label class="form-label">更新日フィルター</label>
                <select class="form-select" formControlName="updateFilter">
                  <option value="">指定なし</option>
                  <option value="week">過去1週間に更新</option>
                  <option value="month">過去1ヶ月に更新</option>
                  <option value="quarter">過去3ヶ月に更新</option>
                </select>
              </div>
            </div>
          }

          <!-- Web設定 -->
          @if (providerType === 'web') {
            <div class="provider-config" formGroupName="webConfig">
              <h3 class="config-title">Webリソース取得設定</h3>

              <div class="form-group">
                <label class="form-label">リソースタイプ</label>
                <div class="radio-group">
                  <label class="radio-item" [class.selected]="form.get('webConfig.sourceType')?.value === 'url'">
                    <input type="radio" formControlName="sourceType" value="url">
                    Webページ
                  </label>
                  <label class="radio-item" [class.selected]="form.get('webConfig.sourceType')?.value === 'rss'">
                    <input type="radio" formControlName="sourceType" value="rss">
                    RSS/Atom
                  </label>
                  <label class="radio-item" [class.selected]="form.get('webConfig.sourceType')?.value === 'api'">
                    <input type="radio" formControlName="sourceType" value="api">
                    REST API
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">URL<span class="required">*</span></label>
                <textarea class="form-textarea" formControlName="urls" rows="3"
                          placeholder="https://docs.example.com/guide&#10;https://wiki.example.com/api"></textarea>
                <div class="form-hint">1行に1つのURLを入力</div>
              </div>

              <div class="form-group">
                <label class="form-label">取得方法</label>
                <select class="form-select" formControlName="fetchMethod">
                  <option value="full">ページ全体</option>
                  <option value="main">メインコンテンツのみ</option>
                  <option value="selector">CSSセレクター指定</option>
                </select>
              </div>

              @if (form.get('webConfig.fetchMethod')?.value === 'selector') {
                <div class="form-group">
                  <label class="form-label">CSSセレクター</label>
                  <input type="text" class="form-input" formControlName="cssSelector"
                         placeholder="例: article.main-content, #content">
                  <div class="form-hint">特定の要素のみを取得する場合に指定</div>
                </div>
              }

              <div class="form-group">
                <label class="form-label">更新頻度</label>
                <select class="form-select" formControlName="updateFrequency">
                  <option value="manual">手動のみ</option>
                  <option value="hourly">1時間ごと</option>
                  <option value="daily">1日ごと</option>
                  <option value="weekly">週1回</option>
                </select>
              </div>

              <!-- 詳細オプション -->
              <div class="options-toggle" (click)="showWebAdvanced = !showWebAdvanced">
                <span>{{ showWebAdvanced ? '▼' : '▶' }}</span> 詳細オプション
              </div>
              @if (showWebAdvanced) {
                <div class="advanced-options">
                  <div class="form-group">
                    <label class="form-label">認証設定</label>
                    <select class="form-select" formControlName="authType">
                      <option value="none">なし</option>
                      <option value="basic">Basic認証</option>
                      <option value="bearer">Bearer Token</option>
                      <option value="api-key">API Key</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">リンク追跡</label>
                    <div class="checkbox-group">
                      <label class="checkbox-item">
                        <input type="checkbox" formControlName="followLinks">
                        ページ内リンクを追跡
                      </label>
                    </div>
                    <div class="range-container" style="margin-top: 8px;">
                      <span>最大深さ:</span>
                      <input type="range" class="range-slider" min="1" max="5"
                             formControlName="linkDepth" style="flex: 1;">
                      <span class="range-value">{{ form.get('webConfig.linkDepth')?.value || 2 }}</span>
                    </div>
                  </div>
                </div>
              }

              <div class="preview-card">
                <div class="preview-title">プレビュー</div>
                <div class="preview-content">
                  URLを入力すると、取得されるコンテンツのプレビューが表示されます
                </div>
              </div>
            </div>
          }

          <!-- ローカルファイル設定 -->
          @if (providerType === 'local') {
            <div class="provider-config">
              <h3 class="config-title">ファイル/ディレクトリ アップロード</h3>

              <div class="form-group">
                <div class="upload-zone" (click)="triggerFileInput()"
                     (dragover)="onDragOver($event)"
                     (dragleave)="onDragLeave($event)"
                     (drop)="onDrop($event)"
                     [class.dragover]="isDragOver">
                  <div class="upload-icon">📤</div>
                  <div class="upload-text">ファイルをドラッグ＆ドロップ</div>
                  <div class="upload-hint">または</div>
                  <button type="button" class="btn-browse">ファイルを選択</button>
                  <div class="upload-hint" style="margin-top: 16px;">
                    対応形式: PDF, Word, Excel, PowerPoint, 画像, ZIP<br>
                    最大サイズ: 100MB / ファイル
                  </div>
                </div>
                <input type="file" #fileInput style="display: none;"
                       multiple (change)="onFileSelected($event)">
              </div>

              @if (uploadedFiles.length > 0) {
                <div class="uploaded-files">
                  @for (file of uploadedFiles; track file.name) {
                    <div class="uploaded-file">
                      <span class="uploaded-file-icon">📄</span>
                      <div class="uploaded-file-info">
                        <div class="uploaded-file-name">{{ file.name }}</div>
                        <div class="uploaded-file-size">{{ formatFileSize(file.size) }}</div>
                      </div>
                      <span class="uploaded-file-remove" (click)="removeUploadedFile(file)">&times;</span>
                    </div>
                  }
                </div>
              }

              <div class="form-group">
                <label class="form-label">タグ</label>
                <div class="tags-input-container">
                  @for (tag of fileTags; track tag) {
                    <span class="tag">
                      {{ tag }}
                      <span class="tag-remove" (click)="removeFileTag(tag)">&times;</span>
                    </span>
                  }
                  <input type="text" class="tags-input"
                         placeholder="タグを入力してEnter..."
                         (keydown.enter)="addFileTag($event)">
                </div>
              </div>
            </div>
          }
        </form>
      </div>

      <!-- Footer -->
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" mat-dialog-close>キャンセル</button>
        <button type="button" class="btn btn-primary"
                [disabled]="!form.valid || isSaving"
                (click)="save()">
          @if (isSaving) {
            <mat-spinner diameter="20" class="inline-spinner"></mat-spinner>
          } @else {
            {{ data.mode === 'create' ? '登録' : '保存' }}
          }
        </button>
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
      --border-color: #3a3f4a;
      --error-color: #ea4335;
    }

    .modal-container {
      display: flex;
      flex-direction: column;
      max-height: calc(100vh - 80px); /* 余白固定 (上下40pxずつ) */
      background-color: var(--bg-card);
      color: var(--text-primary);
    }

    /* Header */
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .modal-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 600;
      flex: 1;
      min-width: 0;
    }

    .modal-title-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }

    /* ヘッダー内パンくず */
    .header-breadcrumb {
      display: flex;
      align-items: center;
      gap: 2px;
      overflow: hidden;
      flex: 1;
      min-width: 0;

      .sep {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--text-muted, #555);
        flex-shrink: 0;
      }

      .crumb {
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 400;
        color: var(--text-secondary, #8b929a);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.1s;

        &:hover {
          background: var(--bg-hover, rgba(255,255,255,0.05));
          color: var(--text-primary, #fff);
        }

        &.root {
          font-weight: 500;
        }

        &.current {
          color: var(--primary-color, #1a73e8);
          font-weight: 500;
        }
      }
    }

    .modal-close {
      width: 28px;
      height: 28px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 6px;
      font-size: 20px;
      line-height: 1;
      transition: all 0.2s;

      &:hover {
        background-color: var(--bg-input);
        color: var(--text-primary);
      }
    }

    /* Body */
    .modal-body {
      flex: 1;
      padding: 12px 16px;
      overflow: hidden; /* 外側のスクロールは使わない。各セレクター内でスクロール */
      display: flex;
      flex-direction: column;
    }

    .resource-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
      min-height: 0; /* flexboxで子要素がスクロールできるように */
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .form-label {
      font-weight: 500;
      font-size: 12px;

      .required {
        color: var(--error-color);
        margin-left: 4px;
      }
    }

    .form-hint {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .form-input,
    .form-select,
    .form-textarea {
      width: 100%;
      padding: 8px 12px;
      background-color: var(--bg-input);
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
        color: var(--text-secondary);
      }
    }

    .form-textarea {
      resize: vertical;
      min-height: 60px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .form-row-wide {
      display: flex;
      gap: 12px;
      align-items: flex-start;

      .form-group {
        flex: 1;
      }

      .flex-2 { flex: 2; }
      .flex-3 { flex: 3; }
    }

    /* Inline period chips */
    .period-options-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .period-chip {
      padding: 6px 12px;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        border-color: var(--primary-color);
      }

      &.selected {
        background-color: var(--primary-color);
        border-color: var(--primary-color);
        color: white;
      }
    }

    /* Inline tags */
    .tags-input-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 12px;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      min-height: 40px;
      align-items: center;

      .tags-input {
        flex: 1;
        min-width: 80px;
      }
    }

    .tag-small {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background-color: var(--primary-color);
      border-radius: 12px;
      font-size: 11px;
      color: white;

      .tag-remove {
        cursor: pointer;
        opacity: 0.7;
        &:hover { opacity: 1; }
      }
    }

    /* Inline checkboxes */
    .checkbox-inline {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }

    .checkbox-item-inline {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      cursor: pointer;

      input { accent-color: var(--primary-color); }
    }

    .advanced-options-inline {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background-color: rgba(26, 115, 232, 0.05);
      border-radius: 8px;

      .form-label {
        margin: 0;
        white-space: nowrap;
      }
    }

    /* オプションバー (横並び) */
    .options-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--bg-input, rgba(255,255,255,0.03));
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 8px;
      margin-top: 12px;
    }

    .option-item {
      display: flex;
      align-items: center;
      gap: 8px;

      &.flex-2 { flex: 2; }

      .option-label {
        font-size: 12px;
        color: var(--text-secondary, #8b929a);
        white-space: nowrap;
      }

      .option-input {
        flex: 1;
        padding: 6px 10px;
        background: var(--bg-dark, #1e2128);
        border: 1px solid var(--border-color, #3a3f4a);
        border-radius: 4px;
        color: var(--text-primary, #fff);
        font-size: 12px;

        &::placeholder { color: var(--text-muted, #666); }
        &:focus { outline: none; border-color: var(--primary-color, #1a73e8); }
      }
    }

    .range-inline {
      display: flex;
      align-items: center;
      gap: 8px;

      input[type="range"] {
        width: 80px;
        height: 4px;
        accent-color: var(--primary-color, #1a73e8);
      }

      .range-val {
        font-size: 12px;
        color: var(--text-primary, #fff);
        min-width: 32px;
        text-align: right;
      }
    }

    .provider-config--compact {
      gap: 12px;
    }

    /* Provider Config */
    .provider-config {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 8px;
      flex: 1;
      min-height: 0; /* flexboxで子要素がスクロールできるように */
    }

    .config-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-secondary);
      margin: 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }

    /* Checkbox / Radio */
    .checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 8px;

      &.horizontal {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 16px;
      }
    }

    .checkbox-item,
    .radio-item {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;

      input {
        accent-color: var(--primary-color);
      }
    }

    .radio-group {
      display: flex;
      gap: 8px;
    }

    .radio-item {
      padding: 10px 16px;
      background-color: var(--bg-input);
      border-radius: 8px;
      border: 2px solid transparent;
      transition: all 0.2s;

      &.selected {
        border-color: var(--primary-color);
        background-color: rgba(26, 115, 232, 0.1);
      }
    }

    /* Tags Input */
    .tags-input-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      background-color: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      min-height: 48px;
    }

    .tag {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background-color: var(--primary-color);
      border-radius: 16px;
      font-size: 13px;
    }

    .tag-remove {
      cursor: pointer;
      opacity: 0.7;

      &:hover {
        opacity: 1;
      }
    }

    .tags-input {
      flex: 1;
      min-width: 100px;
      border: none;
      background: transparent;
      color: var(--text-primary);
      outline: none;
      font-size: 14px;

      &::placeholder {
        color: var(--text-secondary);
      }
    }

    /* Period Options */
    .period-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .period-option {
      padding: 10px;
      background-color: var(--bg-input);
      border: 2px solid transparent;
      border-radius: 8px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 13px;

      &:hover {
        border-color: var(--border-color);
      }

      &.selected {
        border-color: var(--primary-color);
        background-color: rgba(26, 115, 232, 0.1);
      }
    }

    /* Range Slider */
    .range-container {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .range-slider {
      flex: 1;
      -webkit-appearance: none;
      height: 6px;
      background: var(--bg-input);
      border-radius: 3px;
      outline: none;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        background: var(--primary-color);
        border-radius: 50%;
        cursor: pointer;
      }
    }

    .range-value {
      min-width: 60px;
      text-align: center;
      padding: 6px 12px;
      background-color: var(--bg-input);
      border-radius: 6px;
      font-weight: 500;
      font-size: 13px;
    }

    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      background-color: var(--bg-input);
      padding: 4px;
      border-radius: 10px;
    }

    .tab-btn {
      flex: 1;
      padding: 10px 16px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;

      &.active {
        background-color: var(--bg-card);
        color: var(--text-primary);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      &:hover:not(.active) {
        color: var(--text-primary);
      }
    }

    /* Upload Zone */
    .upload-zone {
      border: 2px dashed var(--border-color);
      border-radius: 12px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;

      &:hover,
      &.dragover {
        border-color: var(--primary-color);
        background-color: rgba(26, 115, 232, 0.05);
      }
    }

    .upload-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.6;
    }

    .upload-text {
      font-size: 16px;
      margin-bottom: 8px;
    }

    .upload-hint {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .btn-browse {
      margin-top: 16px;
      padding: 10px 24px;
      background-color: var(--primary-color);
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: background-color 0.2s;

      &:hover {
        background-color: var(--primary-dark);
      }
    }

    .uploaded-files {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 16px;
    }

    .uploaded-file {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background-color: var(--bg-input);
      border-radius: 8px;
    }

    .uploaded-file-icon {
      font-size: 24px;
    }

    .uploaded-file-info {
      flex: 1;
    }

    .uploaded-file-name {
      font-weight: 500;
      margin-bottom: 2px;
    }

    .uploaded-file-size {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .uploaded-file-remove {
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px 8px;
      font-size: 18px;

      &:hover {
        color: var(--error-color);
      }
    }

    /* Advanced Options */
    .options-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--primary-color);
      cursor: pointer;
      font-size: 14px;

      &:hover {
        text-decoration: underline;
      }
    }

    .advanced-options {
      padding: 16px;
      background-color: rgba(26, 115, 232, 0.05);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* Preview */
    .preview-card {
      background-color: var(--bg-input);
      border-radius: 8px;
      padding: 16px;
      margin-top: 8px;
    }

    .preview-title {
      font-size: 12px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .preview-content {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    /* Footer */
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid var(--border-color);
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn-secondary {
      background-color: var(--bg-input);
      color: var(--text-primary);

      &:hover {
        background-color: #4a4f5a;
      }
    }

    .btn-primary {
      background-color: var(--primary-color);
      color: white;

      &:hover:not(:disabled) {
        background-color: var(--primary-dark);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    .inline-spinner {
      display: inline-block;
    }

    @media (max-width: 600px) {
      .form-row {
        grid-template-columns: 1fr;
      }

      .radio-group {
        flex-direction: column;
      }

      .period-options {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `]
})
export class ContextHubResourceDialogComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly contextHubService = inject(ContextHubService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ContextHubResourceDialogComponent>);

  private destroy$ = new Subject<void>();

  form!: FormGroup;
  isSaving = false;

  providerType: ContextResourceProviderType;
  providerName: string;

  // UI状態
  showMattermostAdvanced = false;
  showWebAdvanced = false;
  jiraTabMode: 'simple' | 'jql' = 'simple';
  confluencePageMode: 'all' | 'select' = 'all';
  isDragOver = false;

  // タグ管理
  keywordTags: string[] = [];
  gitlabBranches: string[] = ['main', 'develop'];
  confluenceLabels: string[] = [];
  fileTags: string[] = [];
  uploadedFiles: File[] = [];

  // 期間オプション
  periodOptions = [
    { value: 1, label: '今日' },
    { value: 7, label: '今週' },
    { value: 30, label: '今月' },
    { value: 90, label: '今四半期' },
    { value: 365, label: '今年' },
    { value: 0, label: 'カスタム' },
  ];

  // Boxパンくず
  @ViewChild('boxSelector') boxSelector?: BoxFolderSelectorComponent;
  boxBreadcrumbs: BoxBreadcrumb[] = [];
  boxSourceType: 'root' | 'collection' | 'search' = 'root';

  readonly depthOptions = DEPTH_OPTIONS;
  readonly jiraFieldOptions = JIRA_FIELD_OPTIONS;

  private selectedJiraFields: Set<JiraIncludeField> = new Set(['summary', 'description']);

  constructor(@Inject(MAT_DIALOG_DATA) public data: ResourceDialogData) {
    this.providerType = data.resource?.providerType || data.providerType || 'local';
    this.providerName = data.resource?.providerName || data.providerName || '';
  }

  ngOnInit(): void {
    this.initForm();

    if (this.data.mode === 'edit' && this.data.resource) {
      this.populateForm(this.data.resource);
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

      // Box
      boxConfig: this.fb.group({
        folderId: [''],
        folderPath: [''],
        depthType: ['limited'],
        depthValue: [3],
        filePatterns: [''],
        maxFileSizeMB: [50],
      }),

      // Confluence
      confluenceConfig: this.fb.group({
        spaceKey: [''],
        pageId: [''],
        depthType: ['unlimited'],
        depthValue: [2],
        labels: [''],
        includeAttachments: [false],
        updateFilter: ['month'],
      }),

      // Jira
      jiraConfig: this.fb.group({
        queryType: ['project'],
        projectKey: [''],
        jql: [''],
        maxResults: [100],
        sprint: ['current'],
        assignee: [''],
      }),

      // GitLab
      gitlabConfig: this.fb.group({
        projectId: [''],
        ref: [''],
        filePatterns: [''],
        excludePatterns: ['node_modules, dist, .git'],
      }),

      // Gitea
      giteaConfig: this.fb.group({
        owner: [''],
        repo: [''],
        ref: [''],
        filePatterns: [''],
        excludePatterns: ['node_modules, dist, .git'],
      }),

      // Mattermost
      mattermostConfig: this.fb.group({
        sourceType: ['channel'],
        teamId: [''],
        channelIds: [''],
        timelineId: [''],
        rangeType: ['period'],
        periodDays: [30],
        messageCount: [100],
      }),

      // Web
      webConfig: this.fb.group({
        sourceType: ['url'],
        urls: [''],
        sitelistPath: [''],
        depthType: ['none'],
        depthValue: [2],
        fetchMethod: ['full'],
        cssSelector: [''],
        updateFrequency: ['daily'],
        authType: ['none'],
        followLinks: [false],
        linkDepth: [2],
        domainPolicyType: ['same'],
        allowedDomains: [''],
        respectRobotsTxt: [true],
        skipNoIndex: [false],
        excludePatterns: [''],
        requestIntervalSeconds: [1],
      }),
    });
  }

  private populateForm(resource: ContextResourceForView): void {
    this.form.patchValue({
      label: resource.label,
      description: resource.description || '',
    });

    const config = resource.config as any;

    switch (resource.providerType) {
      case 'box':
        this.form.patchValue({
          boxConfig: {
            folderId: config.folderId,
            folderPath: config.folderPath,
            depthType: config.depth?.type || 'limited',
            depthValue: config.depth?.depth || 3,
            filePatterns: config.filePatterns?.join(', ') || '',
            maxFileSizeMB: config.maxFileSizeMB || 50,
          }
        });
        break;

      case 'mattermost':
        this.form.patchValue({
          mattermostConfig: {
            sourceType: config.sourceType,
            teamId: config.teamId,
            channelIds: config.channelIds?.join(', ') || '',
            timelineId: config.timelineId || '',
            rangeType: config.rangeType,
            periodDays: config.periodDays || 30,
            messageCount: config.messageCount || 100,
          }
        });
        break;

      // 他のプロバイダーも同様に実装...
    }
  }

  getDialogTitle(): string {
    const action = this.data.mode === 'create' ? '追加' : '編集';
    const labels: Record<ContextResourceProviderType, string> = {
      local: 'ファイル/ディレクトリ',
      box: 'Box',
      confluence: 'Confluence',
      jira: 'Jira',
      gitlab: 'GitLab',
      gitea: 'Gitea',
      mattermost: 'Mattermost',
      web: 'Webリソース',
    };
    return `${labels[this.providerType]} リソース${action}`;
  }

  getProviderEmoji(): string {
    const emojis: Record<ContextResourceProviderType, string> = {
      local: '📁',
      box: '📦',
      confluence: '📖',
      jira: '📋',
      gitlab: '🦊',
      gitea: '🍵',
      mattermost: '💬',
      web: '🌐',
    };
    return emojis[this.providerType];
  }

  getProviderColor(): string {
    const colors: Record<ContextResourceProviderType, string> = {
      mattermost: '#0058cc',
      box: '#0061d5',
      jira: '#0052cc',
      gitlab: '#fc6d26',
      gitea: '#609926',
      confluence: '#0052cc',
      local: '#7c4dff',
      web: '#00bcd4',
    };
    return colors[this.providerType] || '#1a73e8';
  }

  getLabelPlaceholder(): string {
    const placeholders: Record<ContextResourceProviderType, string> = {
      local: '例: 設計ドキュメント',
      box: '例: プロジェクトドキュメント',
      confluence: '例: プロジェクトWiki',
      jira: '例: 現在のスプリントタスク',
      gitlab: '例: メインリポジトリ',
      gitea: '例: バックエンドリポジトリ',
      mattermost: '例: 開発チームの会話',
      web: '例: 技術ブログ',
    };
    return placeholders[this.providerType] || '例: リソース名';
  }

  // Box
  onBoxFolderSelected(event: { folderId: string; folderPath: string; selectedItems?: { id: string; name: string; type: 'folder' | 'file' }[] }): void {
    this.form.patchValue({
      boxConfig: {
        folderId: event.folderId,
        folderPath: event.folderPath,
        selectedItems: event.selectedItems || [],
      }
    });
  }

  onDepthChange(event: Event): void {
    // 深度変更時の処理
  }

  // Mattermost
  onMattermostSelectionChanged(selection: MattermostSelection): void {
    this.form.patchValue({
      mattermostConfig: {
        sourceType: selection.sourceType,
        teamId: selection.teamId,
        channelIds: selection.channelIds?.join(', ') || '',
        timelineId: selection.timelineId || '',
      }
    });

    if (!this.form.get('label')?.value) {
      if (selection.sourceType === 'timeline' && selection.timelineName) {
        this.form.patchValue({ label: selection.timelineName });
      } else if (selection.channelNames && selection.channelNames.length > 0) {
        this.form.patchValue({ label: selection.channelNames.join(', ') });
      }
    }
  }

  selectPeriod(days: number): void {
    this.form.patchValue({
      mattermostConfig: { periodDays: days }
    });
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

  // GitLab
  onGitProjectSelected(selection: GitProjectSelection | undefined): void {
    if (!selection) {
      this.form.patchValue({
        gitlabConfig: { projectId: '', projectPath: '' }
      });
      return;
    }

    this.form.patchValue({
      gitlabConfig: {
        projectId: selection.projectId,
        projectPath: selection.projectPath,
        ref: selection.defaultBranch || '',
      }
    });

    if (!this.form.get('label')?.value) {
      this.form.patchValue({ label: selection.projectPath });
    }
  }

  addGitlabBranch(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (value && !this.gitlabBranches.includes(value)) {
      this.gitlabBranches.push(value);
      input.value = '';
    }
    event.preventDefault();
  }

  removeGitlabBranch(branch: string): void {
    this.gitlabBranches = this.gitlabBranches.filter(b => b !== branch);
  }

  // Gitea
  onGiteaProjectSelected(selection: GitProjectSelection | undefined): void {
    if (!selection) {
      this.form.patchValue({
        giteaConfig: { owner: '', repo: '' }
      });
      return;
    }

    this.form.patchValue({
      giteaConfig: {
        owner: selection.owner || '',
        repo: selection.repo || '',
        ref: selection.defaultBranch || '',
      }
    });

    if (!this.form.get('label')?.value) {
      this.form.patchValue({ label: selection.projectPath });
    }
  }

  // Confluence
  addConfluenceLabel(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (value && !this.confluenceLabels.includes(value)) {
      this.confluenceLabels.push(value);
      input.value = '';
    }
    event.preventDefault();
  }

  removeConfluenceLabel(label: string): void {
    this.confluenceLabels = this.confluenceLabels.filter(l => l !== label);
  }

  // ファイルアップロード
  triggerFileInput(): void {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fileInput?.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.uploadedFiles = [...this.uploadedFiles, ...Array.from(input.files)];
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    if (event.dataTransfer?.files) {
      this.uploadedFiles = [...this.uploadedFiles, ...Array.from(event.dataTransfer.files)];
    }
  }

  removeUploadedFile(file: File): void {
    this.uploadedFiles = this.uploadedFiles.filter(f => f !== file);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  addFileTag(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.trim();
    if (value && !this.fileTags.includes(value)) {
      this.fileTags.push(value);
      input.value = '';
    }
    event.preventDefault();
  }

  removeFileTag(tag: string): void {
    this.fileTags = this.fileTags.filter(t => t !== tag);
  }

  // ヘルパー
  private parseCommaSeparated(value: string): string[] {
    if (!value?.trim()) return [];
    return value.split(',').map(s => s.trim()).filter(s => s);
  }

  private parseNewlineSeparated(value: string): string[] {
    if (!value?.trim()) return [];
    return value.split('\n').map(s => s.trim()).filter(s => s);
  }

  private buildDepthConfig(type: string, depth: number): DepthConfig {
    return {
      type: type as DepthConfig['type'],
      depth: type === 'limited' ? depth : undefined,
    };
  }

  private buildConfig(): any {
    const formValue = this.form.value;

    switch (this.providerType) {
      case 'box': {
        const c = formValue.boxConfig;
        return {
          folderId: c.folderId,
          folderPath: c.folderPath,
          depth: this.buildDepthConfig(c.depthType, c.depthValue),
          filePatterns: this.parseCommaSeparated(c.filePatterns),
          maxFileSizeMB: c.maxFileSizeMB,
        } as BoxResourceConfig;
      }

      case 'mattermost': {
        const c = formValue.mattermostConfig;
        return {
          sourceType: c.sourceType,
          teamId: c.teamId,
          channelIds: c.sourceType === 'channel' ? this.parseCommaSeparated(c.channelIds) : undefined,
          timelineId: c.sourceType === 'timeline' ? c.timelineId : undefined,
          rangeType: c.rangeType,
          periodDays: c.rangeType === 'period' ? c.periodDays : undefined,
          messageCount: c.rangeType === 'count' ? c.messageCount : undefined,
        } as MattermostResourceConfig;
      }

      case 'jira': {
        const c = formValue.jiraConfig;
        return {
          queryType: this.jiraTabMode === 'jql' ? 'jql' : 'project',
          projectKey: this.jiraTabMode === 'simple' ? c.projectKey : undefined,
          jql: this.jiraTabMode === 'jql' ? c.jql : undefined,
          maxResults: c.maxResults,
          includeFields: Array.from(this.selectedJiraFields),
        } as JiraResourceConfig;
      }

      case 'gitlab': {
        const c = formValue.gitlabConfig;
        return {
          projectId: Number(c.projectId),
          ref: c.ref || undefined,
          filePatterns: this.parseCommaSeparated(c.filePatterns),
          excludePatterns: this.parseCommaSeparated(c.excludePatterns),
        } as GitLabResourceConfig;
      }

      case 'gitea': {
        const c = formValue.giteaConfig;
        return {
          owner: c.owner,
          repo: c.repo,
          ref: c.ref || undefined,
          filePatterns: this.parseCommaSeparated(c.filePatterns),
          excludePatterns: this.parseCommaSeparated(c.excludePatterns),
        } as GiteaResourceConfig;
      }

      case 'confluence': {
        const c = formValue.confluenceConfig;
        return {
          spaceKey: c.spaceKey,
          pageId: c.pageId || undefined,
          depth: this.buildDepthConfig(c.depthType, c.depthValue),
          labels: this.confluenceLabels,
          includeAttachments: c.includeAttachments,
        } as ConfluenceResourceConfig;
      }

      case 'web': {
        const c = formValue.webConfig;
        return {
          sourceType: c.sourceType,
          urls: this.parseNewlineSeparated(c.urls),
          sitelistPath: c.sitelistPath || undefined,
          depth: this.buildDepthConfig(c.depthType, c.depthValue),
          domainPolicy: {
            type: c.domainPolicyType,
            allowedDomains: c.domainPolicyType === 'allowlist'
              ? this.parseCommaSeparated(c.allowedDomains)
              : undefined,
          },
          respectRobotsTxt: c.respectRobotsTxt,
          skipNoIndex: c.skipNoIndex,
          excludePatterns: this.parseCommaSeparated(c.excludePatterns),
          requestIntervalSeconds: c.requestIntervalSeconds,
        } as WebResourceConfig;
      }

      default:
        return {};
    }
  }

  save(): void {
    if (!this.form.valid) return;

    this.isSaving = true;
    const formValue = this.form.value;
    const config = this.buildConfig();

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

  // Boxパンくず操作
  onBoxPathChanged(event: BoxPathChange): void {
    this.boxSourceType = event.sourceType;
    this.boxBreadcrumbs = event.breadcrumbs;
  }

  onBreadcrumbRootClick(): void {
    this.boxSelector?.navigateToRoot();
  }

  onBreadcrumbClick(index: number): void {
    this.boxSelector?.navigateToBreadcrumbByIndex(index);
  }
}
