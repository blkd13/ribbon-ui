import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiBoxService } from '../../../services/api-box.service';
import { ChatService } from '../../../services/chat.service';
import { ToolCallService } from '../../../services/tool-call.service';
import { of, Subject } from 'rxjs';
import { catchError, debounceTime, map, switchMap, tap, toArray } from 'rxjs/operators';

/** ソースタイプ */
type SourceType = 'root' | 'collection' | 'search';

interface BoxItem {
  id: string;
  name: string;
  type: 'folder' | 'file';
  extension?: string;
  parentId?: string;    // 親フォルダID
  path?: string;        // フルパス
  // 検索結果用の追加情報
  parentFolderName?: string;  // 親フォルダ名
  modifiedBy?: string;        // 最終更新者
}

interface ColumnData {
  parentId: string;
  parentName: string;
  parentPath: string;   // このカラムの親パス
  items: BoxItem[];
  isLoading: boolean;
  expandedId?: string;
  // ページネーション情報
  totalCount?: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  initialFillChecked?: boolean;  // 初回ビューポート埋めチェック済みフラグ
}

/** 選択されたアイテム（除外リスト付き） */
export interface SelectedEntry {
  item: BoxItem;
  excludes: BoxItem[];  // このアイテムから除外する子
}

export interface BoxSelection {
  folderId: string;
  folderPath: string;
  selectedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string }[];
  excludedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string; parentId: string }[];
}

/** パンくず情報 */
export interface BoxBreadcrumb {
  id: string;
  name: string;
  path: string;
}

/** パス変更イベント */
export interface BoxPathChange {
  sourceType: 'root' | 'collection' | 'search';
  breadcrumbs: BoxBreadcrumb[];
}

