import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiConfluenceService, ConfluenceSpace, ConfluencePage } from '../../../services/api-confluence.service';
import { of, forkJoin } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface ConfluencePageItem {
  id: string;
  title: string;
  spaceKey: string;
  spaceName: string;
  parentId?: string;
  path: string;
  hasChildren: boolean;
  isExpanded?: boolean;
  level: number;
}

export interface ConfluenceSelection {
  spaceKey: string;
  spaceName: string;
  pages: { pageId: string; title: string; path: string }[];
  selectAll: boolean;
}

interface SpaceWithCount extends ConfluenceSpace {
  pageCount?: number;
}

@Component({
  selector: 'app-confluence-space-selector',
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
    <div class="confluence-selector">
      <!-- ヘッダー: タブ + 検索 -->
      <div class="selector-header">
        <div class="mode-tabs">
          <button type="button" class="mode-tab" [class.active]="viewMode === 'spaces'" (click)="switchMode('spaces')">
            <mat-icon>folder_special</mat-icon> スペース
          </button>
          <button type="button" class="mode-tab" [class.active]="viewMode === 'recent'" (click)="switchMode('recent')">
            <mat-icon>history</mat-icon> 最近
          </button>
        </div>
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input type="text" [(ngModel)]="searchQuery" (input)="onSearchInput()"
                 (keydown.enter)="executeSearch()" placeholder="ページを検索...">
          @if (searchQuery) {
            <mat-icon class="clear-icon" (click)="clearSearch()">close</mat-icon>
          }
          @if (isSearching) {
            <mat-spinner diameter="16"></mat-spinner>
          }
        </div>
      </div>

      <!-- 3カラムレイアウト -->
      <div class="three-column-layout">
        <!-- 左: スペース一覧 -->
        <div class="spaces-column">
          <div class="column-header">
            <span class="column-title">SPACES</span>
            <span class="column-count">{{ filteredSpaces.length }}</span>
          </div>
          <div class="search-box-inline">
            <mat-icon>filter_list</mat-icon>
            <input type="text" placeholder="フィルター..." [(ngModel)]="spaceFilterQuery" (input)="filterSpaces()">
          </div>
          <div class="space-list custom-scroll">
            @if (isLoadingSpaces) {
              <div class="loading-inline"><mat-spinner diameter="20"></mat-spinner></div>
            } @else if (filteredSpaces.length === 0) {
              <div class="empty-state">
                <mat-icon>folder_off</mat-icon>
                <span>スペースがありません</span>
              </div>
            } @else {
              @for (space of filteredSpaces; track space.id) {
                <div class="space-item" [class.active]="selectedSpaceKey === space.key" (click)="selectSpace(space)">
                  <mat-icon class="space-icon">folder_special</mat-icon>
                  <div class="space-info">
                    <span class="space-name">{{ space.name }}</span>
                    <span class="space-key">{{ space.key }}</span>
                  </div>
                  <span class="badge" *ngIf="space.pageCount !== undefined">{{ space.pageCount }}</span>
                </div>
              }
            }
          </div>
        </div>

        <!-- 中央: ページツリー -->
        <div class="pages-column">
          <div class="column-header">
            <span class="column-title">
              @if (viewMode === 'recent') {
                最近のページ
              } @else if (searchQuery) {
                検索結果
              } @else {
                {{ selectedSpaceName || 'PAGES' }}
              }
            </span>
            <span class="column-count">{{ displayPages.length }}</span>
          </div>
          <div class="page-tree custom-scroll">
            @if (isLoadingPages) {
              <div class="loading"><mat-spinner diameter="28"></mat-spinner><span>読み込み中...</span></div>
            } @else if (displayPages.length === 0) {
              <div class="empty-state">
                <mat-icon>{{ selectedSpaceKey ? 'article' : 'touch_app' }}</mat-icon>
                <p>{{ selectedSpaceKey ? 'ページがありません' : 'スペースを選択してください' }}</p>
              </div>
            } @else {
              @for (page of displayPages; track page.id) {
                <div class="page-item"
                     [style.paddingLeft.px]="12 + page.level * 20"
                     [class.selected]="isPageSelected(page)"
                     [class.expanded]="page.isExpanded"
                     (click)="onPageClick($event, page)">
                  <!-- 展開ボタン -->
                  @if (page.hasChildren) {
                    <button class="expand-btn" (click)="$event.stopPropagation(); toggleExpand(page)">
                      <mat-icon>{{ page.isExpanded ? 'expand_more' : 'chevron_right' }}</mat-icon>
                    </button>
                  } @else {
                    <span class="expand-placeholder"></span>
                  }
                  <!-- チェックボックス -->
                  <div class="page-check" (click)="$event.stopPropagation(); togglePageSelect(page)">
                    <div class="checkbox" [class.checked]="isPageSelected(page)">
                      @if (isPageSelected(page)) {
                        <mat-icon>check</mat-icon>
                      }
                    </div>
                  </div>
                  <!-- ページアイコン -->
                  <mat-icon class="page-icon">article</mat-icon>
                  <!-- ページ情報 -->
                  <div class="page-content">
                    <span class="page-title" [matTooltip]="page.path">{{ page.title }}</span>
                    @if (viewMode === 'recent' || searchQuery) {
                      <span class="page-space">{{ page.spaceName }}</span>
                    }
                  </div>
                </div>
              }
            }
          </div>
        </div>

        <!-- 右: 選択済み -->
        <div class="selected-column">
          <div class="column-header">
            <span class="column-title">SELECTED</span>
            <span class="column-count selected-count">{{ selectedPages.length }}</span>
          </div>
          <div class="selected-list custom-scroll">
            @if (selectedPages.length === 0) {
              <div class="empty-hint">
                <mat-icon>touch_app</mat-icon>
                <p>ページを選択してください</p>
                <span class="hint-sub">クリックまたはチェックで選択</span>
              </div>
            } @else {
              @for (page of selectedPages; track page.id) {
                <div class="selected-item">
                  <mat-icon class="page-icon">article</mat-icon>
                  <div class="item-content">
                    <span class="item-title" [matTooltip]="page.path">{{ page.title }}</span>
                    <span class="item-space">{{ page.spaceName }}</span>
                  </div>
                  <button class="remove-btn" (click)="removePage(page)">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }
            }
          </div>
          @if (selectedPages.length > 0) {
            <button class="clear-all-btn" (click)="clearAllPages()">
              <mat-icon>clear_all</mat-icon> 全てクリア
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .confluence-selector {
      width: 100%;
      min-width: 900px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ヘッダー */
    .selector-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .mode-tabs {
      display: flex;
      gap: 8px;
    }

    .mode-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid var(--border-color, #3a3f4a);
      background: transparent;
      color: var(--text-secondary, #8b929a);
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover {
        background: var(--bg-hover, rgba(255,255,255,0.05));
        color: var(--text-primary, #fff);
      }

      &.active {
        background: #1a73e8;
        border-color: #1a73e8;
        color: white;
      }
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 6px;
      min-width: 280px;

      mat-icon { font-size: 18px; width: 18px; height: 18px; color: var(--text-muted, #666); }

      input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--text-primary, #fff);
        font-size: 13px;

        &::placeholder { color: var(--text-muted, #666); }
      }

      .clear-icon {
        cursor: pointer;
        &:hover { color: var(--text-primary, #fff); }
      }
    }

    /* 3カラムレイアウト */
    .three-column-layout {
      display: grid;
      grid-template-columns: 240px 1fr 280px;
      gap: 1px;
      background: var(--border-color, #3a3f4a);
      border: 1px solid var(--border-color, #3a3f4a);
      border-radius: 8px;
      overflow: hidden;
      min-height: 350px;
      max-height: calc(100vh - 400px);
      height: 55vh;
    }

    /* カラム共通 */
    .spaces-column, .pages-column, .selected-column {
      background: var(--bg-dark, #1e2128);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }

    .column-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--bg-card, #282c34);
      border-bottom: 1px solid var(--border-color, #3a3f4a);
    }

    .column-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary, #8b929a);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .column-count {
      font-size: 11px;
      color: var(--text-muted, #666);
      background: var(--bg-input, rgba(255,255,255,0.08));
      padding: 2px 8px;
      border-radius: 10px;
    }

    .selected-count {
      background: #1a73e8;
      color: white;
    }

    /* スペース一覧 */
    .search-box-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      margin: 8px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      border-radius: 6px;

      mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--text-muted, #666); }

      input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: var(--text-primary, #fff);
        font-size: 12px;

        &::placeholder { color: var(--text-muted, #666); }
      }
    }

    .space-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }

    .space-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.1s;
      border-left: 3px solid transparent;

      &:hover { background: var(--bg-hover, rgba(255,255,255,0.05)); }

      &.active {
        background: var(--bg-active, rgba(26, 115, 232, 0.15));
        border-left-color: #1a73e8;
      }

      .space-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: #1a73e8;
      }

      .space-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .space-name {
        font-size: 13px;
        color: var(--text-primary, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .space-key {
        font-size: 10px;
        color: var(--text-muted, #666);
      }

      .badge {
        font-size: 10px;
        padding: 2px 6px;
        background: var(--bg-input, rgba(255,255,255,0.1));
        border-radius: 8px;
        color: var(--text-muted, #888);
      }
    }

    /* ページツリー */
    .page-tree {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 4px 0;
    }

    .page-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      cursor: pointer;
      transition: background 0.1s;
      border-left: 3px solid transparent;

      &:hover { background: var(--bg-hover, rgba(255,255,255,0.05)); }

      &.selected {
        background: rgba(76, 175, 80, 0.12);
        border-left-color: #4caf50;
      }

      &.expanded {
        background: rgba(26, 115, 232, 0.08);
      }
    }

    .expand-btn {
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--text-muted, #666);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      flex-shrink: 0;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover { background: var(--bg-hover, rgba(255,255,255,0.1)); color: var(--text-primary, #fff); }
    }

    .expand-placeholder {
      width: 20px;
      flex-shrink: 0;
    }

    .page-check {
      flex-shrink: 0;
      padding: 2px;

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

        &:hover { border-color: #4caf50; }
        &.checked { border-color: #4caf50; background: #4caf50; }
      }
    }

    .page-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #1a73e8;
      flex-shrink: 0;
    }

    .page-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .page-title {
      font-size: 13px;
      color: var(--text-primary, #e0e0e0);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .page-space {
      font-size: 10px;
      color: var(--text-muted, #666);
    }

    /* 選択済みカラム */
    .selected-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px;
    }

    .empty-hint {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted, #666);
      text-align: center;

      mat-icon { font-size: 32px; width: 32px; height: 32px; margin-bottom: 8px; opacity: 0.5; }
      p { font-size: 12px; margin: 0; }
      .hint-sub { font-size: 10px; opacity: 0.7; margin-top: 4px; }
    }

    .selected-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid rgba(76, 175, 80, 0.3);
      border-radius: 6px;
      margin-bottom: 6px;

      .page-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #1a73e8;
      }

      .item-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .item-title {
        font-size: 12px;
        color: var(--text-primary, #e0e0e0);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .item-space {
        font-size: 10px;
        color: var(--text-muted, #666);
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

        &:hover { background: rgba(234, 67, 53, 0.2); color: #ea4335; }
      }

      &:hover .remove-btn { opacity: 1; }
    }

    .clear-all-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: calc(100% - 16px);
      margin: 8px;
      padding: 8px;
      border: 1px dashed var(--border-color, #3a3f4a);
      background: transparent;
      color: var(--text-secondary, #8b929a);
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;

      mat-icon { font-size: 14px; width: 14px; height: 14px; }

      &:hover { background: rgba(234, 67, 53, 0.1); color: #ea4335; border-color: #ea4335; }
    }

    /* 共通ステート */
    .loading, .empty-state, .loading-inline {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px;
      color: var(--text-muted, #666);

      mat-icon { font-size: 28px; width: 28px; height: 28px; opacity: 0.5; }
      p, span { font-size: 12px; margin: 0; }
    }

    .loading-inline {
      padding: 16px;
    }

    /* カスタムスクロールバー */
    .custom-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;

      &::-webkit-scrollbar { width: 6px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.2);
        border-radius: 3px;
        &:hover { background: rgba(255,255,255,0.35); }
      }
    }
  `]
})
export class ConfluenceSpaceSelectorComponent implements OnInit, OnChanges {
  @Input() providerName = '';
  @Input() initialSelection?: ConfluenceSelection;
  @Output() selectionChanged = new EventEmitter<ConfluenceSelection>();

  private readonly confluenceService = inject(ApiConfluenceService);

  // 表示モード
  viewMode: 'spaces' | 'recent' = 'spaces';

  // スペース一覧
  spaces: SpaceWithCount[] = [];
  filteredSpaces: SpaceWithCount[] = [];
  spaceFilterQuery = '';
  isLoadingSpaces = false;

  // 選択中のスペース
  selectedSpaceKey = '';
  selectedSpaceName = '';

  // ページ一覧
  allPages: ConfluencePageItem[] = [];
  displayPages: ConfluencePageItem[] = [];
  isLoadingPages = false;

  // 検索
  searchQuery = '';
  isSearching = false;

  // 選択されたページ
  selectedPages: ConfluencePageItem[] = [];

  // 子ページ読み込み中のページID
  private loadingChildrenIds = new Set<string>();

  ngOnInit(): void {
    if (this.providerName) {
      this.confluenceService.setProviderName(this.providerName);
      this.loadSpaces();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['providerName'] && !changes['providerName'].firstChange) {
      this.confluenceService.setProviderName(this.providerName);
      this.loadSpaces();
    }

    if (changes['initialSelection'] && this.initialSelection) {
      this.applyInitialSelection();
    }
  }

  private applyInitialSelection(): void {
    if (!this.initialSelection) return;
    this.selectedSpaceKey = this.initialSelection.spaceKey;
    this.selectedSpaceName = this.initialSelection.spaceName;
    // 選択ページを復元
    this.selectedPages = this.initialSelection.pages.map(p => ({
      id: p.pageId,
      title: p.title,
      path: p.path,
      spaceKey: this.initialSelection!.spaceKey,
      spaceName: this.initialSelection!.spaceName,
      hasChildren: false,
      level: 0,
    }));
  }

  switchMode(mode: 'spaces' | 'recent'): void {
    this.viewMode = mode;
    this.searchQuery = '';

    if (mode === 'recent') {
      this.loadRecentPages();
    } else {
      if (this.selectedSpaceKey) {
        this.loadSpacePages(this.selectedSpaceKey);
      } else {
        this.displayPages = [];
      }
    }
  }

  private loadSpaces(): void {
    this.isLoadingSpaces = true;
    this.confluenceService.getSpaces(100).pipe(
      catchError(err => {
        console.error('Failed to load spaces:', err);
        return of({ results: [], start: 0, limit: 0, size: 0 });
      })
    ).subscribe(response => {
      this.spaces = response.results.map(s => ({ ...s, pageCount: undefined }));
      this.filteredSpaces = [...this.spaces];
      this.isLoadingSpaces = false;
    });
  }

  filterSpaces(): void {
    if (!this.spaceFilterQuery.trim()) {
      this.filteredSpaces = [...this.spaces];
    } else {
      const query = this.spaceFilterQuery.toLowerCase();
      this.filteredSpaces = this.spaces.filter(s =>
        s.name.toLowerCase().includes(query) || s.key.toLowerCase().includes(query)
      );
    }
  }

  selectSpace(space: ConfluenceSpace): void {
    this.selectedSpaceKey = space.key;
    this.selectedSpaceName = space.name;
    this.searchQuery = '';
    this.loadSpacePages(space.key);
  }

  private loadSpacePages(spaceKey: string): void {
    const space = this.spaces.find(s => s.key === spaceKey);
    if (!space) return;

    this.isLoadingPages = true;
    this.allPages = [];
    this.displayPages = [];

    // スペースキーでルートページを取得
    this.confluenceService.getSpaceRootPages(space.key).pipe(
      catchError(err => {
        console.error('Failed to load space pages:', err);
        return of({ results: [] });
      })
    ).subscribe(response => {
      this.allPages = response.results.map(page => ({
        id: page.id,
        title: page.title,
        spaceKey: spaceKey,
        spaceName: space.name,
        parentId: undefined, // ルートページには親がない
        path: `/${space.name}/${page.title}`,
        hasChildren: true, // 子ページの有無はAPI仕様上取得できないので、とりあえずtrueにして展開時に確認
        isExpanded: false,
        level: 0,
      }));
      this.displayPages = [...this.allPages];
      this.isLoadingPages = false;
    });
  }

  private loadRecentPages(): void {
    this.isLoadingPages = true;
    this.displayPages = [];

    this.confluenceService.getRecentPages(30).pipe(
      catchError(err => {
        console.error('Failed to load recent pages:', err);
        return of({ results: [], start: 0, limit: 0, size: 0 });
      })
    ).subscribe(response => {
      this.displayPages = response.results
        .filter(r => r.content)
        .map(r => ({
          id: r.content!.id,
          title: r.content!.title,
          spaceKey: '',
          spaceName: r.resultGlobalContainer?.title || '',
          path: r.url || '',
          hasChildren: false,
          level: 0,
        }));
      this.isLoadingPages = false;
    });
  }

  onSearchInput(): void {
    // デバウンス処理は必要に応じて追加
  }

  executeSearch(): void {
    if (!this.searchQuery.trim()) return;

    this.isSearching = true;
    this.confluenceService.searchContent(this.searchQuery, this.selectedSpaceKey || undefined).pipe(
      catchError(err => {
        console.error('Search failed:', err);
        return of({ results: [], start: 0, limit: 0, size: 0 });
      })
    ).subscribe(response => {
      this.displayPages = response.results
        .filter(r => r.content)
        .map(r => ({
          id: r.content!.id,
          title: r.content!.title,
          spaceKey: '',
          spaceName: r.resultGlobalContainer?.title || '',
          path: r.url || '',
          hasChildren: false,
          level: 0,
        }));
      this.isSearching = false;
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    if (this.viewMode === 'spaces' && this.selectedSpaceKey) {
      this.loadSpacePages(this.selectedSpaceKey);
    } else if (this.viewMode === 'recent') {
      this.loadRecentPages();
    } else {
      this.displayPages = [];
    }
  }

  toggleExpand(page: ConfluencePageItem): void {
    if (page.isExpanded) {
      // 閉じる：子ページを非表示
      page.isExpanded = false;
      this.collapseChildren(page);
    } else {
      // 開く：子ページを読み込み
      page.isExpanded = true;
      this.loadChildPages(page);
    }
  }

  private loadChildPages(parentPage: ConfluencePageItem): void {
    if (this.loadingChildrenIds.has(parentPage.id)) return;
    this.loadingChildrenIds.add(parentPage.id);

    this.confluenceService.getChildPages(parentPage.id).pipe(
      catchError(err => {
        console.error('Failed to load child pages:', err);
        return of([]);
      })
    ).subscribe(childPageList => {
      this.loadingChildrenIds.delete(parentPage.id);

      if (childPageList.length === 0) {
        parentPage.hasChildren = false;
        return;
      }

      const childPages: ConfluencePageItem[] = childPageList.map(page => ({
        id: page.id,
        title: page.title,
        spaceKey: parentPage.spaceKey,
        spaceName: parentPage.spaceName,
        parentId: parentPage.id,
        path: `${parentPage.path}/${page.title}`,
        hasChildren: true,
        isExpanded: false,
        level: parentPage.level + 1,
      }));

      // displayPagesに子ページを挿入
      const parentIndex = this.displayPages.findIndex(p => p.id === parentPage.id);
      if (parentIndex !== -1) {
        this.displayPages = [
          ...this.displayPages.slice(0, parentIndex + 1),
          ...childPages,
          ...this.displayPages.slice(parentIndex + 1)
        ];
      }
    });
  }

  private collapseChildren(parentPage: ConfluencePageItem): void {
    // 再帰的に子ページを削除
    const removeChildren = (parentId: string) => {
      const children = this.displayPages.filter(p => p.parentId === parentId);
      children.forEach(child => {
        child.isExpanded = false;
        removeChildren(child.id);
      });
      this.displayPages = this.displayPages.filter(p => p.parentId !== parentId);
    };
    removeChildren(parentPage.id);
  }

  onPageClick(event: MouseEvent, page: ConfluencePageItem): void {
    if (event.metaKey || event.ctrlKey) {
      this.togglePageSelect(page);
    } else {
      // 通常クリックでも選択トグル
      this.togglePageSelect(page);
    }
  }

  togglePageSelect(page: ConfluencePageItem): void {
    if (this.isPageSelected(page)) {
      this.selectedPages = this.selectedPages.filter(p => p.id !== page.id);
    } else {
      this.selectedPages = [...this.selectedPages, page];
    }
    this.emitSelection();
  }

  isPageSelected(page: ConfluencePageItem): boolean {
    return this.selectedPages.some(p => p.id === page.id);
  }

  removePage(page: ConfluencePageItem): void {
    this.selectedPages = this.selectedPages.filter(p => p.id !== page.id);
    this.emitSelection();
  }

  clearAllPages(): void {
    this.selectedPages = [];
    this.emitSelection();
  }

  private emitSelection(): void {
    // 選択されたページが複数スペースにまたがる場合は最初のスペースを使用
    const firstPage = this.selectedPages[0];
    const spaceKey = firstPage?.spaceKey || this.selectedSpaceKey;
    const spaceName = firstPage?.spaceName || this.selectedSpaceName;

    this.selectionChanged.emit({
      spaceKey,
      spaceName,
      pages: this.selectedPages.map(p => ({
        pageId: p.id,
        title: p.title,
        path: p.path,
      })),
      selectAll: false,
    });
  }
}
