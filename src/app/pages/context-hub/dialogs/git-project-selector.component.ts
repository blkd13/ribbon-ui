import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { FlatTreeControl } from '@angular/cdk/tree';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeFlatDataSource, MatTreeFlattener, MatTreeModule } from '@angular/material/tree';

import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ApiGiteaService, GiteaRepository } from '../../../services/api-gitea.service';
import { ApiGitlabService, GitLabGroup, GitLabProject, GitLabUser } from '../../../services/api-gitlab.service';

export type GitProviderType = 'gitlab' | 'gitea';
export type SearchScope = 'project' | 'group' | 'user';

interface GitNode {
  id: string | number;
  name: string;
  type: 'group' | 'user' | 'project';
  fullPath?: string;
  defaultBranch?: string;
  children?: GitNode[];
  isLoading?: boolean;
  _userId?: number;  // ユーザーノードの実際のID
}

interface FlatGitNode {
  id: string | number;
  name: string;
  type: 'group' | 'user' | 'project';
  fullPath?: string;
  defaultBranch?: string;
  level: number;
  expandable: boolean;
  isLoading: boolean;
  _userId?: number;  // ユーザーノードの実際のID
}

export interface GitProjectSelection {
  projectId: number;
  projectPath: string;
  owner?: string;
  repo?: string;
  defaultBranch?: string;
}

