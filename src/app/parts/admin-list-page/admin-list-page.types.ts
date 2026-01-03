/**
 * 管理画面リストページ共通コンポーネント用の型定義
 */

import { TemplateRef } from '@angular/core';

/**
 * テーブルカラム定義
 */
export interface AdminColumnDef<T = any> {
  /** カラムのキー（データのプロパティ名） */
  key: string;

  /** ヘッダーラベル */
  label: string;

  /** サブラベル（ヘッダー下に小さく表示） */
  subLabel?: string;

  /** ソート可能か */
  sortable?: boolean;

  /** カラム幅（px or %） */
  width?: string;

  /** 右寄せ */
  align?: 'left' | 'center' | 'right';

  /** セル表示用のレンダー関数 */
  render?: (item: T, column: AdminColumnDef<T>) => string;

  /** サブテキスト用のレンダー関数 */
  renderSub?: (item: T, column: AdminColumnDef<T>) => string;

  /** カスタムテンプレート（render関数より優先） */
  template?: TemplateRef<any>;

  /** CSSクラス */
  cellClass?: string | ((item: T) => string);
}

/**
 * フィルター定義
 */
export interface AdminFilterDef {
  /** フィルターのキー */
  key: string;

  /** ラベル */
  label: string;

  /** フィルタータイプ */
  type: 'text' | 'select' | 'multi-select' | 'boolean';

  /** 選択肢（select/multi-select用） */
  options?: AdminFilterOption[];

  /** プレースホルダー */
  placeholder?: string;

  /** 初期値 */
  defaultValue?: any;

  /** アイコン */
  icon?: string;
}

export interface AdminFilterOption {
  value: any;
  label: string;
}

/**
 * フィルター値
 */
export interface AdminFilterValues {
  [key: string]: any;
}

/**
 * ソート状態
 */
export interface AdminSortState {
  column: string | null;
  direction: 'asc' | 'desc';
}

/**
 * ヘッダーアクションボタン定義
 */
export interface AdminHeaderAction {
  /** アクションID */
  id: string;

  /** ラベル */
  label: string;

  /** アイコン */
  icon?: string;

  /** ボタンカラー */
  color?: 'primary' | 'accent' | 'warn' | '';

  /** 無効状態（静的値または関数） */
  disabled?: boolean | (() => boolean);

  /** 無効時のツールチップ（静的値または関数） */
  tooltip?: string | (() => string);

  /** 無効時のツールチップ（後方互換） */
  disabledTooltip?: string;
}

/**
 * 一括操作アクション定義
 */
export interface AdminBulkAction {
  /** アクションID */
  id: string;

  /** ラベル */
  label: string;

  /** アイコン */
  icon?: string;

  /** ボタンカラー */
  color?: 'primary' | 'accent' | 'warn' | '';

  /** 無効状態判定関数 */
  disabled?: boolean | (() => boolean);
}

/**
 * 行アクション定義
 */
export interface AdminRowAction<T = any> {
  /** アクションID */
  id: string;

  /** アイコン */
  icon: string;

  /** ツールチップ */
  tooltip: string | ((item: T) => string);

  /** 表示条件 */
  visible?: (item: T) => boolean;

  /** 無効条件 */
  disabled?: (item: T) => boolean;

  /** 無効時ツールチップ */
  disabledTooltip?: string | ((item: T) => string);

  /** ボタンカラー */
  color?: 'primary' | 'accent' | 'warn' | '';

  /** CSSクラス */
  class?: string;
}

/**
 * アクションイベント
 */
export interface AdminActionEvent<T = any> {
  actionId: string;
  item?: T;
  items?: T[];
}

/**
 * ページ設定
 */
export interface AdminListPageConfig<T = any> {
  /** ページタイトル */
  title: string;

  /** サブタイトル（スコープ情報など） */
  subtitle?: string;

  /** カラム定義 */
  columns: AdminColumnDef<T>[];

  /** フィルター定義 */
  filters?: AdminFilterDef[];

  /** ヘッダーアクション */
  headerActions?: AdminHeaderAction[];

  /** 一括操作アクション */
  bulkActions?: AdminBulkAction[];

  /** 行アクション */
  rowActions?: AdminRowAction<T>[];

  /** チェックボックスを表示するか */
  showCheckbox?: boolean;

  /** 空状態のメッセージ */
  emptyMessage?: string;

  /** 空状態のアイコン */
  emptyIcon?: string;

  /** ローディング中か */
  isLoading?: boolean;

  /** アイテムのID取得関数 */
  trackBy?: (item: T) => string;
}
