import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

export interface ErrorInfo {
  message: string;
  code?: string;
  details?: any;
  timestamp: Date;
  operation?: string;
}

/**
 * エラーハンドリング共通ユーティリティ
 */
export class ErrorHandlerUtil {

  /**
   * HTTPエラーを統一フォーマットに変換
   * @param error HTTPエラーレスポンス
   * @param operation 実行していた操作名
   * @returns ErrorInfo
   */
  static handleHttpError(error: HttpErrorResponse, operation?: string): ErrorInfo {
    const errorInfo: ErrorInfo = {
      message: '',
      timestamp: new Date(),
      operation
    };

    if (error.error instanceof ErrorEvent) {
      // クライアントサイドエラー
      errorInfo.message = `ネットワークエラー: ${error.error.message}`;
      errorInfo.code = 'CLIENT_ERROR';
    } else {
      // サーバーサイドエラー
      errorInfo.code = error.status?.toString();
      errorInfo.details = error.error;

      switch (error.status) {
        case 400:
          errorInfo.message = this.extractServerMessage(error) || '入力内容を確認してください';
          break;
        case 401:
          errorInfo.message = '認証が必要です。再度ログインしてください';
          break;
        case 403:
          errorInfo.message = 'この操作を実行する権限がありません';
          break;
        case 404:
          errorInfo.message = '要求されたリソースが見つかりません';
          break;
        case 409:
          errorInfo.message = 'データが競合しています。最新の情報を確認してください';
          break;
        case 422:
          errorInfo.message = this.extractValidationMessage(error) || '入力データに問題があります';
          break;
        case 429:
          errorInfo.message = 'リクエストが多すぎます。しばらく待ってから再試行してください';
          break;
        case 500:
          errorInfo.message = 'サーバー内部エラーが発生しました';
          break;
        case 502:
          errorInfo.message = 'サーバーが一時的に利用できません';
          break;
        case 503:
          errorInfo.message = 'サービスが一時的に利用できません';
          break;
        case 504:
          errorInfo.message = 'サーバーの応答がタイムアウトしました';
          break;
        default:
          errorInfo.message = this.extractServerMessage(error) || 
                             `エラーが発生しました (ステータス: ${error.status})`;
      }
    }

    if (operation) {
      errorInfo.message = `${operation}中に${errorInfo.message}`;
    }

    return errorInfo;
  }

  /**
   * サーバーエラーメッセージを抽出
   * @param error HTTPエラーレスポンス
   * @returns エラーメッセージ
   */
  private static extractServerMessage(error: HttpErrorResponse): string | null {
    if (error.error?.message) {
      return error.error.message;
    }
    
    if (error.error?.error?.message) {
      return error.error.error.message;
    }
    
    if (typeof error.error === 'string') {
      return error.error;
    }
    
    if (error.message) {
      return error.message;
    }
    
    return null;
  }

  /**
   * バリデーションエラーメッセージを抽出
   * @param error HTTPエラーレスポンス
   * @returns バリデーションエラーメッセージ
   */
  private static extractValidationMessage(error: HttpErrorResponse): string | null {
    if (error.error?.errors) {
      const errors = error.error.errors;
      
      // Laravel形式のバリデーションエラー
      if (typeof errors === 'object') {
        const messages = Object.values(errors).flat() as string[];
        return messages.join(', ');
      }
      
      // その他の形式
      if (Array.isArray(errors)) {
        return errors.join(', ');
      }
    }
    
    return this.extractServerMessage(error);
  }

  /**
   * 一般的なエラーを処理
   * @param error エラーオブジェクト
   * @param operation 実行していた操作名
   * @returns ErrorInfo
   */
  static handleGenericError(error: any, operation?: string): ErrorInfo {
    const errorInfo: ErrorInfo = {
      message: '',
      timestamp: new Date(),
      operation
    };

    if (error instanceof Error) {
      errorInfo.message = error.message;
      errorInfo.code = error.name;
      errorInfo.details = error.stack;
    } else if (typeof error === 'string') {
      errorInfo.message = error;
    } else {
      errorInfo.message = 'Unknown error occurred';
      errorInfo.details = error;
    }

    if (operation) {
      errorInfo.message = `${operation}中に${errorInfo.message}`;
    }

    return errorInfo;
  }