@Component({
  selector: 'app-git-project-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatTabsModule,
  ],
  template: `
    <div class="git-project-selector">
      <!-- 選択済みプロジェクト表示 -->
      @if (selectedProject) {
        <div class="selected-project">
          <mat-icon>check_circle</mat-icon>
          <span class="project-path">{{ selectedProject.projectPath }}</span>
          <button mat-icon-button (click)="clearSelection()" matTooltip="選択解除">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      <!-- 検索バー -->
      <div class="search-section">
        <div class="search-bar">
          <mat-icon class="search-icon">search</mat-icon>
          <input type="text"
                 [(ngModel)]="searchQuery"
                 (keyup.enter)="search()"
                 placeholder="プロジェクト・グループ・ユーザーを検索..."
                 class="search-input">
          @if (searchQuery) {
            <button class="clear-btn" (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          }
          <button class="search-btn" (click)="search()" [disabled]="!searchQuery || isSearching">
            @if (isSearching) {
              <mat-spinner diameter="16"></mat-spinner>
            } @else {
              <mat-icon>arrow_forward</mat-icon>
            }
          </button>
        </div>

        <div class="search-scope-chips">
          <label class="scope-chip" [class.active]="searchScopes.has('project')" (click)="toggleScope('project')">
            <mat-icon>code</mat-icon>
            <span>プロジェクト</span>
            @if (searchResultCache.project.length > 0) {
              <span class="count">{{ searchResultCache.project.length }}</span>
            }
          </label>
          <label class="scope-chip" [class.active]="searchScopes.has('group')" (click)="toggleScope('group')">
            <mat-icon>folder</mat-icon>
            <span>グループ</span>
            @if (searchResultCache.group.length > 0) {
              <span class="count">{{ searchResultCache.group.length }}</span>
            }
          </label>
          <label class="scope-chip" [class.active]="searchScopes.has('user')" (click)="toggleScope('user')">
            <mat-icon>person</mat-icon>
            <span>ユーザー</span>
            @if (searchResultCache.user.length > 0) {
              <span class="count">{{ searchResultCache.user.length }}</span>
            }
          </label>
        </div>
      </div>

      <!-- 検索結果エリア -->
      @if (hasAnySearchResults() || noSearchResults) {
        <div class="search-results-container">
          <div class="results-header">
            <mat-icon>search</mat-icon>
            <span>検索結果</span>
            <button class="close-results-btn" (click)="clearSearchResults()">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="results-list">
            <!-- プロジェクト検索結果 -->
            @if (searchScopes.has('project') && searchResults.length > 0) {
              <div class="result-section">
                <div class="section-label">
                  <mat-icon>code</mat-icon>
                  プロジェクト ({{ searchResults.length }})
                </div>
                @for (result of searchResults; track result.id) {
                  <div class="result-item project"
                       [class.selected]="isSearchResultSelected(result)"
                       (click)="selectSearchResult(result)">
                    <mat-icon class="result-icon">code</mat-icon>
                    <div class="result-info">
                      <span class="result-name">{{ getSearchResultName(result) }}</span>
                      <span class="result-path">{{ getSearchResultPath(result) }}</span>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- グループ検索結果 -->
            @if (searchScopes.has('group') && groupSearchResults.length > 0) {
              <div class="result-section">
                <div class="section-label">
                  <mat-icon>folder</mat-icon>
                  グループ ({{ groupSearchResults.length }})
                </div>
                @for (group of groupSearchResults; track group.id) {
                  <div class="result-item group" (click)="selectGroupFromSearch(group)">
                    <mat-icon class="result-icon group">folder</mat-icon>
                    <div class="result-info">
                      <span class="result-name">{{ group.name }}</span>
                      <span class="result-path">{{ group.full_path }}</span>
                    </div>
                    <mat-icon class="arrow-icon">chevron_right</mat-icon>
                  </div>
                }
              </div>
            }

            <!-- ユーザー検索結果 -->
            @if (searchScopes.has('user') && userSearchResults.length > 0) {
              <div class="result-section">
                <div class="section-label">
                  <mat-icon>person</mat-icon>
                  ユーザー ({{ userSearchResults.length }})
                </div>
                @for (user of userSearchResults; track user.id) {
                  <div class="result-item user" (click)="selectUserFromSearch(user)">
                    <mat-icon class="result-icon user">person</mat-icon>
                    <div class="result-info">
                      <span class="result-name">{{ user.name }}</span>
                      <span class="result-path">&#64;{{ user.username }}</span>
                    </div>
                    <mat-icon class="arrow-icon">chevron_right</mat-icon>
                  </div>
                }
              </div>
            }
          </div>

          @if (noSearchResults) {
            <div class="no-results">
              <mat-icon>search_off</mat-icon>
              <span>「{{ lastSearchQuery }}」に一致する結果がありません</span>
            </div>
          }
        </div>
      }

      <!-- ツリー表示 -->
      <div class="project-tree-container" [class.has-search-results]="hasAnySearchResults()">
        <div class="tree-header">
          <div class="header-title">
            @if (currentBrowsePath) {
              <button class="back-btn" (click)="goBack()" matTooltip="戻る">
                <mat-icon>arrow_back</mat-icon>
              </button>
              <span class="browse-path">{{ currentBrowsePath }}</span>
            } @else {
              <mat-icon>account_tree</mat-icon>
              <span>ブラウズ</span>
            }
          </div>
          <button mat-icon-button (click)="loadRootNodes()" matTooltip="更新" class="refresh-btn">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>

        @if (isLoading) {
          <div class="loading">
            <mat-spinner diameter="20"></mat-spinner>
            <span>読み込み中...</span>
          </div>
        } @else if (errorMessage) {
          <div class="error">
            <mat-icon>error_outline</mat-icon>
            <span>{{ errorMessage }}</span>
            <button mat-stroked-button (click)="loadRootNodes()">再試行</button>
          </div>
        } @else {
          <div class="tree-body">
            <mat-tree [dataSource]="dataSource" [treeControl]="treeControl" class="project-tree">
              <!-- プロジェクトノード（リーフ） -->
              <mat-tree-node *matTreeNodeDef="let node" matTreeNodePadding
                             [class.selected]="isSelected(node)"
                             [class.project]="node.type === 'project'"
                             (click)="selectProject(node)">
                <span class="node-indent"></span>
                <div class="node-content">
                  <mat-icon class="node-icon project">code</mat-icon>
                  <span class="node-name">{{ node.name }}</span>
                  <span class="node-path" [matTooltip]="node.fullPath">{{ node.fullPath }}</span>
                </div>
              </mat-tree-node>

              <!-- グループ/ユーザーノード（展開可能） -->
              <mat-tree-node *matTreeNodeDef="let node; when: hasChild" matTreeNodePadding
                             [class.selected]="isSelected(node)"
                             [class.group]="node.type === 'group'"
                             [class.user]="node.type === 'user'">
                <button class="toggle-btn" matTreeNodeToggle (click)="toggleNode(node)">
                  @if (node.isLoading) {
                    <mat-spinner diameter="14"></mat-spinner>
                  } @else {
                    <mat-icon>{{ treeControl.isExpanded(node) ? 'expand_more' : 'chevron_right' }}</mat-icon>
                  }
                </button>
                <div class="node-content">
                  <mat-icon class="node-icon" [class.group]="node.type === 'group'" [class.user]="node.type === 'user'">
                    {{ node.type === 'user' ? 'person' : 'folder' }}
                  </mat-icon>
                  <span class="node-name">{{ node.name }}</span>
                  <span class="node-type">{{ node.type === 'user' ? 'ユーザー' : 'グループ' }}</span>
                </div>
              </mat-tree-node>
            </mat-tree>

            @if (dataSource.data.length === 0) {
              <div class="empty-state">
                <mat-icon>folder_off</mat-icon>
                <span>項目がありません</span>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .git-project-selector {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    /* 選択済みプロジェクト */
    .selected-project {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(76, 175, 80, 0.12);
      border-radius: 6px;
      border: 1px solid rgba(76, 175, 80, 0.3);
      flex-shrink: 0;

      > mat-icon {
        color: #4caf50;
        font-size: 20px;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .project-path {
        flex: 1;
        font-size: 13px;
        font-family: 'SF Mono', Monaco, monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }

      button {
        width: 28px;
        height: 28px;
        line-height: 28px;
        flex-shrink: 0;
        mat-icon { font-size: 18px; }
      }
    }

    /* 検索セクション */
    .search-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
    }

    .search-scope-chips {
      display: flex;
      gap: 6px;
    }

    .scope-chip {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      background: transparent;
      color: rgba(255, 255, 255, 0.5);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 14px;
      transition: all 0.15s;
      user-select: none;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      .count {
        padding: 1px 5px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        font-size: 10px;
        min-width: 16px;
        text-align: center;
      }

      &:hover {
        border-color: rgba(255, 255, 255, 0.3);
        color: rgba(255, 255, 255, 0.8);
      }

      &.active {
        background: rgba(33, 150, 243, 0.15);
        border-color: rgba(33, 150, 243, 0.5);
        color: #64b5f6;

        .count {
          background: rgba(33, 150, 243, 0.3);
        }
      }
    }

    /* 検索バー */
    .search-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;

      &:focus-within {
        border-color: rgba(33, 150, 243, 0.5);
      }

      .search-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: rgba(255, 255, 255, 0.5);
        flex-shrink: 0;
      }

      .search-input {
        flex: 1;
        border: none;
        background: transparent;
        color: inherit;
        font-size: 13px;
        outline: none;
        min-width: 0;

        &::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }
      }

      .clear-btn, .search-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.6);
        flex-shrink: 0;

        &:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        &:disabled {
          opacity: 0.3;
          cursor: default;
        }

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .search-btn {
        background: rgba(33, 150, 243, 0.2);
        color: #64b5f6;
        &:hover:not(:disabled) {
          background: rgba(33, 150, 243, 0.3);
        }
      }
    }

    /* 検索結果コンテナ */
    .search-results-container {
      border: 1px solid rgba(33, 150, 243, 0.3);
      border-radius: 6px;
      background: rgba(33, 150, 243, 0.05);
      overflow: hidden;
      flex-shrink: 0;
      max-height: 280px;
      display: flex;
      flex-direction: column;

      .results-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        color: #64b5f6;
        background: rgba(33, 150, 243, 0.08);
        border-bottom: 1px solid rgba(33, 150, 243, 0.2);
        flex-shrink: 0;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }

        span {
          flex: 1;
        }

        .close-results-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          color: rgba(255, 255, 255, 0.5);

          &:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
          }

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }
      }

      .results-list {
        overflow-y: auto;
        flex: 1;
        min-height: 0;
      }

      .result-section {
        &:not(:first-child) {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
      }

      .section-label {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.5);
        background: rgba(0, 0, 0, 0.15);
        text-transform: uppercase;
        letter-spacing: 0.5px;

        mat-icon {
          font-size: 14px;
          width: 14px;
          height: 14px;
        }
      }

      .result-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        cursor: pointer;
        transition: background 0.15s;

        &:hover {
          background: rgba(33, 150, 243, 0.1);
        }

        &.selected {
          background: rgba(33, 150, 243, 0.2);
        }

        .result-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          color: #64b5f6;

          &.group { color: #ffb74d; }
          &.user { color: #ba68c8; }
        }

        .result-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .result-name {
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .result-path {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          font-family: 'SF Mono', Monaco, monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .arrow-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
          color: rgba(255, 255, 255, 0.3);
          flex-shrink: 0;
        }
      }

      .results-hint {
        padding: 8px 12px;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        background: rgba(0, 0, 0, 0.1);
        border-top: 1px solid rgba(255, 255, 255, 0.05);
      }

      .no-results {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 24px;
        color: rgba(255, 255, 255, 0.4);
        font-size: 13px;

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          opacity: 0.5;
        }
      }
    }

    /* ツリーコンテナ */
    .project-tree-container {
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 150px;

      &.has-search-results {
        max-height: 200px;
      }
    }

    .tree-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 8px 8px 12px;
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;

      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.7);
        min-width: 0;
        flex: 1;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }

        .browse-path {
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 11px;
          color: #64b5f6;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      }

      .back-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border: none;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.7);
        flex-shrink: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .refresh-btn {
        width: 28px;
        height: 28px;
        line-height: 28px;
        flex-shrink: 0;
        mat-icon { font-size: 18px; }
      }
    }

    .tree-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      min-height: 0;
    }

    .loading, .error, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 32px 16px;
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;

      mat-icon {
        font-size: 28px;
        width: 28px;
        height: 28px;
        opacity: 0.6;
      }
    }

    .error {
      color: #ef5350;
      mat-icon { color: #ef5350; }
    }

    /* ツリー本体 */
    .project-tree {
      width: 100%;

      .mat-tree-node {
        display: flex;
        align-items: center;
        min-height: 36px;
        padding: 0 8px;
        cursor: pointer;
        border-radius: 0;
        transition: background 0.15s;

        &:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        &.selected {
          background: rgba(33, 150, 243, 0.15);
        }

        &.project:hover {
          background: rgba(33, 150, 243, 0.1);
        }
      }

      .node-indent {
        width: 28px;
        flex-shrink: 0;
      }

      .toggle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: none;
        background: transparent;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.5);
        border-radius: 4px;
        flex-shrink: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
        }

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .node-content {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }

      .node-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        flex-shrink: 0;

        &.group { color: #ffb74d; }
        &.user { color: #ba68c8; }
        &.project { color: #64b5f6; }
      }

      .node-name {
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 0;
        max-width: 200px;
      }

      .node-path {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
        font-family: 'SF Mono', Monaco, monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
      }

      .node-type {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 3px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.5);
        flex-shrink: 0;
        margin-left: auto;
      }
    }

    /* Light mode overrides */
    :host-context(.light-theme) {
      .scope-chip {
        border-color: #d0d0d0;
        color: #666;

        .count {
          background: #e0e0e0;
        }

        &:hover {
          border-color: #999;
          color: #333;
        }

        &.active {
          background: rgba(33, 150, 243, 0.1);
          border-color: #1976d2;
          color: #1976d2;

          .count {
            background: rgba(33, 150, 243, 0.2);
          }
        }
      }

      .search-bar {
        background: #f5f5f5;
        border-color: #e0e0e0;

        .search-icon { color: #666; }
        .search-input {
          color: #333;
          &::placeholder { color: #999; }
        }
      }

      .search-results-container {
        border-color: rgba(33, 150, 243, 0.3);
        background: rgba(33, 150, 243, 0.02);

        .results-header {
          background: rgba(33, 150, 243, 0.05);
          border-color: rgba(33, 150, 243, 0.1);
        }

        .result-item {
          &:hover { background: rgba(33, 150, 243, 0.08); }
          &.selected { background: rgba(33, 150, 243, 0.15); }

          .result-name { color: #333; }
          .result-path { color: #666; }
          .arrow-icon { color: #999; }
        }

        .results-hint {
          background: #f5f5f5;
          color: #666;
        }
      }

      .project-tree-container {
        border-color: #e0e0e0;
      }

      .tree-header {
        background: #fafafa;
        border-color: #e0e0e0;

        .header-title { color: #666; }
        .browse-path { color: #1976d2; }
        .back-btn {
          background: #e0e0e0;
          color: #666;
          &:hover {
            background: #d0d0d0;
            color: #333;
          }
        }
      }

      .loading, .empty-state { color: #666; }
      .error { color: #d32f2f; }

      .project-tree {
        .mat-tree-node {
          &:hover { background: #f5f5f5; }
          &.selected { background: rgba(33, 150, 243, 0.1); }
        }

        .node-name { color: #333; }
        .node-path { color: #666; }
        .node-type {
          background: #e0e0e0;
          color: #666;
        }
      }
    }
  `]
})
export class GitProjectSelectorComponent implements OnInit, OnChanges {
  @Input() providerType: GitProviderType = 'gitlab';
  @Input() providerName = '';
  @Input() selectedProjectId?: number;
  @Output() projectSelected = new EventEmitter<GitProjectSelection>();

