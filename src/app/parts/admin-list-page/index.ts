/**
 * Admin List Page 共通コンポーネント
 *
 * 管理画面のリスト表示に共通のパターンを提供します。
 *
 * @example
 * ```typescript
 * import { AdminListPageComponent, AdminColumnDef, AdminFilterDef } from '@app/parts/admin-list-page';
 *
 * const columns: AdminColumnDef<MyItem>[] = [
 *   { key: 'name', label: '名前', sortable: true },
 *   { key: 'status', label: 'ステータス', render: (item) => item.isActive ? '有効' : '無効' },
 * ];
 *
 * const filters: AdminFilterDef[] = [
 *   { key: 'search', label: '検索', type: 'text', placeholder: '名前で検索...' },
 *   { key: 'status', label: 'ステータス', type: 'boolean' },
 * ];
 * ```
 */

export * from './admin-list-page.component';
export * from './admin-list-page.types';
