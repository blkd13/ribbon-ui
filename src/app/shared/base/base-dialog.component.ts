import { Component, inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

/**
 * ダイアログコンポーネントの基底クラス
 * 共通のダイアログ操作、データ注入、状態管理を提供
 */
@Component({
  template: ''
})
export abstract class BaseDialogComponent<TData = any, TResult = any> {
  protected readonly dialogRef = inject(MatDialogRef<BaseDialogComponent<TData, TResult>>);
  protected readonly data = inject<TData>(MAT_DIALOG_DATA);

  protected isLoading = false;
  protected isSaving = false;
  protected error: string | null = null;

  /**
   * ダイアログを閉じて結果を返す
   * @param result 結果データ
   */
  protected close(result?: TResult): void {
    this.dialogRef.close(result);
  }

  /**
   * ダイアログをキャンセルして閉じる
   */
  protected cancel(): void {
    this.dialogRef.close();
  }

  /**
   * 確認ダイアログで結果を返す
   * @param result 確認結果
   */
  protected confirm(result: TResult): void {
    this.close(result);
  }

  /**
   * ローディング状態を設定
   * @param loading ローディング状態
   */
  protected setLoading(loading: boolean): void {
    this.isLoading = loading;
  }

  /**
   * 保存中状態を設定
   * @param saving 保存中状態
   */
  protected setSaving(saving: boolean): void {
    this.isSaving = saving;
  }

  /**
   * エラーメッセージを設定
   * @param error エラーメッセージ
   */
  protected setError(error: string | null): void {
    this.error = error;
  }

  /**
   * エラー状態をクリア
   */
  protected clearError(): void {
    this.error = null;
  }

  /**
   * データが存在するかチェック
   * @returns データが存在する場合はtrue
   */
  protected hasData(): boolean {
    return this.data != null;
  }

  /**
   * 非同期処理を実行する共通メソッド
   * @param operation 実行する非同期処理
   * @param successMessage 成功時のメッセージ
   * @param errorMessage エラー時のメッセージ
   * @returns Promise<boolean> 成功時はtrue
   */
  protected async executeAsync<T>(
    operation: () => Promise<T>,
    successMessage?: string,
    errorMessage?: string
  ): Promise<boolean> {
    try {
      this.clearError();
      this.setSaving(true);
      
      const result = await operation();
      
      if (successMessage) {
        // 成功メッセージの表示は具象クラスで実装
        console.log(successMessage);
      }
      
      return true;
    } catch (error) {
      const message = errorMessage || this.getErrorMessage(error);
      this.setError(message);
      console.error('Dialog operation failed:', error);
      return false;
    } finally {
      this.setSaving(false);
    }
  }

  /**
   * エラーオブジェクトからメッセージを抽出
   * @param error エラーオブジェクト
   * @returns エラーメッセージ
   */
  protected getErrorMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error?.error?.message) {
      return error.error.message;
    }
    
    if (error?.message) {
      return error.message;
    }
    
    return '操作中にエラーが発生しました';
  }

  /**
   * ダイアログの外側クリックを無効化
   */
  protected disableClose(): void {
    this.dialogRef.disableClose = true;
  }

  /**
   * ダイアログの外側クリックを有効化
   */
  protected enableClose(): void {
    this.dialogRef.disableClose = false;
  }

  /**
   * Escapeキーによるクローズを制御
   * @param hasBackdropClick バックドロップクリックを許可するか
   */
  protected setCloseOnEscape(hasBackdropClick: boolean): void {
    this.dialogRef.keydownEvents().subscribe(event => {
      if (event.key === 'Escape' && !hasBackdropClick) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  /**
   * ダイアログサイズを動的に変更
   * @param width 幅
   * @param height 高さ
   */
  protected updateSize(width?: string, height?: string): void {
    this.dialogRef.updateSize(width, height);
  }

  /**
   * ダイアログポジションを動的に変更
   * @param position ポジション設定
   */
  protected updatePosition(position?: { top?: string; bottom?: string; left?: string; right?: string }): void {
    this.dialogRef.updatePosition(position);
  }
}