  private readonly gitlabService = inject(ApiGitlabService);
  private readonly giteaService = inject(ApiGiteaService);

  isLoading = false;
  isSearching = false;
  errorMessage = '';
  searchQuery = '';
  lastSearchQuery = '';  // 最後に検索したクエリ（キャッシュ用）
  searchScopes = new Set<SearchScope>(['project', 'group', 'user']);  // 有効なスコープ
  searchResults: (GitLabProject | GiteaRepository)[] = [];
  groupSearchResults: GitLabGroup[] = [];
  userSearchResults: GitLabUser[] = [];
  noSearchResults = false;
  selectedProject: GitProjectSelection | null = null;
  currentBrowsePath = '';
  private browseHistory: { path: string; nodes: GitNode[] }[] = [];

  // 検索結果キャッシュ（同じクエリで再取得を防ぐ）
  searchResultCache: {
    project: (GitLabProject | GiteaRepository)[];
    group: GitLabGroup[];
    user: GitLabUser[];
  } = { project: [], group: [], user: [] };
  private cachedQuery = '';  // キャッシュ済みのクエリ

  // Tree control
  private transformer = (node: GitNode, level: number): FlatGitNode => ({
    id: node.id,
    name: node.name,
    type: node.type,
    fullPath: node.fullPath,
    defaultBranch: node.defaultBranch,
    level,
    expandable: node.type === 'group' || node.type === 'user',
    isLoading: node.isLoading || false,
    _userId: node._userId,
  });