@Component({
  selector: 'app-box-folder-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="box-selector-container" (keydown)="onKeyDown($event)" tabindex="0">
      <!-- 統合ヘッダー: タブ + ナビ + 検索 + フィルター -->
      <div class="unified-header">
        <!-- 左: ソースタブ + ナビボタン -->
        <div class="header-left">
          <div class="source-tabs">
            <button class="tab-btn" [class.active]="sourceType === 'root'" (click)="switchSource('root')" matTooltip="フォルダ">
              <mat-icon>folder</mat-icon>
            </button>
            <button class="tab-btn" [class.active]="sourceType === 'collection'" (click)="switchSource('collection')" matTooltip="お気に入り">
              <mat-icon>star</mat-icon>
            </button>
          </div>
          <div class="nav-btns">
            <button class="nav-btn" (click)="navigateToRoot()" matTooltip="ルートへ">
              <mat-icon>home</mat-icon>
            </button>
            <button class="nav-btn" (click)="navigateUp()" [disabled]="breadcrumbs.length === 0" matTooltip="上へ">
              <mat-icon>arrow_upward</mat-icon>
            </button>
          </div>
        </div>
        <!-- 右: 検索 + フィルター + 更新 -->
        <div class="header-right">
          <div class="search-input-box" [class.expanded]="sourceType === 'search' || searchInputValue">
            <mat-icon class="search-icon">search</mat-icon>
            <input type="text"
                   [(ngModel)]="searchInputValue"
                   (input)="onSearchInputChange()"
                   (focus)="onSearchFocus()"
                   (keydown.enter)="executeSearch()"
                   [placeholder]="searchPlaceholder">
            @if (searchInputValue) {
              <mat-icon class="clear-icon" (click)="clearSearchInput()">close</mat-icon>
            }
            @if (searchInputValue && !isSearching) {
              <button class="search-exec-btn" (click)="executeSearch()" matTooltip="検索実行">
                <mat-icon>arrow_forward</mat-icon>
              </button>
            }
            @if (isSearching) {
              <mat-spinner diameter="16"></mat-spinner>
            }
          </div>
          <div class="filter-box">
            <mat-icon>filter_list</mat-icon>
            <input type="text" [(ngModel)]="filterQuery" (input)="onFilterChange()"
                   placeholder="フィルター">
            @if (filterQuery) {
              <mat-icon class="clear" (click)="filterQuery = ''; onFilterChange()">close</mat-icon>
            }
          </div>
          <button class="nav-btn" (click)="refresh()" matTooltip="更新">
            <mat-icon>refresh</mat-icon>
          </button>
        </div>
      </div>

      <!-- 3カラムレイアウト -->
      <div class="three-column-layout">
        <!-- 左: カラムビュー (Finder風) -->
        <div class="columns-area">
          <div class="columns-viewport" #columnsViewport (scroll)="onViewportScroll()">
            <div class="columns-track">
              @for (column of columns; track column.parentId; let colIdx = $index) {
                <div class="column" [class.active]="colIdx === columns.length - 1">
                  <div class="column-header">
                    <span class="col-title">{{ column.parentName }}</span>
                    <span class="col-badge" [class.has-more]="column.hasMore">
                      {{ getFilteredItems(column).length }}@if (column.totalCount && column.totalCount > column.items.length) {<span class="total-count">/{{ column.totalCount }}</span>}
                    </span>
                  </div>
                  <div class="column-body" (scroll)="onColumnScroll($event, colIdx)">
                    @if (column.isLoading) {
                      <div class="col-loading">
                        <mat-spinner diameter="24"></mat-spinner>
                      </div>
                    } @else if (getFilteredItems(column).length === 0) {
                      <div class="col-empty">
                        <mat-icon>{{ filterQuery ? 'search_off' : (colIdx === 0 && sourceType === 'collection' ? 'star_border' : 'folder_open') }}</mat-icon>
                        <span>{{ getEmptyMessage(column, colIdx) }}</span>
                      </div>
                    } @else {
                      @for (item of getFilteredItems(column); track item.id; let itemIdx = $index) {
                        <div class="item"
                             [class.folder]="item.type === 'folder'"
                             [class.file]="item.type === 'file'"
                             [class.expanded]="item.id === column.expandedId"
                             [class.selected]="isSelected(item)"
                             [class.excluded]="isExcluded(item)"
                             [class.implicit-selected]="canExclude(item) && !isExcluded(item)"
                             [class.focused]="focusedItemId === item.id"
                             (click)="onItemClick($event, colIdx, item)"
                             (dblclick)="onItemDblClick(colIdx, item)"
                             (mouseenter)="focusedItemId = item.id">
                          <div class="item-check" (click)="$event.stopPropagation(); toggleSelect(item)">
                            <div class="checkbox"
                                 [class.checked]="isSelected(item)"
                                 [class.excluded]="isExcluded(item)"
                                 [class.can-exclude]="canExclude(item) && !isExcluded(item)">
                              @if (isSelected(item)) {
                                <mat-icon>check</mat-icon>
                              } @else if (isExcluded(item)) {
                                <mat-icon>block</mat-icon>
                              } @else if (canExclude(item)) {
                                <mat-icon class="exclude-hint">remove</mat-icon>
                              }
                            </div>
                          </div>
                          <div class="item-icon">
                            @if (item.type === 'folder') {
                              <mat-icon class="folder-icon">folder</mat-icon>
                            } @else {
                              <span class="file-ext" [style.background]="getExtColor(item.extension)">
                                {{ item.extension || '?' }}
                              </span>
                            }
                          </div>
                          <div class="item-content">
                            <div class="item-name" [matTooltip]="item.path || item.name">{{ item.name }}</div>
                            @if (colIdx === 0 && (item.parentFolderName || item.modifiedBy)) {
                              <div class="item-meta">
                                @if (item.parentFolderName) {
                                  <span class="meta-folder" [class.meta-type]="sourceType === 'collection'">
                                    @if (sourceType === 'collection') {
                                      <mat-icon>{{ item.parentFolderName === 'お気に入り' ? 'star' : 'folder_special' }}</mat-icon>
                                    } @else {
                                      <mat-icon>folder_open</mat-icon>
                                    }
                                    {{ item.parentFolderName }}
                                  </span>
                                }
                                @if (item.modifiedBy) {
                                  <span class="meta-user">
                                    <mat-icon>person</mat-icon>
                                    {{ item.modifiedBy }}
                                  </span>
                                }
                              </div>
                            }
                          </div>
                          @if (item.type === 'folder') {
                            <mat-icon class="item-arrow">chevron_right</mat-icon>
                          }
                        </div>
                      }
                      <!-- 追加読み込みインジケーター -->
                      @if (column.isLoadingMore) {
                        <div class="load-more-indicator">
                          <mat-spinner diameter="18"></mat-spinner>
                          <span>読み込み中...</span>
                        </div>
                      } @else if (column.hasMore) {
                        <div class="load-more-hint">
                          <mat-icon>expand_more</mat-icon>
                          <span>スクロールで続きを読み込み</span>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- スクロールコントロール -->
          <div class="scroll-controls">
            <button class="scroll-btn" (click)="scrollLeft()" [disabled]="!canScrollLeft()">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <div class="scroll-indicator">
              @for (col of columns; track col.parentId; let i = $index) {
                <span class="dot" [class.active]="isColumnVisible(i)"></span>
              }
            </div>
            <button class="scroll-btn" (click)="scrollRight()" [disabled]="!canScrollRight()">
              <mat-icon>chevron_right</mat-icon>
            </button>
          </div>
        </div>

        <!-- 右: 選択済みリスト（ツリー構造） -->
        <div class="selected-column">
          <div class="column-header">
            <span class="col-title">SELECTED</span>
            <span class="col-badge selected-count">{{ selectionCount }}</span>
            @if (excludeCount > 0) {
              <span class="col-badge exclude-count">-{{ excludeCount }}</span>
            }
          </div>

          <!-- AI選択アシスト -->
          <div class="ai-assist-section">
            <div class="ai-input-row">
              <mat-icon class="ai-icon">auto_awesome</mat-icon>
              <input type="text"
                     [(ngModel)]="aiQuery"
                     placeholder="AIで選択（例: 設計書を探して）"
                     (keydown.enter)="executeAiSelect()"
                     [disabled]="isAiProcessing">
              @if (isAiProcessing) {
                <mat-spinner diameter="16"></mat-spinner>
              } @else if (aiQuery) {
                <button class="ai-send-btn" (click)="executeAiSelect()" matTooltip="AIで選択">
                  <mat-icon>send</mat-icon>
                </button>
              }
            </div>
            @if (aiError) {
              <div class="ai-error">{{ aiError }}</div>
            }
          </div>

          <div class="selected-list">
            @if (selections.length === 0) {
              <div class="empty-hint">
                <mat-icon>touch_app</mat-icon>
                <p>ファイルまたはフォルダを<br>選択してください</p>
                <span class="hint-sub">チェックまたは⌘/Ctrl+クリック</span>
              </div>
            } @else {
              @for (entry of selections; track entry.item.id) {
                <!-- 選択されたアイテム -->
                <div class="selected-item" [class.folder]="entry.item.type === 'folder'"
                     [class.has-excludes]="entry.excludes.length > 0">
                  <div class="item-main">
                    @if (entry.item.type === 'folder') {
                      <mat-icon class="item-icon folder-icon">folder</mat-icon>
                    } @else {
                      <span class="file-ext-small" [style.background]="getExtColor(entry.item.extension)">
                        {{ entry.item.extension || '?' }}
                      </span>
                    }
                    <span class="item-name" [matTooltip]="entry.item.path || entry.item.name">
                      {{ entry.item.name }}
                    </span>
                    <button class="remove-btn" (click)="removeSelected(entry)">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                  <!-- 除外リスト -->
                  @if (entry.excludes.length > 0) {
                    <div class="excludes-list">
                      @for (excluded of entry.excludes; track excluded.id) {
                        <div class="excluded-item">
                          <mat-icon class="exclude-icon">block</mat-icon>
                          @if (excluded.type === 'folder') {
                            <mat-icon class="item-icon folder-icon">folder</mat-icon>
                          } @else {
                            <span class="file-ext-tiny" [style.background]="getExtColor(excluded.extension)">
                              {{ excluded.extension || '?' }}
                            </span>
                          }
                          <span class="item-name" [matTooltip]="excluded.name">{{ excluded.name }}</span>
                          <button class="restore-btn" (click)="removeExcluded(entry, excluded)"
                                  matTooltip="除外を解除">
                            <mat-icon>undo</mat-icon>
                          </button>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
            }
          </div>
          @if (selections.length > 0) {
            <button class="clear-all-btn" (click)="clearSelection()">
              <mat-icon>delete_sweep</mat-icon> 全てクリア
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .box-selector-container {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      flex: 1;
      min-height: 0;
      outline: none;

      --col-width: 300px;
      --selected-width: 320px;
      --item-height: 34px;
      --primary: #2196f3;
      --success: #4caf50;
      --folder-color: #ffc107;
    }

    /* 統合ヘッダー: 1行にすべてまとめる */
    .unified-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      height: 40px;
      flex-shrink: 0;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .source-tabs {
      display: flex;
      gap: 2px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      padding: 3px;
      border-radius: 8px;
      flex-shrink: 0;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--text-secondary, #8b929a);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover { background: rgba(255,255,255,0.08); color: var(--text-primary, #fff); }

      &.active {
        background: var(--primary);
        color: white;
      }
    }

    .nav-btns {
      display: flex;
      gap: 4px;
      flex-shrink: 0;
    }

    .nav-btn {
      width: 32px;
      height: 32px;
      border: none;
      background: var(--bg-input, rgba(255,255,255,0.05));
      color: var(--text-secondary, #8b929a);
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      padding: 0;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover:not(:disabled) { background: var(--bg-hover, rgba(255,255,255,0.1)); color: var(--text-primary, #fff); }
      &:disabled { opacity: 0.3; cursor: not-allowed; }
    }

    .search-input-box {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      height: 32px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      border: 1px solid transparent;
      border-radius: 6px;
      transition: min-width 0.2s, border-color 0.2s, background 0.2s;
      min-width: 160px;
      box-sizing: border-box;

      &:focus-within, &.expanded {
        border-color: var(--primary);
        background: rgba(33, 150, 243, 0.08);
        min-width: 220px;
      }

      .search-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        color: var(--text-muted, #666);
        flex-shrink: 0;
      }

      input {
        flex: 1;
        border: none;
        background: transparent;
        color: var(--text-primary, #fff);
        font-size: 13px;
        line-height: 30px;
        height: 30px;
        outline: none;
        min-width: 0;
        padding: 0;
        margin: 0;

        &::placeholder { color: var(--text-muted, #666); }
      }

      .clear-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        line-height: 16px;
        color: var(--text-muted, #666);
        cursor: pointer;
        transition: color 0.15s;
        flex-shrink: 0;

        &:hover { color: var(--text-primary, #fff); }
      }

      .search-exec-btn {
        width: 22px;
        height: 22px;
        border: none;
        background: var(--primary);
        color: white;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
        padding: 0;

        mat-icon { font-size: 14px; width: 14px; height: 14px; line-height: 14px; }

        &:hover { background: #1976d2; }
      }

      mat-spinner {
        flex-shrink: 0;
        ::ng-deep svg { width: 16px !important; height: 16px !important; }
      }
    }

    .filter-box {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      height: 32px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      border: 1px solid transparent;
      border-radius: 6px;
      transition: border-color 0.15s;
      box-sizing: border-box;

      &:focus-within { border-color: var(--primary); }

      mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--text-muted, #666); flex-shrink: 0; }

      input {
        width: 90px;
        border: none;
        background: transparent;
        color: var(--text-primary, #fff);
        font-size: 13px;
        line-height: 30px;
        height: 30px;
        outline: none;
        padding: 0;
        margin: 0;

        &::placeholder { color: var(--text-muted, #666); }
      }

      .clear {
        cursor: pointer;
        &:hover { color: var(--text-primary, #fff); }
      }
    }

    /* 3カラムレイアウト */
    .three-column-layout {
      display: flex;
      gap: 12px;
      flex: 1;
      min-height: 0;
      overflow: hidden; /* 子要素のオーバーフローを防ぐ */
    }

    /* 左: カラムエリア (Finder風) */
    .columns-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0; /* flexbox overflow fix */
      overflow: hidden;
    }

    .columns-viewport {
      flex: 1;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 8px;
      background: var(--bg-dark, #1a1d24);
      scroll-behavior: smooth;

      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
      &::-webkit-scrollbar { height: 8px; }
      &::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
      &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
      &::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
    }

    .columns-track {
      display: flex;
      min-height: 100%;
      height: 100%;
    }

    .column {
      width: var(--col-width);
      min-width: var(--col-width);
      height: 100%; /* 親の高さを継承 */
      border-right: 1px solid var(--border-color, #3a3f4a);
      display: flex;
      flex-direction: column;
      background: var(--bg-card, #22262e);
      overflow: hidden; /* 子要素のオーバーフローを防ぐ */

      &:last-child { border-right: none; }
      &.active { background: var(--bg-dark, #1a1d24); }
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(0,0,0,0.2);
      border-bottom: 1px solid var(--border-color, #3a3f4a);

      .col-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary, #8b929a);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .col-badge {
        font-size: 10px;
        padding: 2px 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 10px;
        color: var(--text-muted, #666);

        &.has-more {
          background: rgba(33, 150, 243, 0.2);
          color: var(--primary);
        }

        .total-count {
          opacity: 0.6;
        }
      }

      .selected-count {
        background: var(--success);
        color: white;
      }
    }

    /* 追加読み込みインジケーター */
    .load-more-indicator, .load-more-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 8px;
      font-size: 11px;
      color: var(--text-muted, #666);
    }

    .load-more-indicator {
      mat-spinner {
        ::ng-deep svg { width: 18px !important; height: 18px !important; }
      }
    }

    .load-more-hint {
      opacity: 0.6;
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        animation: bounce 1.5s ease-in-out infinite;
      }
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(3px); }
    }

    .column-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      min-height: 0;

      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
      &::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.35); }
    }

    .col-loading, .col-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 8px;
      color: var(--text-muted, #555);

      mat-icon { font-size: 28px; width: 28px; height: 28px; opacity: 0.4; }
      span { font-size: 11px; }
    }

    /* アイテム */
    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: var(--item-height);
      padding: 6px 10px;
      cursor: pointer;
      transition: background 0.1s;
      border-left: 3px solid transparent;

      &:hover { background: rgba(255,255,255,0.04); }
      &.focused { background: rgba(255,255,255,0.06); }
      &.expanded {
        background: rgba(33, 150, 243, 0.12);
        border-left-color: var(--primary);
      }
      &.selected {
        background: rgba(76, 175, 80, 0.12);
        border-left-color: var(--success);

        .checkbox { border-color: var(--success); background: var(--success); }
      }
      &.expanded.selected {
        background: linear-gradient(90deg, rgba(76, 175, 80, 0.15) 0%, rgba(33, 150, 243, 0.1) 100%);
      }
      /* 暗黙的に選択（親が選択されている子） */
      &.implicit-selected {
        background: rgba(76, 175, 80, 0.06);
        border-left-color: rgba(76, 175, 80, 0.4);

        .item-name { color: var(--text-secondary, #8b929a); }
      }
      /* 除外されたアイテム */
      &.excluded {
        background: rgba(239, 83, 80, 0.08);
        border-left-color: #ef5350;

        .item-name {
          color: var(--text-muted, #666);
          text-decoration: line-through;
        }
      }
    }

    .item-check {
      flex-shrink: 0;
      padding: 4px;

      .checkbox {
        width: 16px;
        height: 16px;
        border: 2px solid var(--text-muted, #555);
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;

        mat-icon { font-size: 12px; width: 12px; height: 12px; color: white; }

        &:hover { border-color: var(--success); }
        &.checked { border-color: var(--success); background: var(--success); }
        /* 除外可能（クリックで除外） */
        &.can-exclude {
          border-color: rgba(255, 193, 7, 0.5);
          background: rgba(255, 193, 7, 0.1);

          .exclude-hint {
            color: #ffc107;
            opacity: 0.5;
          }

          &:hover {
            border-color: #ef5350;
            background: rgba(239, 83, 80, 0.2);

            .exclude-hint { color: #ef5350; opacity: 1; }
          }
        }
        /* 除外されている */
        &.excluded {
          border-color: #ef5350;
          background: #ef5350;
        }
      }
    }

    .item-icon {
      flex-shrink: 0;
      width: 24px;
      display: flex;
      align-items: center;
      justify-content: center;

      .folder-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--folder-color);
      }

      .file-ext {
        font-size: 8px;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 3px;
        color: white;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
    }

    .item-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1px;
    }

    .item-name {
      font-size: 13px;
      color: var(--text-primary, #e0e0e0);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 10px;
      color: var(--text-muted, #666);

      .meta-folder, .meta-user {
        display: flex;
        align-items: center;
        gap: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;

        mat-icon {
          font-size: 11px;
          width: 11px;
          height: 11px;
          opacity: 0.7;
        }
      }

      .meta-folder {
        color: var(--folder-color);
      }
    }

    .item-arrow {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--text-muted, #555);
      opacity: 0;
      transition: opacity 0.15s;

      .item:hover &, .item.expanded & { opacity: 1; }
      .item.expanded & { color: var(--primary); }
    }

    /* スクロールコントロール */
    .scroll-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 4px 0;
      flex-shrink: 0;
    }

    .scroll-btn {
      width: 28px;
      height: 28px;
      border: none;
      background: var(--bg-input, rgba(255,255,255,0.05));
      color: var(--text-secondary, #8b929a);
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover:not(:disabled) { background: var(--primary); color: white; }
      &:disabled { opacity: 0.2; cursor: not-allowed; }
    }

    .scroll-indicator {
      display: flex;
      gap: 6px;

      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--text-muted, #444);
        transition: all 0.2s;

        &.active { background: var(--primary); transform: scale(1.3); }
      }
    }

    /* 右: 選択済みカラム */
    .selected-column {
      width: var(--selected-width);
      min-width: var(--selected-width);
      min-height: 0; /* flexbox overflow fix */
      display: flex;
      flex-direction: column;
      background: var(--bg-card, #22262e);
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 8px;
      overflow: hidden;
    }

    .selected-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;

      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
    }

    .empty-hint {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-muted, #555);
      text-align: center;
      padding: 20px;

      mat-icon { font-size: 32px; width: 32px; height: 32px; opacity: 0.3; }
      p { font-size: 12px; margin: 0; line-height: 1.5; }
      .hint-sub { font-size: 10px; opacity: 0.6; }
    }

    .selected-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid rgba(76, 175, 80, 0.3);
      border-radius: 6px;
      transition: all 0.15s;

      &:hover { background: rgba(76, 175, 80, 0.15); }
      &.has-excludes { padding-bottom: 6px; }

      .item-main {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .item-icon {
        flex-shrink: 0;
      }

      .folder-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--folder-color);
      }

      .file-ext-small {
        font-size: 7px;
        font-weight: 700;
        padding: 2px 4px;
        border-radius: 3px;
        color: white;
        text-transform: uppercase;
      }

      .item-name {
        flex: 1;
        font-size: 12px;
        color: var(--text-primary, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .remove-btn {
        width: 20px;
        height: 20px;
        border: none;
        background: transparent;
        color: var(--text-muted, #666);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        opacity: 0;
        transition: all 0.15s;

        mat-icon { font-size: 14px; width: 14px; height: 14px; }

        &:hover { background: rgba(239, 83, 80, 0.2); color: #ef5350; }
      }

      &:hover .remove-btn { opacity: 1; }
    }

    /* 除外リスト（ツリー構造） */
    .excludes-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-left: 16px;
      margin-top: 4px;
      border-left: 2px solid rgba(239, 83, 80, 0.3);
    }

    .excluded-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: rgba(239, 83, 80, 0.08);
      border-radius: 4px;
      transition: all 0.15s;

      &:hover { background: rgba(239, 83, 80, 0.15); }

      .exclude-icon {
        font-size: 12px;
        width: 12px;
        height: 12px;
        color: #ef5350;
      }

      .item-icon {
        flex-shrink: 0;
      }

      .folder-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--folder-color);
        opacity: 0.6;
      }

      .file-ext-tiny {
        font-size: 6px;
        font-weight: 700;
        padding: 1px 3px;
        border-radius: 2px;
        color: white;
        text-transform: uppercase;
        opacity: 0.8;
      }

      .item-name {
        flex: 1;
        font-size: 11px;
        color: var(--text-muted, #666);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-decoration: line-through;
      }

      .restore-btn {
        width: 18px;
        height: 18px;
        border: none;
        background: transparent;
        color: var(--text-muted, #666);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        opacity: 0;
        transition: all 0.15s;

        mat-icon { font-size: 12px; width: 12px; height: 12px; }

        &:hover { background: rgba(76, 175, 80, 0.2); color: var(--success); }
      }

      &:hover .restore-btn { opacity: 1; }
    }

    /* 除外カウントバッジ */
    .exclude-count {
      background: #ef5350;
      color: white;
      margin-left: 4px;
    }

    .clear-all-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px;
      margin: 8px;
      border: none;
      background: rgba(239, 83, 80, 0.1);
      color: #ef5350;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;

      mat-icon { font-size: 16px; width: 16px; height: 16px; }

      &:hover { background: rgba(239, 83, 80, 0.2); }
    }

    /* AI選択アシスト */
    .ai-assist-section {
      padding: 8px;
      border-bottom: 1px solid var(--border-color, #3a3f4a);
    }

    .ai-input-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 6px;
      transition: border-color 0.15s;

      &:focus-within {
        border-color: var(--primary, #4fc3f7);
      }

      input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        font-size: 12px;
        color: var(--text-primary, #e0e0e0);
        min-width: 0;

        &::placeholder {
          color: var(--text-muted, #666);
        }

        &:disabled {
          opacity: 0.5;
        }
      }
    }

    .ai-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--primary, #4fc3f7);
      flex-shrink: 0;
    }

    .ai-send-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: var(--primary, #4fc3f7);
      color: white;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      &:hover {
        background: var(--primary-dark, #0288d1);
      }
    }

    .ai-error {
      margin-top: 6px;
      padding: 6px 8px;
      font-size: 11px;
      color: #ef5350;
      background: rgba(239, 83, 80, 0.1);
      border-radius: 4px;
    }
  `]
})
export class BoxFolderSelectorComponent implements OnInit, OnChanges, AfterViewInit {
  @Input() providerName = '';
  @Input() selectedFolderId = '';
  /** 編集モード用: 初期選択状態 */
  @Input() initialSelection?: {
    selectedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string }[];
    excludedItems?: { id: string; name: string; type: 'folder' | 'file'; path?: string; parentId: string }[];
  };
  @Output() folderSelected = new EventEmitter<BoxSelection>();
  @Output() pathChanged = new EventEmitter<BoxPathChange>();

  @ViewChild('columnsViewport') columnsViewport!: ElementRef<HTMLDivElement>;

  private readonly apiBoxService = inject(ApiBoxService);
  private readonly chatService = inject(ChatService);
  private readonly toolCallService = inject(ToolCallService);

  // AI選択アシスト
  aiQuery = '';
  isAiProcessing = false;
  aiError = '';

  // ソース切り替え
  sourceType: SourceType = 'root';
  collections: { id: string; name: string; type: string }[] = [];
  collectionsLoading = false;

  // 検索
  searchInputValue = '';
  isSearching = false;
  private searchSubject = new Subject<string>();

  columns: ColumnData[] = [];
  breadcrumbs: { id: string; name: string; path: string }[] = [];

  // 選択状態: 選択されたアイテムと、その除外リスト
  selections: SelectedEntry[] = [];

  focusedItemId = '';
  filterQuery = '';  // カラム内フィルター（旧searchQuery）
  scrollOffset = 0;

  private readonly COLUMN_WIDTH = 300;
  private viewportWidth = 900; // 3カラム分

  // 拡張子別カラーマップ
  private readonly extColors: Record<string, string> = {
    pdf: '#e53935',
    doc: '#1976d2', docx: '#1976d2',
    xls: '#388e3c', xlsx: '#388e3c',
    ppt: '#f57c00', pptx: '#f57c00',
    txt: '#78909c',
    csv: '#00897b',
    jpg: '#8e24aa', jpeg: '#8e24aa', png: '#8e24aa', gif: '#8e24aa', webp: '#8e24aa',
    zip: '#6d4c41', rar: '#6d4c41', '7z': '#6d4c41',
    mp4: '#d81b60', mov: '#d81b60', avi: '#d81b60',
    mp3: '#00acc1', wav: '#00acc1',
    js: '#fdd835', ts: '#1976d2',
    json: '#7cb342',
    html: '#ff7043', css: '#42a5f5',
    md: '#546e7a',
  };

  ngOnInit(): void {
    if (this.providerName) {
      this.apiBoxService.setProviderName(this.providerName);
      this.loadRoot();
    }

    // 初期選択状態を復元
    if (this.initialSelection?.selectedItems?.length) {
      this.restoreInitialSelection();
    }

    // 検索のデバウンス処理をセットアップ
    this.searchSubject.pipe(
      debounceTime(300),
      switchMap(query => {
        if (!query.trim()) {
          return of([]);
        }

        // ID直接指定の判定（数字のみ、または id:xxx 形式）
        const idMatch = query.match(/^(?:id:)?(\d+)$/);
        if (idMatch) {
          // ID指定の場合はフォルダを直接取得
          return this.apiBoxService.folder(idMatch[1]).pipe(
            map(res => {
              const folder = res;
              return [{
                id: folder.id,
                name: folder.name,
                type: 'folder' as const,
                path: `/${folder.name}`
              }];
            }),
            catchError(() => of([]))
          );
        }

        // 通常検索
        return this.apiBoxService.boxSearch(query).pipe(
          map(res => res.entries?.map(item => {
            // 親フォルダ名を取得（path_collectionの最後のエントリ）
            const pathEntries = item.path_collection?.entries || [];
            const parentFolder = pathEntries.length > 1 ? pathEntries[pathEntries.length - 1] : null;

            return {
              id: item.id,
              name: item.name,
              type: item.type as 'folder' | 'file',
              extension: item.type === 'file' ? this.getExtension(item.name) : undefined,
              path: pathEntries.length > 0
                ? '/' + pathEntries.slice(1).map((p: any) => p.name).join('/') + '/' + item.name
                : `/${item.name}`,
              parentFolderName: parentFolder?.name,
              modifiedBy: item.modified_by?.name
            };
          }) || []),
          catchError(() => of([]))
        );
      })
    ).subscribe(items => {
      this.isSearching = false;
      if (items.length > 0 || this.searchInputValue.trim()) {
        this.sourceType = 'search';
        this.columns = [{ parentId: 'search', parentName: '検索結果', parentPath: '', items, isLoading: false, offset: 0, limit: 100, hasMore: false, isLoadingMore: false }];
        this.breadcrumbs = [];
        this.scrollOffset = 0;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['providerName'] && !changes['providerName'].firstChange) {
      this.apiBoxService.setProviderName(this.providerName);
      this.loadRoot();
    }
  }

  // ソース切り替え
  switchSource(source: SourceType): void {
    if (this.sourceType === source && source !== 'search') return;

    this.sourceType = source;
    this.scrollOffset = 0;
    this.filterQuery = '';

    if (source === 'root') {
      this.loadRoot();
    } else if (source === 'collection') {
      this.loadCollections();
    }
    this.emitPathChange();
  }

  // コレクション読み込み - コレクション一覧を最初のカラムに表示
  private loadCollections(): void {
    this.collectionsLoading = true;
    this.columns = [{ parentId: 'collections', parentName: 'コレクション', parentPath: '', items: [], isLoading: true, offset: 0, limit: 100, hasMore: false, isLoadingMore: false }];
    this.breadcrumbs = [];

    this.apiBoxService.getCollection().pipe(
      catchError(err => { console.error('Collection load error:', err); return of({ entries: [] }); })
    ).subscribe(res => {
      this.collectionsLoading = false;
      if (res.entries && res.entries.length > 0) {
        // コレクション一覧をフォルダとして表示（重複除去）
        const seen = new Set<string>();
        const items: BoxItem[] = res.entries
          .filter(col => {
            if (seen.has(col.id)) return false;
            seen.add(col.id);
            return true;
          })
          .map(col => ({
            id: `collection:${col.id}`,  // コレクションIDにプレフィックスを付ける
            name: col.name,
            type: 'folder' as const,
            path: `/${col.name}`,
            // コレクションタイプを表示用に保持
            parentFolderName: col.collection_type === 'favorites' ? 'お気に入り' : 'パーソナル'
          }));

        this.columns[0].items = items;
        this.columns[0].isLoading = false;
      } else {
        this.columns[0].isLoading = false;
        this.columns[0].items = [];
      }
      this.emitPathChange();
    });
  }

  // コレクション内のアイテムを読み込み（2カラム目以降）
  private loadCollectionItems(collectionId: string, colIndex: number, parentPath: string): void {
    const col = this.columns[colIndex];
    const limit = col?.limit || 20;
    const offset = 0;

    this.apiBoxService.collectionItem(collectionId, offset, limit).subscribe({
      next: (response) => {
        const items: BoxItem[] = response.entries?.map(item => ({
          id: item.id,
          name: item.name,
          type: item.type as 'folder' | 'file',
          extension: item.type === 'file' ? this.getExtension(item.name) : undefined,
          path: `${parentPath}/${item.name}`
        })) || [];

        items.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        if (this.columns[colIndex]) {
          this.columns[colIndex].items = items;
          this.columns[colIndex].isLoading = false;
          this.columns[colIndex].totalCount = response.total_count;
          this.columns[colIndex].offset = response.offset || 0;
          this.columns[colIndex].limit = response.limit || limit;
          this.columns[colIndex].hasMore = (response.offset || 0) + items.length < (response.total_count || 0);

          // ビューポートを埋めきれていない場合は追加ロード
          setTimeout(() => this.checkAndLoadMoreIfNeeded(colIndex), 100);
        }
      },
      error: (error) => {
        console.error('Collection items load error:', error);
        if (this.columns[colIndex]) {
          this.columns[colIndex].items = [];
          this.columns[colIndex].isLoading = false;
          this.columns[colIndex].hasMore = false;
        }
      },
    });
  }

  // 検索入力
  get searchPlaceholder(): string {
    return '検索 または フォルダID入力';
  }

  onSearchInputChange(): void {
    // 入力が変更されたらリアルタイムで反映（UIのみ）
  }

  onSearchFocus(): void {
    // フォーカス時の処理（必要に応じて）
  }

  executeSearch(): void {
    const query = this.searchInputValue.trim();
    if (!query) return;

    this.isSearching = true;
    this.searchSubject.next(query);
  }

  clearSearchInput(): void {
    this.searchInputValue = '';
    if (this.sourceType === 'search') {
      this.switchSource('root');
    }
  }

  private loadRoot(): void {
    this.columns = [{ parentId: '0', parentName: 'Root', parentPath: '', items: [], isLoading: true, offset: 0, limit: 20, hasMore: false, isLoadingMore: false }];
    this.breadcrumbs = [];
    this.loadFolder('0', 0, '');
    this.emitPathChange();
  }

  private loadFolder(folderId: string, colIndex: number, parentPath: string): void {
    const col = this.columns[colIndex];
    if (col) col.isLoading = true;

    const limit = col?.limit || 20;
    const offset = 0;

    this.apiBoxService.folder(folderId, offset, limit).pipe(
      map(res => {
        const items = res.item_collection.entries.map(item => {
          const ext = item.type === 'file' ? this.getExtension(item.name) : undefined;
          const itemPath = parentPath ? `${parentPath}/${item.name}` : `/${item.name}`;
          return {
            id: item.id,
            name: item.name,
            type: item.type as 'folder' | 'file',
            extension: ext,
            parentId: folderId,
            path: itemPath
          };
        });
        return {
          items,
          totalCount: res.item_collection.total_count,
          offset: res.item_collection.offset,
          limit: res.item_collection.limit,
        };
      }),
      catchError(err => { console.error('Box load error:', err); return of({ items: [], totalCount: 0, offset: 0, limit }); })
    ).subscribe(result => {
      // フォルダを先に、ファイルを後に
      result.items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      if (this.columns[colIndex]) {
        this.columns[colIndex].items = result.items;
        this.columns[colIndex].isLoading = false;
        this.columns[colIndex].totalCount = result.totalCount;
        this.columns[colIndex].offset = result.offset;
        this.columns[colIndex].limit = result.limit;
        this.columns[colIndex].hasMore = (result.offset + result.items.length) < result.totalCount;

        // ビューポートを埋めきれていない場合は追加ロード
        setTimeout(() => this.checkAndLoadMoreIfNeeded(colIndex), 100);
      }
    });
  }

  /** ビューポートを埋めきれていない場合に追加ロードする */
  private checkAndLoadMoreIfNeeded(colIndex: number, retryCount = 0): void {
    const MAX_RETRIES = 5; // 最大5回まで（100件分）
    const col = this.columns[colIndex];

    if (!col || !col.hasMore || col.isLoadingMore || col.isLoading) return;
    if (retryCount >= MAX_RETRIES) return;

    // 初回チェック済みフラグで重複実行を防止
    if (retryCount === 0 && col.initialFillChecked) return;
    if (retryCount === 0) col.initialFillChecked = true;

    // カラムのDOM要素を取得
    const columnElements = document.querySelectorAll('.box-selector-container .column');
    const columnElement = columnElements[colIndex];
    if (!columnElement) return;

    const columnBody = columnElement.querySelector('.column-body') as HTMLElement;
    if (!columnBody) return;

    // コンテンツがビューポートより小さい場合は追加ロード
    // clientHeight が 0 の場合はまだレンダリングされていないのでスキップ
    if (columnBody.clientHeight > 0 && columnBody.scrollHeight <= columnBody.clientHeight + 10) {
      this.loadMoreItemsWithCallback(colIndex, () => {
        // ロード完了後、まだ埋まっていなければ再チェック
        setTimeout(() => this.checkAndLoadMoreIfNeeded(colIndex, retryCount + 1), 100);
      });
    }
  }

  /** 追加ロード（コールバック付き） */
  private loadMoreItemsWithCallback(colIndex: number, callback: () => void): void {
    const col = this.columns[colIndex];
    if (!col || col.isLoadingMore || !col.hasMore) {
      callback();
      return;
    }

    col.isLoadingMore = true;
    const newOffset = col.offset + col.limit;
    const parentPath = col.parentPath;
    const folderId = col.parentId;
    let callbackCalled = false;

    const callOnce = () => {
      if (!callbackCalled) {
        callbackCalled = true;
        callback();
      }
    };

    // コレクションの場合
    if (folderId.startsWith('collection:')) {
      const collectionId = folderId.replace('collection:', '');
      let processed = false;
      this.apiBoxService.collectionItem(collectionId, newOffset, col.limit).subscribe({
        next: (response) => {
          // 有効なデータがある場合のみ処理（APIは複数回emitするため）
          if (!response.entries?.length && processed) return;
          processed = true;

          const newItems: BoxItem[] = response.entries?.map(item => ({
            id: item.id,
            name: item.name,
            type: item.type as 'folder' | 'file',
            extension: item.type === 'file' ? this.getExtension(item.name) : undefined,
            path: `${parentPath}/${item.name}`
          })) || [];

          newItems.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

          // 既存アイテムのIDセットを作成
          const existingIds = new Set(col.items.map(i => i.id));
          const uniqueNewItems = newItems.filter(i => !existingIds.has(i.id));

          if (uniqueNewItems.length > 0) {
            col.items = [...col.items, ...uniqueNewItems];
            col.offset = newOffset;
          }
          col.hasMore = (newOffset + newItems.length) < (response.total_count || 0);
          col.isLoadingMore = false;
          callOnce();
        },
        error: () => {
          col.isLoadingMore = false;
          callOnce();
        }
      });
      return;
    }

    // 通常のフォルダの場合
    let processed = false;
    this.apiBoxService.folder(folderId, newOffset, col.limit).pipe(
      map(res => ({
        items: res.item_collection.entries.map(item => {
          const ext = item.type === 'file' ? this.getExtension(item.name) : undefined;
          const itemPath = parentPath ? `${parentPath}/${item.name}` : `/${item.name}`;
          return {
            id: item.id,
            name: item.name,
            type: item.type as 'folder' | 'file',
            extension: ext,
            parentId: folderId,
            path: itemPath
          };
        }),
        totalCount: res.item_collection.total_count,
      })),
      catchError(() => of({ items: [] as BoxItem[], totalCount: col.totalCount || 0 }))
    ).subscribe(result => {
      // 空の結果で既に処理済みならスキップ
      if (!result.items.length && processed) return;
      processed = true;

      result.items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      // 既存アイテムのIDセットを作成
      const existingIds = new Set(col.items.map(i => i.id));
      const uniqueNewItems = result.items.filter(i => !existingIds.has(i.id));

      if (uniqueNewItems.length > 0) {
        col.items = [...col.items, ...uniqueNewItems];
        col.offset = newOffset;
      }
      col.hasMore = (newOffset + result.items.length) < result.totalCount;
      col.isLoadingMore = false;
      callOnce();
    });
  }

  /** 追加データを読み込む（無限スクロール用） */
  loadMoreItems(colIndex: number): void {
    this.loadMoreItemsWithCallback(colIndex, () => {});
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
  }

  getExtColor(ext?: string): string {
    if (!ext) return '#78909c';
    return this.extColors[ext] || '#78909c';
  }

  getFilteredItems(column: ColumnData): BoxItem[] {
    if (!this.filterQuery.trim()) return column.items;
    const q = this.filterQuery.toLowerCase();
    return column.items.filter(item => item.name.toLowerCase().includes(q));
  }

  // ナビゲーション
  navigateToRoot(): void {
    this.scrollOffset = 0;

    if (this.sourceType === 'collection') {
      this.loadCollections();
    } else if (this.sourceType === 'search') {
      // 検索モードからは前のモード（通常はroot）に戻る
      this.switchSource('root');
    } else {
      this.loadRoot();
    }
    this.emitSelection();
    this.emitPathChange();
  }

  navigateUp(): void {
    if (this.breadcrumbs.length === 0) return;
    this.breadcrumbs.pop();
    this.columns.pop();
    if (this.columns.length > 0) {
      this.columns[this.columns.length - 1].expandedId = undefined;
    }
    this.adjustScroll();
    this.emitSelection();
    this.emitPathChange();
  }

  navigateToBreadcrumb(index: number): void {
    this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
    this.columns = this.columns.slice(0, index + 2);
    if (this.columns.length > 0) {
      this.columns[this.columns.length - 1].expandedId = undefined;
    }
    this.adjustScroll();
    this.emitSelection();
    this.emitPathChange();
  }

  refresh(): void {
    const currentFolderId = this.breadcrumbs.length > 0
      ? this.breadcrumbs[this.breadcrumbs.length - 1].id
      : '0';
    const currentPath = this.breadcrumbs.length > 0
      ? '/' + this.breadcrumbs.map(b => b.name).join('/')
      : '';
    const lastColIndex = this.columns.length - 1;
    if (lastColIndex >= 0) {
      this.loadFolder(currentFolderId, lastColIndex, currentPath);
    }
  }

  // アイテム操作
  onItemClick(event: MouseEvent, colIndex: number, item: BoxItem): void {
    // Cmd/Ctrl + クリックで選択トグル
    if (event.metaKey || event.ctrlKey) {
      this.toggleSelect(item);
      return;
    }

    // フォルダは展開、ファイルは選択
    if (item.type === 'folder') {
      this.expandFolder(colIndex, item);
    } else {
      // ファイルはシングルクリックで選択トグル
      this.toggleSelect(item);
    }
  }

  onItemDblClick(colIndex: number, item: BoxItem): void {
    if (item.type === 'folder') {
      this.expandFolder(colIndex, item);
      // ダブルクリックで選択も追加
      if (!this.isSelected(item) && !this.findParentSelection(item)) {
        this.addSelection(item);
        this.emitSelection();
      }
    }
  }

  private expandFolder(colIndex: number, item: BoxItem): void {
    // 現在のカラムで展開状態を更新
    this.columns[colIndex].expandedId = item.id;

    // 右側のカラムをクリア
    this.columns = this.columns.slice(0, colIndex + 1);
    this.breadcrumbs = this.breadcrumbs.slice(0, colIndex);

    // パンくずに追加（パス情報も保持）
    const parentPath = this.breadcrumbs.length > 0
      ? '/' + this.breadcrumbs.map(b => b.name).join('/')
      : '';
    const itemPath = parentPath + '/' + item.name;
    this.breadcrumbs.push({ id: item.id, name: item.name, path: itemPath });

    // 新しいカラムを追加
    this.columns.push({ parentId: item.id, parentName: item.name, parentPath: itemPath, items: [], isLoading: true, offset: 0, limit: 20, hasMore: false, isLoadingMore: false });

    // コレクションアイテムの場合はコレクション内容を読み込む
    if (item.id.startsWith('collection:')) {
      const collectionId = item.id.replace('collection:', '');
      this.loadCollectionItems(collectionId, colIndex + 1, itemPath);
    } else {
      this.loadFolder(item.id, colIndex + 1, itemPath);
    }

    // スクロール調整
    this.adjustScroll();
    this.emitSelection();
    this.emitPathChange();
  }

  /** アイテムのチェック状態を切り替え */
  toggleSelect(item: BoxItem): void {
    const parentSelection = this.findParentSelection(item);

    if (parentSelection) {
      // 親が選択済み → 除外トグル
      this.toggleExclude(parentSelection, item);
    } else if (this.isSelected(item)) {
      // 直接選択されている → 選択解除
      this.removeSelection(item);
    } else {
      // 新規選択
      this.addSelection(item);
    }
    this.emitSelection();
  }

  /** アイテムが直接選択されているか */
  isSelected(item: BoxItem): boolean {
    return this.selections.some(s => s.item.id === item.id);
  }

  /** アイテムが除外されているか */
  isExcluded(item: BoxItem): boolean {
    return this.selections.some(s => s.excludes.some(e => e.id === item.id));
  }

  /** このアイテムの親が選択されているか確認し、その親のSelectionを返す */
  findParentSelection(item: BoxItem): SelectedEntry | undefined {
    if (!item.path) return undefined;

    // 選択済みアイテムの中から、このアイテムのパスが選択パス配下にあるものを探す
    for (const selection of this.selections) {
      if (selection.item.type !== 'folder') continue;
      if (!selection.item.path) continue;
      // 自分自身は除く
      if (selection.item.id === item.id) continue;
      // パスが選択フォルダの配下かどうか
      if (item.path.startsWith(selection.item.path + '/')) {
        return selection;
      }
    }
    return undefined;
  }

  /** 親フォルダが選択されていて、子が除外可能か */
  canExclude(item: BoxItem): boolean {
    return this.findParentSelection(item) !== undefined;
  }

  /** 選択追加 */
  private addSelection(item: BoxItem): void {
    // 既に親が選択されている場合は追加しない（子は暗黙的に含まれる）
    if (this.findParentSelection(item)) return;

    // このアイテムが選択されると、その子の選択は不要になる
    // → 子の選択を削除
    if (item.type === 'folder' && item.path) {
      this.selections = this.selections.filter(s =>
        !s.item.path?.startsWith(item.path + '/')
      );
    }

    this.selections = [...this.selections, { item, excludes: [] }];
  }

  /** 選択解除 */
  private removeSelection(item: BoxItem): void {
    this.selections = this.selections.filter(s => s.item.id !== item.id);
  }

  /** 除外トグル */
  private toggleExclude(parentSelection: SelectedEntry, item: BoxItem): void {
    const idx = parentSelection.excludes.findIndex(e => e.id === item.id);
    if (idx >= 0) {
      // 除外解除
      parentSelection.excludes = parentSelection.excludes.filter(e => e.id !== item.id);
    } else {
      // 除外追加
      parentSelection.excludes = [...parentSelection.excludes, item];
    }
    // immutableに更新
    this.selections = [...this.selections];
  }

  /** 選択から除去（右側リストから） */
  removeSelected(entry: SelectedEntry): void {
    this.selections = this.selections.filter(s => s.item.id !== entry.item.id);
    this.emitSelection();
  }

  /** 除外から除去 */
  removeExcluded(parentEntry: SelectedEntry, excludedItem: BoxItem): void {
    parentEntry.excludes = parentEntry.excludes.filter(e => e.id !== excludedItem.id);
    this.selections = [...this.selections];
    this.emitSelection();
  }

  clearSelection(): void {
    this.selections = [];
    this.emitSelection();
  }

  /** 選択数（除外は含まない） */
  get selectionCount(): number {
    return this.selections.length;
  }

  /** 除外数 */
  get excludeCount(): number {
    return this.selections.reduce((sum, s) => sum + s.excludes.length, 0);
  }

  // スクロール（ネイティブスクロールベース）
  ngAfterViewInit(): void {
    // ビューポートの実際の幅を取得
    if (this.columnsViewport?.nativeElement) {
      this.viewportWidth = this.columnsViewport.nativeElement.clientWidth;
    }
  }

  /** ビューポートのスクロールイベントハンドラー */
  onViewportScroll(): void {
    // スクロール位置を更新（インジケータ用）
    if (this.columnsViewport?.nativeElement) {
      this.scrollOffset = -this.columnsViewport.nativeElement.scrollLeft;
    }
  }

  /** カラム内スクロールイベントハンドラー（無限スクロール用） */
  onColumnScroll(event: Event, colIndex: number): void {
    const target = event.target as HTMLElement;
    if (!target) return;

    const col = this.columns[colIndex];
    if (!col || !col.hasMore || col.isLoadingMore) return;

    // 下端に近づいたら追加読み込み（残り100px以下で発火）
    const threshold = 100;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < threshold;

    if (isNearBottom) {
      this.loadMoreItems(colIndex);
    }
  }

  private adjustScroll(): void {
    // 最後のカラムが見えるようにスクロール
    if (this.columnsViewport?.nativeElement) {
      const viewport = this.columnsViewport.nativeElement;
      const targetScroll = Math.max(0, (this.columns.length - 3) * this.COLUMN_WIDTH);
      viewport.scrollLeft = targetScroll;
    }
  }

  scrollLeft(): void {
    if (this.columnsViewport?.nativeElement) {
      const viewport = this.columnsViewport.nativeElement;
      viewport.scrollLeft = Math.max(0, viewport.scrollLeft - this.COLUMN_WIDTH);
    }
  }

  scrollRight(): void {
    if (this.columnsViewport?.nativeElement) {
      const viewport = this.columnsViewport.nativeElement;
      const maxScroll = Math.max(0, this.columns.length * this.COLUMN_WIDTH - viewport.clientWidth);
      viewport.scrollLeft = Math.min(maxScroll, viewport.scrollLeft + this.COLUMN_WIDTH);
    }
  }

  canScrollLeft(): boolean {
    if (!this.columnsViewport?.nativeElement) return false;
    return this.columnsViewport.nativeElement.scrollLeft > 0;
  }

  canScrollRight(): boolean {
    if (!this.columnsViewport?.nativeElement) return false;
    const viewport = this.columnsViewport.nativeElement;
    const maxScroll = Math.max(0, this.columns.length * this.COLUMN_WIDTH - viewport.clientWidth);
    return viewport.scrollLeft < maxScroll - 1; // -1 for rounding errors
  }

  isColumnVisible(index: number): boolean {
    if (!this.columnsViewport?.nativeElement) return index < 3;
    const viewport = this.columnsViewport.nativeElement;
    const colLeft = index * this.COLUMN_WIDTH;
    const colRight = colLeft + this.COLUMN_WIDTH;
    const viewLeft = viewport.scrollLeft;
    const viewRight = viewLeft + viewport.clientWidth;
    return colRight > viewLeft && colLeft < viewRight;
  }

  // フィルター変更（カラム内フィルター）
  onFilterChange(): void {
    // フィルター時は自動的にフィルタリング（getFilteredItemsで処理）
  }

  /** 空カラムのメッセージを生成 */
  getEmptyMessage(column: ColumnData, colIndex: number): string {
    if (this.filterQuery) {
      return '該当なし';
    }

    // コレクション選択時
    if (this.sourceType === 'collection') {
      if (colIndex === 0) {
        return 'コレクションなし';
      } else {
        return 'アイテムなし';
      }
    }

    // 検索結果
    if (this.sourceType === 'search') {
      if (colIndex === 0) {
        return '結果なし';
      }
      return '空のフォルダ';
    }

    // 通常のフォルダ
    return '空のフォルダ';
  }

  // キーボード操作
  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.filterQuery = '';
      this.onFilterChange();
    }
  }

  // 選択通知
  private emitSelection(): void {
    const currentFolderId = this.breadcrumbs.length > 0
      ? this.breadcrumbs[this.breadcrumbs.length - 1].id
      : '0';

    // 選択アイテムをフラット化
    const selectedItems = this.selections.map(entry => ({
      id: entry.item.id,
      name: entry.item.name,
      type: entry.item.type,
      path: entry.item.path,
    }));

    // 除外アイテムをフラット化（親IDを含める）
    const excludedItems: { id: string; name: string; type: 'folder' | 'file'; path?: string; parentId: string }[] = [];
    for (const entry of this.selections) {
      for (const excluded of entry.excludes) {
        excludedItems.push({
          id: excluded.id,
          name: excluded.name,
          type: excluded.type,
          path: excluded.path,
          parentId: entry.item.id,
        });
      }
    }

    this.folderSelected.emit({
      folderId: currentFolderId,
      folderPath: '/' + this.breadcrumbs.map(b => b.name).join('/'),
      selectedItems,
      excludedItems,
    });
  }

  // パス変更通知
  private emitPathChange(): void {
    this.pathChanged.emit({
      sourceType: this.sourceType,
      breadcrumbs: [...this.breadcrumbs],
    });
  }

  /** パンくずクリック用（親コンポーネントから呼ばれる） */
  navigateToBreadcrumbByIndex(index: number): void {
    this.navigateToBreadcrumb(index);
  }

  // ========================================
  // AI選択アシスト
  // ========================================

  /** AIに選択を依頼 */
  executeAiSelect(): void {
    if (!this.aiQuery.trim() || this.isAiProcessing) return;

    this.isAiProcessing = true;
    this.aiError = '';

    // 現在表示中の全アイテムを収集
    const allItems: BoxItem[] = [];
    for (const column of this.columns) {
      for (const item of column.items) {
        allItems.push(item);
      }
    }

    if (allItems.length === 0) {
      this.aiError = 'フォルダを開いてからお試しください';
      this.isAiProcessing = false;
      return;
    }

    // AIに送るアイテムリスト（IDと名前のみ）
    const itemListForAi = allItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      path: item.path || '',
    }));

    const prompt = `以下のフォルダ/ファイル一覧から、ユーザーの要求に合うものを選んでください。
必要に応じてBoxのツールを使って追加情報を取得しても構いません。
最終的に、選択すべきアイテムのIDをJSON配列で返してください。該当するものがない場合は空配列を返してください。

ユーザーの要求: 「${this.aiQuery}」

フォルダ/ファイル一覧:
${JSON.stringify(itemListForAi, null, 2)}

回答はJSON配列のみを返してください（説明不要）:`;

    let responseText = '';

    // Boxのツール定義を取得
    const boxTools = this.toolCallService.tools
      .filter(g => g.group === 'box')
      .flatMap(g => g.tools.map(t => t.definition));

    this.chatService.chatCompletionObservableStreamNew({
      args: {
        max_tokens: 2000,
        model: 'gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        tools: boxTools.length > 0 ? boxTools : undefined,
        tool_choice: boxTools.length > 0 ? 'auto' : undefined,
      },
    }).subscribe({
      next: next => {
        next.observer.pipe(
          tap(chunk => {
            responseText += chunk.choices[0]?.delta?.content || '';
          }),
          toArray(),
        ).subscribe({
          next: () => this.processAiResponse(responseText, allItems),
          error: err => {
            console.error('AI response error:', err);
            this.aiError = 'AI応答の処理に失敗しました';
            this.isAiProcessing = false;
          }
        });
      },
      error: err => {
        console.error('AI request error:', err);
        this.aiError = 'AIリクエストに失敗しました';
        this.isAiProcessing = false;
      }
    });
  }

  /** AIの応答を処理して選択状態に反映 */
  private processAiResponse(responseText: string, allItems: BoxItem[]): void {
    try {
      // JSON部分を抽出（```json ... ``` やテキストが混じっている場合の対応）
      let jsonStr = responseText.trim();
      const jsonMatch = jsonStr.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const selectedIds: string[] = JSON.parse(jsonStr);

      if (!Array.isArray(selectedIds)) {
        throw new Error('Invalid response format');
      }

      // 選択状態に反映
      let addedCount = 0;
      for (const id of selectedIds) {
        const item = allItems.find(i => i.id === id);
        if (item && !this.isSelected(item)) {
          this.addToSelection(item);
          addedCount++;
        }
      }

      if (addedCount === 0 && selectedIds.length === 0) {
        this.aiError = '該当するアイテムが見つかりませんでした';
      }

      this.aiQuery = ''; // 入力をクリア
    } catch (err) {
      console.error('Failed to parse AI response:', responseText, err);
      this.aiError = 'AI応答のパースに失敗しました';
    } finally {
      this.isAiProcessing = false;
    }
  }

  /** 初期選択状態を復元 */
  private restoreInitialSelection(): void {
    if (!this.initialSelection) return;

    // 選択アイテムを復元
    for (const item of this.initialSelection.selectedItems) {
      const boxItem: BoxItem = {
        id: item.id,
        name: item.name,
        type: item.type,
        path: item.path,
        extension: item.type === 'file' ? this.getExtension(item.name) : undefined,
      };

      // 対応する除外アイテムを取得
      const excludedForThis = this.initialSelection.excludedItems?.filter(
        e => e.parentId === item.id
      ) || [];

      const excludes: BoxItem[] = excludedForThis.map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        path: e.path,
        extension: e.type === 'file' ? this.getExtension(e.name) : undefined,
      }));

      this.selections.push({
        item: boxItem,
        excludes,
      });
    }

    // 選択状態を通知
    this.emitSelection();
  }

  /** 選択状態に追加（既存メソッドを利用） */
  private addToSelection(item: BoxItem): void {
    // 既に選択されているかチェック
    if (this.selections.some(s => s.item.id === item.id)) {
      return;
    }

    // 親が選択されている場合は追加しない（除外状態から復帰させるのみ）
    const parentEntry = this.findParentSelection(item);
    if (parentEntry) {
      // 除外リストから削除
      parentEntry.excludes = parentEntry.excludes.filter((e: BoxItem) => e.id !== item.id);
    } else {
      // 新規選択として追加
      this.selections.push({
        item: { ...item },
        excludes: []
      });
    }

    this.emitSelection();
  }
}
