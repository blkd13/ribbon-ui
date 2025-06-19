import { AbstractControl, ValidationErrors, ValidatorFn, FormGroup } from '@angular/forms';

/**
 * フォームバリデーション共通ユーティリティ
 */
export class FormValidationUtil {
  
  /**
   * 日本語文字（ひらがな、カタカナ、漢字）のバリデータ
   */
  static japanese(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const japaneseRegex = /^[ひらがなカタカナ漢字ー\s]+$/;
      const value = control.value.toString();
      
      if (!japaneseRegex.test(value)) {
        return { japanese: { value: control.value } };
      }
      
      return null;
    };
  }

  /**
   * 英数字のみのバリデータ
   */
  static alphanumeric(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;
      const value = control.value.toString();
      
      if (!alphanumericRegex.test(value)) {
        return { alphanumeric: { value: control.value } };
      }
      
      return null;
    };
  }

  /**
   * 日本の郵便番号バリデータ（123-4567形式）
   */
  static zipCode(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const zipCodeRegex = /^\d{3}-\d{4}$/;
      const value = control.value.toString();
      
      if (!zipCodeRegex.test(value)) {
        return { zipCode: { value: control.value } };
      }
      
      return null;
    };
  }

  /**
   * 日本の電話番号バリデータ
   */
  static phoneNumber(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      // 03-1234-5678, 090-1234-5678, 0120-123-456等の形式に対応
      const phoneRegex = /^(\d{2,4}-\d{2,4}-\d{3,4}|\d{10,11})$/;
      const value = control.value.toString().replace(/[^\d-]/g, '');
      
      if (!phoneRegex.test(value)) {
        return { phoneNumber: { value: control.value } };
      }
      
      return null;
    };
  }

  /**
   * URLバリデータ
   */
  static url(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      try {
        new URL(control.value);
        return null;
      } catch {
        return { url: { value: control.value } };
      }
    };
  }

  /**
   * パスワード強度バリデータ
   * 英大小文字、数字、記号を含む8文字以上
   */
  static strongPassword(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const value = control.value.toString();
      const hasLowerCase = /[a-z]/.test(value);
      const hasUpperCase = /[A-Z]/.test(value);
      const hasNumbers = /\d/.test(value);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
      const hasMinLength = value.length >= 8;
      
      const errors: any = {};
      
      if (!hasMinLength) errors.minLength = true;
      if (!hasLowerCase) errors.lowercase = true;
      if (!hasUpperCase) errors.uppercase = true;
      if (!hasNumbers) errors.numbers = true;
      if (!hasSpecialChar) errors.specialChar = true;
      
      return Object.keys(errors).length > 0 ? { strongPassword: errors } : null;
    };
  }

  /**
   * 数値範囲バリデータ
   */
  static numberRange(min?: number, max?: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value && control.value !== 0) {
        return null;
      }
      
      const numValue = Number(control.value);
      
      if (isNaN(numValue)) {
        return { numberRange: { value: control.value, error: 'notNumber' } };
      }
      
      if (min !== undefined && numValue < min) {
        return { numberRange: { value: control.value, min, error: 'min' } };
      }
      
      if (max !== undefined && numValue > max) {
        return { numberRange: { value: control.value, max, error: 'max' } };
      }
      
      return null;
    };
  }

  /**
   * 日付範囲バリデータ
   */
  static dateRange(minDate?: Date, maxDate?: Date): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const date = new Date(control.value);
      
      if (isNaN(date.getTime())) {
        return { dateRange: { value: control.value, error: 'invalidDate' } };
      }
      
      if (minDate && date < minDate) {
        return { dateRange: { value: control.value, minDate, error: 'min' } };
      }
      
      if (maxDate && date > maxDate) {
        return { dateRange: { value: control.value, maxDate, error: 'max' } };
      }
      
      return null;
    };
  }

  /**
   * ファイルサイズバリデータ
   */
  static fileSize(maxSizeInMB: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const file = control.value as File;
      if (!(file instanceof File)) {
        return { fileSize: { value: control.value, error: 'notFile' } };
      }
      
      const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
      
      if (file.size > maxSizeInBytes) {
        return { 
          fileSize: { 
            value: control.value, 
            maxSize: maxSizeInMB,
            actualSize: Math.round(file.size / 1024 / 1024 * 100) / 100,
            error: 'tooLarge' 
          } 
        };
      }
      
      return null;
    };
  }

  /**
   * ファイル拡張子バリデータ
   */
  static fileType(allowedTypes: string[]): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      const file = control.value as File;
      if (!(file instanceof File)) {
        return { fileType: { value: control.value, error: 'notFile' } };
      }
      
      const fileExtension = file.name.toLowerCase().split('.').pop();
      const normalizedTypes = allowedTypes.map(type => type.toLowerCase().replace('.', ''));
      
      if (!fileExtension || !normalizedTypes.includes(fileExtension)) {
        return { 
          fileType: { 
            value: control.value, 
            allowedTypes,
            actualType: fileExtension,
            error: 'invalidType' 
          } 
        };
      }
      
      return null;
    };
  }

  /**
   * パスワード確認バリデータ
   */
  static passwordMatch(passwordField: string, confirmPasswordField: string): ValidatorFn {
    return (formGroup: AbstractControl): ValidationErrors | null => {
      if (!(formGroup instanceof FormGroup)) {
        return null;
      }
      
      const password = formGroup.get(passwordField);
      const confirmPassword = formGroup.get(confirmPasswordField);
      
      if (!password || !confirmPassword) {
        return null;
      }
      
      if (password.value !== confirmPassword.value) {
        confirmPassword.setErrors({ passwordMatch: true });
        return { passwordMatch: true };
      } else {
        // パスワードが一致する場合、confirmPasswordのpasswordMatchエラーをクリア
        if (confirmPassword.errors) {
          delete confirmPassword.errors['passwordMatch'];
          if (Object.keys(confirmPassword.errors).length === 0) {
            confirmPassword.setErrors(null);
          }
        }
      }
      
      return null;
    };
  }

  /**
   * 配列の最小/最大要素数バリデータ
   */
  static arrayLength(min?: number, max?: number): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }
      
      if (!Array.isArray(control.value)) {
        return { arrayLength: { value: control.value, error: 'notArray' } };
      }
      
      const length = control.value.length;
      
      if (min !== undefined && length < min) {
        return { arrayLength: { value: control.value, min, actual: length, error: 'min' } };
      }
      
      if (max !== undefined && length > max) {
        return { arrayLength: { value: control.value, max, actual: length, error: 'max' } };
      }
      
      return null;
    };
  }

  /**
   * エラーメッセージ取得ヘルパー
   */
  static getErrorMessage(control: AbstractControl, fieldName: string = 'フィールド'): string {
    if (!control.errors) {
      return '';
    }
    
    const errors = control.errors;
    
    if (errors['required']) {
      return `${fieldName}は必須です`;
    }
    if (errors['email']) {
      return '正しいメールアドレスを入力してください';
    }
    if (errors['minlength']) {
      return `${fieldName}は${errors['minlength'].requiredLength}文字以上で入力してください`;
    }
    if (errors['maxlength']) {
      return `${fieldName}は${errors['maxlength'].requiredLength}文字以下で入力してください`;
    }
    if (errors['japanese']) {
      return `${fieldName}は日本語で入力してください`;
    }
    if (errors['alphanumeric']) {
      return `${fieldName}は英数字で入力してください`;
    }
    if (errors['zipCode']) {
      return '郵便番号は123-4567の形式で入力してください';
    }
    if (errors['phoneNumber']) {
      return '正しい電話番号を入力してください';
    }
    if (errors['url']) {
      return '正しいURLを入力してください';
    }
    if (errors['strongPassword']) {
      const pwErrors = errors['strongPassword'];
      const messages = [];
      if (pwErrors.minLength) messages.push('8文字以上');
      if (pwErrors.lowercase) messages.push('小文字');
      if (pwErrors.uppercase) messages.push('大文字');
      if (pwErrors.numbers) messages.push('数字');
      if (pwErrors.specialChar) messages.push('記号');
      return `パスワードには${messages.join('、')}を含めてください`;
    }
    if (errors['numberRange']) {
      const rangeError = errors['numberRange'];
      if (rangeError.error === 'notNumber') {
        return `${fieldName}は数値で入力してください`;
      }
      if (rangeError.error === 'min') {
        return `${fieldName}は${rangeError.min}以上で入力してください`;
      }
      if (rangeError.error === 'max') {
        return `${fieldName}は${rangeError.max}以下で入力してください`;
      }
    }
    if (errors['dateRange']) {
      const dateError = errors['dateRange'];
      if (dateError.error === 'invalidDate') {
        return `${fieldName}は正しい日付を入力してください`;
      }
      if (dateError.error === 'min') {
        return `${fieldName}は${this.formatDate(dateError.minDate)}以降を入力してください`;
      }
      if (dateError.error === 'max') {
        return `${fieldName}は${this.formatDate(dateError.maxDate)}以前を入力してください`;
      }
    }
    if (errors['fileSize']) {
      const sizeError = errors['fileSize'];
      return `ファイルサイズは${sizeError.maxSize}MB以下にしてください（現在: ${sizeError.actualSize}MB）`;
    }
    if (errors['fileType']) {
      const typeError = errors['fileType'];
      return `ファイル形式は${typeError.allowedTypes.join('、')}のみ対応しています`;
    }
    if (errors['passwordMatch']) {
      return 'パスワードが一致しません';
    }
    if (errors['arrayLength']) {
      const arrayError = errors['arrayLength'];
      if (arrayError.error === 'min') {
        return `${fieldName}は${arrayError.min}個以上選択してください`;
      }
      if (arrayError.error === 'max') {
        return `${fieldName}は${arrayError.max}個以下で選択してください`;
      }
    }
    
    return `${fieldName}に入力エラーがあります`;
  }

  /**
   * 日付フォーマットヘルパー
   */
  private static formatDate(date: Date): string {
    return date.toLocaleDateString('ja-JP');
  }
}