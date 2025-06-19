import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject, Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, startWith, map } from 'rxjs/operators';
import { NotificationService } from '../services/notification.service';

export interface ListItem {
  id: string;
  [key: string]: any;
}

export interface ListFilter {
  searchTerm?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  [key: string]: any;
}

export interface PaginationConfig {
  pageSize: number;
  pageSizeOptions: number[];
  showFirstLastButtons: boolean;
}

/**
 * リストコンポーネントの基底クラス
 * 共通の一覧表示、検索、フィルタリング、ページネーション機能を提供
 */
@Component({
  template: ''
})
export abstract class BaseListComponent<T extends ListItem> implements OnInit, OnDestroy {
  private notificationService = inject(NotificationService);
  private destroy$ = new Subject<void>();

  // データ関連
  protected items: T[] = [];
  protected filteredItems: T[] = [];
  protected selectedItems: T[] = [];

  // 状態管理
  protected isLoading = false;
  protected error: string | null = null;
  private itemsSubject = new BehaviorSubject<T[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  // 検索・フィルタ
  protected searchControl = new FormControl('');
  protected sortByControl = new FormControl('');
  protected sortDirectionControl = new FormControl<'asc' | 'desc'>('asc');
  private additionalFilters = new BehaviorSubject<{ [key: string]: any }>({});

  // ページネーション
  protected pageIndex = 0;
  protected pageSize = 10;
  protected totalItems = 0;
  protected paginationConfig: PaginationConfig = {
    pageSize: 10,
    pageSizeOptions: [5, 10, 25, 50],
    showFirstLastButtons: true
  };

  // 選択機能
  protected allowMultipleSelection = false;
  protected allowSingleSelection = true;
  private selectedItemsSubject = new BehaviorSubject<T[]>([]);

  // Observable streams
  public items$ = this.itemsSubject.asObservable();
  public loading$ = this.loadingSubject.asObservable();
  public selectedItems$ = this.selectedItemsSubject.asObservable();

  ngOnInit(): void {
    this.setupSearch();
    this.setupFilters();
    this.loadItems();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * アイテム読み込み（継承クラスで実装）
   */
  protected abstract loadItems(): void;

  /**
   * アイテムフィルタリング（継承クラスでオーバーライド可能）
   * @param items アイテム配列
   * @param filters フィルタ条件
   * @returns フィルタリング済みアイテム配列
   */
  protected filterItems(items: T[], filters: ListFilter): T[] {
    let filtered = [...items];

    // 検索文字列でフィルタ
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const searchTerm = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        this.getSearchableText(item).toLowerCase().includes(searchTerm)
      );
    }

    // 追加フィルタを適用
    filtered = this.applyAdditionalFilters(filtered, filters);

    // ソート
    if (filters.sortBy) {
      filtered = this.sortItems(filtered, filters.sortBy, filters.sortDirection || 'asc');
    }

    return filtered;
  }

  /**
   * 検索対象テキストを取得（継承クラスでオーバーライド）
   * @param item アイテム
   * @returns 検索対象テキスト
   */
  protected getSearchableText(item: T): string {
    return Object.values(item).join(' ');
  }

  /**
   * 追加フィルタを適用（継承クラスでオーバーライド可能）
   * @param items アイテム配列
   * @param filters フィルタ条件
   * @returns フィルタリング済みアイテム配列
   */
  protected applyAdditionalFilters(items: T[], filters: ListFilter): T[] {
    return items;
  }

  /**
   * アイテムをソート
   * @param items アイテム配列
   * @param sortBy ソートキー
   * @param direction ソート方向
   * @returns ソート済みアイテム配列
   */
  protected sortItems(items: T[], sortBy: string, direction: 'asc' | 'desc'): T[] {
    return items.sort((a, b) => {
      const aValue = this.getNestedValue(a, sortBy);
      const bValue = this.getNestedValue(b, sortBy);

      if (aValue === bValue) return 0;
      
      const result = aValue > bValue ? 1 : -1;
      return direction === 'asc' ? result : -result;
    });
  }

  /**
   * ネストしたプロパティの値を取得
   * @param obj オブジェクト
   * @param path プロパティパス
   * @returns 値
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * データを設定
   * @param items アイテム配列
   */
  protected setItems(items: T[]): void {
    this.items = items;
    this.itemsSubject.next(items);
    this.applyCurrentFilters();
  }

