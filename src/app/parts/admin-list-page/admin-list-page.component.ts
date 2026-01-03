import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  EventEmitter,
  Input,
  Output,
  TemplateRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  AdminActionEvent,
  AdminBulkAction,
  AdminColumnDef,
  AdminFilterDef,
  AdminFilterValues,
  AdminHeaderAction,
  AdminRowAction,
  AdminSortState,
} from './admin-list-page.types';

@Component({
  selector: 'app-admin-list-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-list-page.component.html',
  styleUrl: './admin-list-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminListPageComponent<T = any> {
  // ========== Inputs ==========

  /** ページタイトル */
  @Input() title = '';

  /** サブタイトル（スコープ情報など） */
  @Input() subtitle = '';

  /** データ */
  @Input() data: T[] = [];

  /** カラム定義 */
  @Input() columns: AdminColumnDef<T>[] = [];

  /** フィルター定義 */
  @Input() filters: AdminFilterDef[] = [];

  /** フィルター値 */
  @Input() filterValues: AdminFilterValues = {};

  /** ソート状態 */
  @Input() sortState: AdminSortState = { column: null, direction: 'desc' };

  /** ヘッダーアクション */
  @Input() headerActions: AdminHeaderAction[] = [];

  /** 一括操作アクション */
  @Input() bulkActions: AdminBulkAction[] = [];

  /** 行アクション */
  @Input() rowActions: AdminRowAction<T>[] = [];

  /** 選択中のアイテムID */
  @Input() selectedIds: Set<string> = new Set();

  /** 現在選択中（編集中）のアイテムID */
  @Input() activeItemId: string | null = null;

  /** チェックボックスを表示するか */
  @Input() showCheckbox = true;

  /** 空状態のメッセージ */
  @Input() emptyMessage = 'No data found';

  /** 空状態のアイコン */
  @Input() emptyIcon = 'info';

  /** ローディング中か */
  @Input() isLoading = false;

  /** フォームパネルを表示するか */
  @Input() isFormVisible = false;

  /** アイテムのID取得関数 */
  @Input() trackByFn: (item: T) => string = (item: any) => item.id;

  /** 行のCSSクラス取得関数 */
  @Input() rowClassFn?: (item: T) => string | string[] | Record<string, boolean>;

  // ========== Outputs ==========

  /** フィルター変更 */
  @Output() filterChange = new EventEmitter<AdminFilterValues>();

  /** ソート変更 */
  @Output() sortChange = new EventEmitter<AdminSortState>();

  /** アイテム選択（行クリック） */
  @Output() itemSelect = new EventEmitter<T>();

  /** チェックボックス選択変更 */
  @Output() selectionChange = new EventEmitter<Set<string>>();

  /** アクションクリック */
  @Output() actionClick = new EventEmitter<AdminActionEvent<T>>();

  /** フォームを閉じる */
  @Output() formClose = new EventEmitter<void>();

  // ========== Content Projection ==========

  /** フォームパネルテンプレート */
  @ContentChild('formPanel') formPanelTemplate?: TemplateRef<any>;

  /** ヘッダー追加コンテンツ */
  @ContentChild('headerExtra') headerExtraTemplate?: TemplateRef<any>;

  /** フィルターバー追加コンテンツ */
  @ContentChild('filterExtra') filterExtraTemplate?: TemplateRef<any>;

  /** カスタムセルテンプレート */
  @ContentChild('cellTemplate') cellTemplate?: TemplateRef<any>;

  // ========== Methods ==========

  /**
   * セルの値を取得
   */
  getCellValue(item: T, column: AdminColumnDef<T>): string {
    if (column.render) {
      return column.render(item, column);
    }
    const value = (item as any)[column.key];
    return value != null ? String(value) : '';
  }

  /**
   * セルのサブ値を取得
   */
  getCellSubValue(item: T, column: AdminColumnDef<T>): string {
    if (column.renderSub) {
      return column.renderSub(item, column);
    }
    return '';
  }

  /**
   * セルのCSSクラスを取得
   */
  getCellClass(item: T, column: AdminColumnDef<T>): string {
    if (typeof column.cellClass === 'function') {
      return column.cellClass(item);
    }
    return column.cellClass || '';
  }

  /**
   * ソートカラムクリック
   */
  onSortClick(column: AdminColumnDef<T>): void {
    if (!column.sortable) return;

    const newDirection =
      this.sortState.column === column.key && this.sortState.direction === 'desc'
        ? 'asc'
        : 'desc';

    this.sortChange.emit({
      column: column.key,
      direction: newDirection,
    });
  }

  /**
   * フィルター値変更
   */
  onFilterChange(key: string, value: any): void {
    this.filterChange.emit({
      ...this.filterValues,
      [key]: value,
    });
  }

  /**
   * フィルターリセット
   */
  onResetFilters(): void {
    const resetValues: AdminFilterValues = {};
    this.filters.forEach((f) => {
      resetValues[f.key] = f.defaultValue ?? (f.type === 'multi-select' ? [] : '');
    });
    this.filterChange.emit(resetValues);
  }

  /**
   * 行クリック
   */
  onRowClick(item: T): void {
    this.itemSelect.emit(item);
  }

  /**
   * チェックボックス全選択/解除
   */
  onToggleSelectAll(event: MatCheckboxChange): void {
    const newSelection = new Set<string>();
    if (event.checked) {
      this.data.forEach((item) => newSelection.add(this.trackByFn(item)));
    }
    this.selectionChange.emit(newSelection);
  }

  /**
   * 個別チェックボックス
   */
  onToggleSelect(item: T, event: MatCheckboxChange): void {
    const id = this.trackByFn(item);
    const newSelection = new Set(this.selectedIds);
    if (event.checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    this.selectionChange.emit(newSelection);
  }

  /**
   * 全選択状態か
   */
  isAllSelected(): boolean {
    return this.data.length > 0 && this.selectedIds.size === this.data.length;
  }

  /**
   * 一部選択状態か
   */
  isSomeSelected(): boolean {
    return this.selectedIds.size > 0 && this.selectedIds.size < this.data.length;
  }

  /**
   * アイテムが選択されているか
   */
  isSelected(item: T): boolean {
    return this.selectedIds.has(this.trackByFn(item));
  }

  /**
   * ヘッダーアクションが無効か
   */
  isHeaderActionDisabled(action: AdminHeaderAction): boolean {
    return typeof action.disabled === 'function' ? action.disabled() : !!action.disabled;
  }

  /**
   * ヘッダーアクションのツールチップ
   */
  getHeaderActionTooltip(action: AdminHeaderAction): string {
    if (this.isHeaderActionDisabled(action)) {
      if (action.tooltip) {
        return typeof action.tooltip === 'function' ? action.tooltip() : action.tooltip;
      }
      return action.disabledTooltip || '';
    }
    return '';
  }

  /**
   * ヘッダーアクションクリック
   */
  onHeaderActionClick(action: AdminHeaderAction): void {
    if (this.isHeaderActionDisabled(action)) return;
    this.actionClick.emit({ actionId: action.id });
  }

  /**
   * 一括操作アクションクリック
   */
  onBulkActionClick(action: AdminBulkAction): void {
    const disabled = typeof action.disabled === 'function' ? action.disabled() : action.disabled;
    if (disabled) return;

    const selectedItems = this.data.filter((item) => this.selectedIds.has(this.trackByFn(item)));
    this.actionClick.emit({
      actionId: action.id,
      items: selectedItems,
    });
  }

  /**
   * 行アクションクリック
   */
  onRowActionClick(action: AdminRowAction<T>, item: T, event: Event): void {
    event.stopPropagation();
    if (action.disabled?.(item)) return;
    this.actionClick.emit({
      actionId: action.id,
      item,
    });
  }

  /**
   * 行アクションが表示されるか
   */
  isRowActionVisible(action: AdminRowAction<T>, item: T): boolean {
    return action.visible ? action.visible(item) : true;
  }

  /**
   * 行アクションが無効か
   */
  isRowActionDisabled(action: AdminRowAction<T>, item: T): boolean {
    return action.disabled ? action.disabled(item) : false;
  }

  /**
   * 行アクションのツールチップ
   */
  getRowActionTooltip(action: AdminRowAction<T>, item: T): string {
    if (this.isRowActionDisabled(action, item) && action.disabledTooltip) {
      return typeof action.disabledTooltip === 'function'
        ? action.disabledTooltip(item)
        : action.disabledTooltip;
    }
    return typeof action.tooltip === 'function' ? action.tooltip(item) : action.tooltip;
  }

  /**
   * 一括操作が無効か
   */
  isBulkActionDisabled(action: AdminBulkAction): boolean {
    return typeof action.disabled === 'function' ? action.disabled() : !!action.disabled;
  }

  /**
   * フォームを閉じる
   */
  onCloseForm(): void {
    this.formClose.emit();
  }

  /**
   * 行のCSSクラスを取得
   */
  getRowClass(item: T): Record<string, boolean> {
    const baseClass: Record<string, boolean> = {
      selected: this.activeItemId === this.trackByFn(item),
      'bulk-selected': this.isSelected(item),
    };

    if (this.rowClassFn) {
      const customClass = this.rowClassFn(item);
      if (typeof customClass === 'string') {
        baseClass[customClass] = true;
      } else if (Array.isArray(customClass)) {
        customClass.forEach((c) => (baseClass[c] = true));
      } else {
        Object.assign(baseClass, customClass);
      }
    }

    return baseClass;
  }

  /**
   * trackBy関数
   */
  trackByItem(index: number, item: T): string {
    return this.trackByFn(item);
  }
}