  /**
   * RxJSのエラーハンドラーを作成
   * @param operation 操作名
   * @param defaultValue デフォルト値（エラー時に返す値）
   * @returns エラーハンドラー関数
   */
  static createRxjsErrorHandler<T>(operation: string, defaultValue?: T): (error: any) => Observable<T> {
    return (error: any): Observable<T> => {
      const errorInfo = error instanceof HttpErrorResponse 
        ? this.handleHttpError(error, operation)
        : this.handleGenericError(error, operation);
      
      console.error('Operation failed:', errorInfo);
      
      if (defaultValue !== undefined) {
        return new Observable(subscriber => {
          subscriber.next(defaultValue);
          subscriber.complete();
        });
      }
      
      return throwError(() => new Error(errorInfo.message));
    };
  }

  /**
   * ユーザーフレンドリーなエラーメッセージを生成
   * @param error エラーオブジェクト
   * @param context 文脈情報
   * @returns ユーザー向けメッセージ
   */
  static getUserFriendlyMessage(error: any, context?: string): string {
    let message = '';
    
    if (error instanceof HttpErrorResponse) {
      const errorInfo = this.handleHttpError(error);
      message = errorInfo.message;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else {
      message = '予期しないエラーが発生しました';
    }
    
    if (context) {
      message = `${context}: ${message}`;
    }
    
    return message;
  }

  /**
   * エラーの重要度を判定
   * @param error エラーオブジェクト
   * @returns 重要度レベル
   */
  static getErrorSeverity(error: any): 'low' | 'medium' | 'high' | 'critical' {
    if (error instanceof HttpErrorResponse) {
      switch (error.status) {
        case 400:
        case 422:
          return 'low'; // バリデーションエラー等
        case 401:
        case 403:
          return 'medium'; // 認証・認可エラー
        case 404:
          return 'medium'; // リソース未発見
        case 409:
          return 'medium'; // 競合エラー
        case 429:
          return 'medium'; // レート制限
        case 500:
        case 502:
        case 503:
        case 504:
          return 'high'; // サーバーエラー
        default:
          return 'medium';
      }
    }
    
    if (error instanceof Error) {
      if (error.name === 'TypeError' || error.name === 'ReferenceError') {
        return 'critical'; // コードエラー
      }
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * エラーをログに記録
   * @param error エラーオブジェクト
   * @param operation 操作名
   * @param additionalInfo 追加情報
   */
  static logError(error: any, operation?: string, additionalInfo?: any): void {
    const errorInfo = error instanceof HttpErrorResponse 
      ? this.handleHttpError(error, operation)
      : this.handleGenericError(error, operation);
    
    const severity = this.getErrorSeverity(error);
    
    const logEntry = {
      ...errorInfo,
      severity,
      additionalInfo,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    // 重要度に応じてログレベルを変更
    switch (severity) {
      case 'critical':
        console.error('CRITICAL ERROR:', logEntry);
        break;
      case 'high':
        console.error('HIGH SEVERITY ERROR:', logEntry);
        break;
      case 'medium':
        console.warn('MEDIUM SEVERITY ERROR:', logEntry);
        break;
      case 'low':
        console.log('LOW SEVERITY ERROR:', logEntry);
        break;
    }
    
    // 本来はここで外部ログサービスに送信
    // this.sendToLogService(logEntry);
  }

  /**
   * ネットワークエラーかどうかを判定
   * @param error エラーオブジェクト
   * @returns ネットワークエラーの場合はtrue
   */
  static isNetworkError(error: any): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 0 || error.error instanceof ErrorEvent;
    }
    return false;
  }

  /**
   * 認証エラーかどうかを判定
   * @param error エラーオブジェクト
   * @returns 認証エラーの場合はtrue
   */
  static isAuthError(error: any): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 401 || error.status === 403;
    }
    return false;
  }

  /**
   * バリデーションエラーかどうかを判定
   * @param error エラーオブジェクト
   * @returns バリデーションエラーの場合はtrue
   */
  static isValidationError(error: any): boolean {
    if (error instanceof HttpErrorResponse) {
      return error.status === 400 || error.status === 422;
    }
    return false;
  }

  /**
   * 再試行可能なエラーかどうかを判定
   * @param error エラーオブジェクト
   * @returns 再試行可能な場合はtrue
   */
  static isRetryableError(error: any): boolean {
    if (error instanceof HttpErrorResponse) {
      return [429, 500, 502, 503, 504].includes(error.status) || 
             this.isNetworkError(error);
    }
    return false;
  }
}