  /**
   * ローディング状態を設定
   * @param loading ローディング状態
   */
  protected setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.loadingSubject.next(loading);
  }

  /**
   * エラーを設定
   * @param error エラーメッセージ
   */
  protected setError(error: string | null): void {
    this.error = error;
    if (error) {
      this.notificationService.showError(error);
    }
  }

  /**
   * 検索とフィルタの設定
   */
  private setupSearch(): void {
    const search$ = this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged()
    );

    const sort$ = combineLatest([
      this.sortByControl.valueChanges.pipe(startWith('')),
      this.sortDirectionControl.valueChanges.pipe(startWith('asc'))
    ]);

    combineLatest([search$, sort$, this.additionalFilters])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.applyCurrentFilters();
      });
  }

  /**
   * フィルタの設定
   */
  private setupFilters(): void {
    // フィルタ変更時の処理は setupSearch で行う
  }

  /**
   * 現在のフィルタを適用
   */
  private applyCurrentFilters(): void {
    const filters: ListFilter = {
      searchTerm: this.searchControl.value || '',
      sortBy: this.sortByControl.value || '',
      sortDirection: this.sortDirectionControl.value || 'asc',
      ...this.additionalFilters.value
    };

    this.filteredItems = this.filterItems(this.items, filters);
    this.totalItems = this.filteredItems.length;
    
    // ページネーションがある場合は現在のページを調整
    if (this.pageIndex * this.pageSize >= this.totalItems) {
      this.pageIndex = Math.max(0, Math.ceil(this.totalItems / this.pageSize) - 1);
    }
  }

  /**
   * 追加フィルタを設定
   * @param filters フィルタオブジェクト
   */
  protected setAdditionalFilters(filters: { [key: string]: any }): void {
    this.additionalFilters.next(filters);
  }

  /**
   * 検索文字列をクリア
   */
  protected clearSearch(): void {
    this.searchControl.setValue('');
  }

  /**
   * ソートを変更
   * @param sortBy ソートキー
   */
  protected toggleSort(sortBy: string): void {
    const currentSort = this.sortByControl.value;
    const currentDirection = this.sortDirectionControl.value;

    if (currentSort === sortBy) {
      // 同じカラムの場合は方向を反転
      this.sortDirectionControl.setValue(currentDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // 異なるカラムの場合は昇順から開始
      this.sortByControl.setValue(sortBy);
      this.sortDirectionControl.setValue('asc');
    }
  }

  /**
   * アイテムを選択
   * @param item アイテム
   * @param selected 選択状態
   */
  protected selectItem(item: T, selected: boolean): void {
    if (selected) {
      if (this.allowMultipleSelection) {
        if (!this.selectedItems.find(i => i.id === item.id)) {
          this.selectedItems.push(item);
        }
      } else {
        this.selectedItems = [item];
      }
    } else {
      this.selectedItems = this.selectedItems.filter(i => i.id !== item.id);
    }
    
    this.selectedItemsSubject.next([...this.selectedItems]);
  }

  /**
   * 全アイテムを選択
   * @param selected 選択状態
   */
  protected selectAll(selected: boolean): void {
    if (!this.allowMultipleSelection) return;

    if (selected) {
      this.selectedItems = [...this.filteredItems];
    } else {
      this.selectedItems = [];
    }
    
    this.selectedItemsSubject.next([...this.selectedItems]);
  }

  /**
   * アイテムが選択されているかチェック
   * @param item アイテム
   * @returns 選択されている場合はtrue
   */
  protected isSelected(item: T): boolean {
    return this.selectedItems.some(i => i.id === item.id);
  }

  /**
   * 全アイテムが選択されているかチェック
   * @returns 全て選択されている場合はtrue
   */
  protected isAllSelected(): boolean {
    return this.filteredItems.length > 0 && 
           this.filteredItems.every(item => this.isSelected(item));
  }

  /**
   * 一部のアイテムが選択されているかチェック
   * @returns 一部選択されている場合はtrue
   */
  protected isIndeterminate(): boolean {
    const selectedCount = this.filteredItems.filter(item => this.isSelected(item)).length;
    return selectedCount > 0 && selectedCount < this.filteredItems.length;
  }

  /**
   * 選択をクリア
   */
  protected clearSelection(): void {
    this.selectedItems = [];
    this.selectedItemsSubject.next([]);
  }

  /**
   * ページサイズ変更
   * @param size ページサイズ
   */
  protected changePageSize(size: number): void {
    this.pageSize = size;
    this.pageIndex = 0; // 最初のページに戻る
  }

  /**
   * ページ変更
   * @param index ページインデックス
   */
  protected changePage(index: number): void {
    this.pageIndex = index;
  }

  /**
   * 表示用のアイテムを取得（ページネーション適用）
   * @returns 表示アイテム配列
   */
  protected getDisplayItems(): T[] {
    const startIndex = this.pageIndex * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredItems.slice(startIndex, endIndex);
  }

  /**
   * リフレッシュ
   */
  protected refresh(): void {
    this.clearError();
    this.loadItems();
  }

  /**
   * エラーをクリア
   */
  protected clearError(): void {
    this.error = null;
  }
}