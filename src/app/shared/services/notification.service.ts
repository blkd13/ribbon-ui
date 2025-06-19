import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationConfig extends Partial<MatSnackBarConfig> {
  type?: NotificationType;
  action?: string;
  autoClose?: boolean;
}

/**
 * 統一された通知管理サービス
 * MatSnackBarを基盤とした一貫した通知システムを提供
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  // デフォルト設定
  private readonly defaultConfigs: Record<NotificationType, NotificationConfig> = {
    success: {
      duration: 3000,
      panelClass: ['success-snackbar'],
      action: '閉じる'
    },
    error: {
      duration: 5000,
      panelClass: ['error-snackbar'],
      action: '閉じる'
    },
    warning: {
      duration: 4000,
      panelClass: ['warning-snackbar'],
      action: '閉じる'
    },
    info: {
      duration: 3000,
      panelClass: ['info-snackbar'],
      action: '閉じる'
    }
  };

  /**
   * 成功メッセージを表示
   * @param message メッセージ
   * @param config 追加設定
   */
  showSuccess(message: string, config?: Partial<NotificationConfig>): void {
    this.show(message, 'success', config);
  }

  /**
   * エラーメッセージを表示
   * @param message メッセージ
   * @param config 追加設定
   */
  showError(message: string, config?: Partial<NotificationConfig>): void {
    this.show(message, 'error', config);
  }

  /**
   * 警告メッセージを表示
   * @param message メッセージ
   * @param config 追加設定
   */
  showWarning(message: string, config?: Partial<NotificationConfig>): void {
    this.show(message, 'warning', config);
  }

  /**
   * 情報メッセージを表示
   * @param message メッセージ
   * @param config 追加設定
   */
  showInfo(message: string, config?: Partial<NotificationConfig>): void {
    this.show(message, 'info', config);
  }

  /**
   * API操作結果の通知
   * @param success 成功かどうか
   * @param successMessage 成功時のメッセージ
   * @param errorMessage エラー時のメッセージ
   * @param config 追加設定
   */
  showApiResult(
    success: boolean, 
    successMessage: string, 
    errorMessage: string, 
    config?: Partial<NotificationConfig>
  ): void {
    if (success) {
      this.showSuccess(successMessage, config);
    } else {
      this.showError(errorMessage, config);
    }
  }

  /**
   * 長いエラーメッセージ（JSON等）の表示
   * @param error エラーオブジェクトまたは文字列
   * @param title エラータイトル（省略可）
   */
  showLongError(error: any, title?: string): void {
    let message = title ? `${title}: ` : '';
    
    if (typeof error === 'string') {
      message += error;
    } else if (error?.message) {
      message += error.message;
    } else {
      message += JSON.stringify(error);
    }

    this.show(message, 'error', { 
      duration: 10000,
      action: '閉じる'
    });
  }

  /**
   * 操作確認後の結果通知
   * @param operation 操作名
   * @param success 成功かどうか
   */
  showOperationResult(operation: string, success: boolean): void {
    if (success) {
      this.showSuccess(`${operation}しました`);
    } else {
      this.showError(`${operation}に失敗しました`);
    }
  }

  /**
   * ファイル操作結果の通知
   * @param operation 操作名（アップロード、ダウンロード等）
   * @param fileName ファイル名
   * @param success 成功かどうか
   */
  showFileOperationResult(operation: string, fileName: string, success: boolean): void {
    if (success) {
      this.showSuccess(`${fileName}を${operation}しました`);
    } else {
      this.showError(`${fileName}の${operation}に失敗しました`);
    }
  }

  /**
   * コピー操作の通知
   * @param target コピー対象
   */
  showCopySuccess(target: string): void {
    this.showSuccess(`${target}をコピーしました`, { duration: 2000 });
  }

  /**
   * バリデーションエラーの通知
   * @param message エラーメッセージ
   */
  showValidationError(message: string): void {
    this.showError(message, { duration: 4000 });
  }

  /**
   * 処理中の制限通知
   * @param message 制限メッセージ
   */
  showProcessingWarning(message: string): void {
    this.showWarning(message, { duration: 3000 });
  }

  /**
   * 基本的な通知表示メソッド
   * @param message メッセージ
   * @param type 通知タイプ
   * @param config 追加設定
   */
  private show(message: string, type: NotificationType, config?: Partial<NotificationConfig>): void {
    const defaultConfig = this.defaultConfigs[type];
    const finalConfig: MatSnackBarConfig = {
      ...defaultConfig,
      ...config,
      // panelClassは配列をマージ
      panelClass: [
        ...(defaultConfig.panelClass || []),
        ...(config?.panelClass || [])
      ]
    };

    const action = (finalConfig as any).action;
    delete (finalConfig as any).action; // MatSnackBarConfigからactionを除去

    this.snackBar.open(message, action, finalConfig);
  }

  /**
   * 全ての通知を閉じる
   */
  dismissAll(): void {
    this.snackBar.dismiss();
  }
}