  treeControl = new FlatTreeControl<FlatGitNode>(
    node => node.level,
    node => node.expandable
  );

  private treeFlattener = new MatTreeFlattener(
    this.transformer,
    node => node.level,
    node => node.expandable,
    node => node.children
  );

  dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener);

  private dataNodes: GitNode[] = [];
  private nodeMap = new Map<string | number, GitNode>();

  hasChild = (_: number, node: FlatGitNode) => node.expandable;

  ngOnInit(): void {
    this.loadRootNodes();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['providerName'] && !changes['providerName'].firstChange) {
      this.loadRootNodes();
    }
  }

  loadRootNodes(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.clearSearchResults();
    this.currentBrowsePath = '';
    this.browseHistory = [];

    if (this.providerType === 'gitlab') {
      this.loadGitLabGroups();
    } else {
      this.loadGiteaOrgs();
    }
  }

  private loadGitLabGroups(): void {
    // グループとユーザーの両方を取得
    forkJoin([
      this.gitlabService.groupChildren(`${this.providerType}-${this.providerName}`).pipe(
        catchError(err => {
          console.error('Failed to load GitLab groups:', err);
          return of([] as (GitLabGroup | GitLabProject)[]);
        })
      ),
      this.gitlabService.usersChildren(`${this.providerType}-${this.providerName}`).pipe(
        catchError(err => {
          console.error('Failed to load GitLab users:', err);
          return of([] as (GitLabUser | GitLabProject)[]);
        })
      ),
    ]).subscribe(([groupItems, userItems]) => {
      const groupNodes: GitNode[] = (groupItems as (GitLabGroup | GitLabProject)[]).map(item => {
        const isGroup = !('default_branch' in item);
        return {
          id: item.id,
          name: item.name,
          type: isGroup ? 'group' : 'project',
          fullPath: (item as GitLabGroup).full_path || (item as GitLabProject).path_with_namespace,
          defaultBranch: (item as GitLabProject).default_branch,
          children: undefined,
        } as GitNode;
      });

      const userNodes: GitNode[] = (userItems as GitLabUser[]).map(user => ({
        id: `user-${user.id}`,  // ユーザーIDにプレフィックスを付けてグループと区別
        name: user.name || user.username,
        type: 'user',
        fullPath: user.username,
        children: undefined,
        _userId: user.id,  // 実際のユーザーIDを保持
      } as GitNode & { _userId: number }));

      const allNodes = [...groupNodes, ...userNodes];
      allNodes.forEach(node => this.nodeMap.set(node.id, node));

      this.dataNodes = allNodes;
      this.dataSource.data = allNodes;
      this.isLoading = false;

      if (allNodes.length === 0) {
        this.errorMessage = 'グループ・ユーザーが見つかりません';
      }
    });
  }

  private loadGiteaOrgs(): void {
    this.giteaService.groupChildren(`${this.providerType}-${this.providerName}`).pipe(
      map(items => {
        const nodes: GitNode[] = items.map(item => ({
          id: (item as any).id,
          name: (item as any).name || (item as any).username,
          type: 'group',
          fullPath: (item as any).key,
          children: undefined,
        } as GitNode));
        nodes.forEach(node => this.nodeMap.set(node.id, node));
        return nodes;
      }),
      catchError(err => {
        console.error('Failed to load Gitea orgs:', err);
        this.errorMessage = '組織の読み込みに失敗しました';
        return of([]);
      })
    ).subscribe(nodes => {
      this.dataNodes = nodes;
      this.dataSource.data = nodes;
      this.isLoading = false;
    });
  }

  toggleNode(node: FlatGitNode): void {
    if (this.treeControl.isExpanded(node)) {
      this.loadChildren(node);
    }
  }

  private loadChildren(node: FlatGitNode): void {
    const parentNode = this.nodeMap.get(node.id);
    if (!parentNode || parentNode.children) {
      return;
    }

    node.isLoading = true;
    this.updateDataSource();

    if (this.providerType === 'gitlab') {
      this.loadGitLabChildren(node, parentNode);
    } else {
      this.loadGiteaChildren(node, parentNode);
    }
  }

  private loadGitLabChildren(node: FlatGitNode, parentNode: GitNode): void {
    // ユーザーノードの場合はユーザーのプロジェクトを取得
    if (node.type === 'user') {
      const userId = node._userId || parentNode._userId;
      this.gitlabService.usersChildren(`${this.providerType}-${this.providerName}`, userId).pipe(
        map(items => {
          const children: GitNode[] = (items as GitLabProject[]).map(project => ({
            id: project.id,
            name: project.name,
            type: 'project',
            fullPath: project.path_with_namespace,
            defaultBranch: project.default_branch,
            children: undefined,
          } as GitNode));
          children.forEach(child => this.nodeMap.set(child.id, child));
          return children;
        }),
        catchError(err => {
          console.error('Failed to load user projects:', err);
          return of([]);
        })
      ).subscribe(children => {
        parentNode.children = children;
        node.isLoading = false;
        this.updateDataSource();
      });
      return;
    }

    // グループノードの場合はサブグループとプロジェクトを取得
    this.gitlabService.groupChildren(`${this.providerType}-${this.providerName}`, node.id as number).pipe(
      map(items => {
        const children: GitNode[] = items.map(item => {
          const isGroup = !('default_branch' in item);
          return {
            id: item.id,
            name: item.name,
            type: isGroup ? 'group' : 'project',
            fullPath: (item as GitLabGroup).full_path || (item as GitLabProject).path_with_namespace,
            defaultBranch: (item as GitLabProject).default_branch,
            children: undefined,
          } as GitNode;
        });
        children.forEach(child => this.nodeMap.set(child.id, child));
        return children;
      }),
      catchError(err => {
        console.error('Failed to load children:', err);
        return of([]);
      })
    ).subscribe(children => {
      parentNode.children = children;
      node.isLoading = false;
      this.updateDataSource();
    });
  }

  private loadGiteaChildren(node: FlatGitNode, parentNode: GitNode): void {
    this.giteaService.groupChildren(`${this.providerType}-${this.providerName}`, parentNode.fullPath).pipe(
      map(items => {
        const children: GitNode[] = (items as GiteaRepository[]).map(repo => ({
          id: repo.id,
          name: repo.name,
          type: 'project',
          fullPath: repo.full_name,
          defaultBranch: repo.default_branch,
          children: undefined,
        } as GitNode));
        children.forEach(child => this.nodeMap.set(child.id, child));
        return children;
      }),
      catchError(err => {
        console.error('Failed to load repos:', err);
        return of([]);
      })
    ).subscribe(children => {
      parentNode.children = children;
      node.isLoading = false;
      this.updateDataSource();
    });
  }

  private updateDataSource(): void {
    const data = this.dataNodes;
    this.dataSource.data = [];
    this.dataSource.data = data;
  }

  search(): void {
    const query = this.searchQuery.trim();
    if (!query) {
      this.clearSearchResults();
      return;
    }

    // クエリが変わったらキャッシュをクリア
    if (query !== this.cachedQuery) {
      this.cachedQuery = query;
      this.searchResultCache = { project: [], group: [], user: [] };
    }

    this.lastSearchQuery = query;
    this.noSearchResults = false;

    // 有効なスコープのうち、まだキャッシュにないものだけ検索
    const scopesToFetch: SearchScope[] = [];
    if (this.searchScopes.has('project') && this.searchResultCache.project.length === 0) {
      scopesToFetch.push('project');
    }
    if (this.searchScopes.has('group') && this.searchResultCache.group.length === 0) {
      scopesToFetch.push('group');
    }
    if (this.searchScopes.has('user') && this.searchResultCache.user.length === 0) {
      scopesToFetch.push('user');
    }

    if (scopesToFetch.length === 0) {
      // すべてキャッシュ済み → 表示を更新
      this.applySearchResultsFromCache();
      return;
    }

    this.isSearching = true;
    this.executeSearch(query, scopesToFetch);
  }

  private executeSearch(query: string, scopes: SearchScope[]): void {
    if (this.providerType === 'gitlab') {
      const observables: any[] = [];
      const scopeOrder: SearchScope[] = [];

      if (scopes.includes('project')) {
        observables.push(
          this.gitlabService.projects(`${this.providerType}-${this.providerName}`, undefined, { search: query }).pipe(
            catchError(() => of([]))
          )
        );
        scopeOrder.push('project');
      }
      if (scopes.includes('group')) {
        observables.push(
          this.gitlabService.searchGroups(`${this.providerType}-${this.providerName}`, query).pipe(
            catchError(() => of([]))
          )
        );
        scopeOrder.push('group');
      }
      if (scopes.includes('user')) {
        observables.push(
          this.gitlabService.searchUsers(`${this.providerType}-${this.providerName}`, query).pipe(
            catchError(() => of([]))
          )
        );
        scopeOrder.push('user');
      }

      if (observables.length === 0) {
        this.isSearching = false;
        return;
      }

      forkJoin(observables).subscribe(results => {
        results.forEach((result, i) => {
          const scope = scopeOrder[i];
          if (scope === 'project') {
            this.searchResultCache.project = result;
          } else if (scope === 'group') {
            this.searchResultCache.group = result;
          } else if (scope === 'user') {
            this.searchResultCache.user = result;
          }
        });

        this.applySearchResultsFromCache();
        this.isSearching = false;
      });
    } else {
      // Giteaの場合はプロジェクト検索のみ
      if (scopes.includes('project')) {
        this.giteaService.projects(`${this.providerType}-${this.providerName}`, undefined, { q: query }).pipe(
          catchError(() => of([]))
        ).subscribe(results => {
          this.searchResultCache.project = results;
          this.applySearchResultsFromCache();
          this.isSearching = false;
        });
      } else {
        this.isSearching = false;
      }
    }
  }

  private applySearchResultsFromCache(): void {
    // スコープがONのものだけ表示
    this.searchResults = this.searchScopes.has('project') ? this.searchResultCache.project : [];
    this.groupSearchResults = this.searchScopes.has('group') ? this.searchResultCache.group : [];
    this.userSearchResults = this.searchScopes.has('user') ? this.searchResultCache.user : [];

    // すべて空なら検索結果なし
    this.noSearchResults = this.searchResults.length === 0 &&
      this.groupSearchResults.length === 0 &&
      this.userSearchResults.length === 0;
  }

  toggleScope(scope: SearchScope): void {
    const wasEnabled = this.searchScopes.has(scope);

    if (wasEnabled) {
      // 最低1つはONにしておく
      if (this.searchScopes.size > 1) {
        this.searchScopes.delete(scope);
      }
    } else {
      this.searchScopes.add(scope);
    }

    // OFF→ONになった場合、検索クエリがあってキャッシュがなければ検索実行
    if (!wasEnabled && this.lastSearchQuery) {
      const needsFetch = (scope === 'project' && this.searchResultCache.project.length === 0) ||
        (scope === 'group' && this.searchResultCache.group.length === 0) ||
        (scope === 'user' && this.searchResultCache.user.length === 0);

      if (needsFetch && this.cachedQuery === this.lastSearchQuery) {
        this.isSearching = true;
        this.executeSearch(this.lastSearchQuery, [scope]);
      } else {
        // キャッシュがあれば表示を更新するだけ
        this.applySearchResultsFromCache();
      }
    } else {
      // 表示を更新
      this.applySearchResultsFromCache();
    }
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.clearSearchResults();
  }

  clearSearchResults(): void {
    this.searchResults = [];
    this.groupSearchResults = [];
    this.userSearchResults = [];
    this.noSearchResults = false;
    this.lastSearchQuery = '';
    this.cachedQuery = '';
    this.searchResultCache = { project: [], group: [], user: [] };
  }

  hasAnySearchResults(): boolean {
    return this.searchResults.length > 0 ||
      this.groupSearchResults.length > 0 ||
      this.userSearchResults.length > 0;
  }

  getSearchResultName(result: GitLabProject | GiteaRepository): string {
    return result.name;
  }

  selectGroupFromSearch(group: GitLabGroup): void {
    this.clearSearchResults();
    this.loadGroupContents(group.id, group.full_path);
  }

  selectUserFromSearch(user: GitLabUser): void {
    this.clearSearchResults();
    this.loadUserProjects(user.id, user.name || user.username);
  }

  private loadGroupContents(groupId: number, groupPath: string): void {
    this.isLoading = true;
    this.currentBrowsePath = groupPath;
    this.browseHistory.push({ path: this.currentBrowsePath, nodes: [...this.dataNodes] });

    this.gitlabService.groupChildren(`${this.providerType}-${this.providerName}`, groupId).pipe(
      catchError(err => {
        console.error('Failed to load group contents:', err);
        this.errorMessage = 'グループの内容を読み込めませんでした';
        return of([]);
      })
    ).subscribe(items => {
      const nodes: GitNode[] = items.map(item => {
        const isGroup = !('default_branch' in item);
        return {
          id: item.id,
          name: item.name,
          type: isGroup ? 'group' : 'project',
          fullPath: (item as GitLabGroup).full_path || (item as GitLabProject).path_with_namespace,
          defaultBranch: (item as GitLabProject).default_branch,
          children: undefined,
        } as GitNode;
      });
      nodes.forEach(node => this.nodeMap.set(node.id, node));
      this.dataNodes = nodes;
      this.dataSource.data = nodes;
      this.isLoading = false;
    });
  }

  private loadUserProjects(userId: number, userName: string): void {
    this.isLoading = true;
    this.currentBrowsePath = `@${userName}`;
    this.browseHistory.push({ path: this.currentBrowsePath, nodes: [...this.dataNodes] });

    this.gitlabService.usersChildren(`${this.providerType}-${this.providerName}`, userId).pipe(
      catchError(err => {
        console.error('Failed to load user projects:', err);
        this.errorMessage = 'ユーザーのプロジェクトを読み込めませんでした';
        return of([]);
      })
    ).subscribe(items => {
      const nodes: GitNode[] = (items as GitLabProject[]).map(project => ({
        id: project.id,
        name: project.name,
        type: 'project' as const,
        fullPath: project.path_with_namespace,
        defaultBranch: project.default_branch,
        children: undefined,
      }));
      nodes.forEach(node => this.nodeMap.set(node.id, node));
      this.dataNodes = nodes;
      this.dataSource.data = nodes;
      this.isLoading = false;
    });
  }

  goBack(): void {
    if (this.browseHistory.length > 0) {
      const previous = this.browseHistory.pop();
      if (previous) {
        this.dataNodes = previous.nodes;
        this.dataSource.data = previous.nodes;
        if (this.browseHistory.length > 0) {
          this.currentBrowsePath = this.browseHistory[this.browseHistory.length - 1].path;
        } else {
          this.currentBrowsePath = '';
        }
      }
    } else {
      this.currentBrowsePath = '';
      this.loadRootNodes();
    }
  }

  getNodeIcon(node: FlatGitNode): string {
    if (node.type === 'group') return 'folder';
    if (node.type === 'user') return 'person';
    return 'code';
  }

  isSelected(node: FlatGitNode): boolean {
    return this.selectedProject?.projectId === node.id;
  }

  isSearchResultSelected(result: GitLabProject | GiteaRepository): boolean {
    return this.selectedProject?.projectId === result.id;
  }

  getSearchResultPath(result: GitLabProject | GiteaRepository): string {
    if ('path_with_namespace' in result) {
      return result.path_with_namespace;
    }
    return result.full_name;
  }

  selectProject(node: FlatGitNode): void {
    if (node.type !== 'project') return;

    if (this.providerType === 'gitlab') {
      this.selectedProject = {
        projectId: node.id as number,
        projectPath: node.fullPath || '',
        defaultBranch: node.defaultBranch,
      };
    } else {
      const [owner, repo] = (node.fullPath || '').split('/');
      this.selectedProject = {
        projectId: node.id as number,
        projectPath: node.fullPath || '',
        owner,
        repo,
        defaultBranch: node.defaultBranch,
      };
    }

    this.projectSelected.emit(this.selectedProject);
  }

  selectSearchResult(result: GitLabProject | GiteaRepository): void {
    if ('path_with_namespace' in result) {
      // GitLab
      this.selectedProject = {
        projectId: result.id,
        projectPath: result.path_with_namespace,
        defaultBranch: result.default_branch,
      };
    } else {
      // Gitea
      const [owner, repo] = result.full_name.split('/');
      this.selectedProject = {
        projectId: result.id,
        projectPath: result.full_name,
        owner,
        repo,
        defaultBranch: result.default_branch,
      };
    }

    this.projectSelected.emit(this.selectedProject);
  }

  clearSelection(): void {
    this.selectedProject = null;
    this.projectSelected.emit(undefined);
  }
}
