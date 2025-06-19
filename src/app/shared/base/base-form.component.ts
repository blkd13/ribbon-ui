import { Component, inject } from '@angular/core';
import { FormGroup, AbstractControl, FormArray, FormControl, ValidatorFn } from '@angular/forms';
import { NotificationService } from '../services/notification.service';

/**
 * フォームコンポーネントの基底クラス
 * 共通のフォームバリデーション、エラーハンドリング、状態管理を提供
 */
@Component({
  template: ''
})
export type FormMode = 'create' | 'edit' | 'view' | 'duplicate';

export interface FormArrayConfig {
  minItems?: number;
  maxItems?: number;
  itemFactory: () => AbstractControl;
}

export interface ConditionalValidator {
  condition: () => boolean;
  validators: ValidatorFn[];
}

export abstract class BaseFormComponent {
  private notificationService = inject(NotificationService);

  protected abstract form: FormGroup;
  protected isLoading = false;
  protected isSaving = false;
  protected error: string | null = null;
  protected formMode: FormMode = 'create';

  // 条件付きバリデーター管理
  private conditionalValidators: Map<string, ConditionalValidator> = new Map();
  
  // フォーム配列設定
  private formArrayConfigs: Map<string, FormArrayConfig> = new Map();

  /**
   * 指定されたコントロールがエラーを持っているかチェック
   * @param controlName コントロール名
   * @param errorType エラータイプ（省略時は任意のエラー）
   * @returns エラーがあり、タッチされている場合はtrue
   */
  protected hasError(controlName: string, errorType?: string): boolean {
    const control = this.getControl(controlName);
    if (!control) return false;

    const hasValidationError = errorType ? 
      control.hasError(errorType) : 
      control.invalid;

    return hasValidationError && (control.dirty || control.touched);
  }

  /**
   * 指定されたコントロールのエラーメッセージを取得
   * @param controlName コントロール名
   * @returns エラーメッセージ
   */
  protected getErrorMessage(controlName: string): string {
    const control = this.getControl(controlName);
    if (!control || !control.errors) return '';

    const errors = control.errors;

    if (errors['required']) {
      return `${controlName}は必須です`;
    }
    if (errors['email']) {
      return '正しいメールアドレスを入力してください';
    }
    if (errors['minlength']) {
      const requiredLength = errors['minlength'].requiredLength;
      return `${controlName}は${requiredLength}文字以上で入力してください`;
    }
    if (errors['maxlength']) {
      const requiredLength = errors['maxlength'].requiredLength;
      return `${controlName}は${requiredLength}文字以下で入力してください`;
    }
    if (errors['min']) {
      const min = errors['min'].min;
      return `${min}以上の値を入力してください`;
    }
    if (errors['max']) {
      const max = errors['max'].max;
      return `${max}以下の値を入力してください`;
    }
    if (errors['pattern']) {
      return `${controlName}の形式が正しくありません`;
    }

    return `${controlName}に入力エラーがあります`;
  }

  /**
   * フォームグループ内の全てのコントロールをタッチ済みにマーク
   * @param formGroup 対象のFormGroup（省略時はthis.form）
   */
  protected markFormGroupTouched(formGroup?: FormGroup): void {
    const targetForm = formGroup || this.form;
    if (!targetForm) return;

    Object.keys(targetForm.controls).forEach(key => {
      const control = targetForm.get(key);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else {
        control?.markAsTouched();
      }
    });
  }

  /**
   * フォームの検証を実行し、エラーがある場合はマークする
   * @returns フォームが有効な場合はtrue
   */
  protected validateForm(): boolean {
    if (!this.form) return false;

    if (this.form.invalid) {
      this.markFormGroupTouched();
      return false;
    }
    return true;
  }

  /**
   * エラーメッセージを表示
   * @param message エラーメッセージ
   */
  protected showError(message: string): void {
    this.error = message;
    this.notificationService.showError(message);
  }

  /**
   * 成功メッセージを表示
   * @param message 成功メッセージ
   */
  protected showSuccess(message: string): void {
    this.error = null;
    this.notificationService.showSuccess(message);
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
   * エラー状態をクリア
   */
  protected clearError(): void {
    this.error = null;
  }

  /**
   * 指定されたコントロールを取得
   * @param controlName コントロール名
   * @returns AbstractControl または null
   */
  private getControl(controlName: string): AbstractControl | null {
    return this.form?.get(controlName) || null;
  }

  /**
   * フォームリセット
   */
  protected resetForm(): void {
    this.form?.reset();
    this.clearError();
  }

  /**
   * フォーム送信前の共通処理
   * @returns 送信可能な場合はtrue
   */
  protected beforeSubmit(): boolean {
    this.clearError();
    
    if (!this.validateForm()) {
      this.showError('入力内容を確認してください');
      return false;
    }

    if (this.isSaving) {
      return false;
    }

    return true;
  }

  /**
   * フォーム送信後の共通処理
   * @param success 成功かどうか
   * @param message メッセージ
   */
  protected afterSubmit(success: boolean, message?: string): void {
    this.setSaving(false);
    
    if (success) {
      if (message) {
        this.showSuccess(message);
      }
    } else {
      if (message) {
        this.showError(message);
      }
    }
  }

  // ===== Form Array Support =====

  /**
   * FormArray設定を登録
   * @param arrayName 配列名
   * @param config 配列設定
   */
  protected registerFormArray(arrayName: string, config: FormArrayConfig): void {
    this.formArrayConfigs.set(arrayName, config);
  }

  /**
   * FormArrayを取得
   * @param arrayName 配列名
   * @returns FormArray
   */
  protected getFormArray(arrayName: string): FormArray {
    const control = this.form.get(arrayName);
    if (!(control instanceof FormArray)) {
      throw new Error(`Control '${arrayName}' is not a FormArray`);
    }
    return control;
  }

  /**
   * FormArrayにアイテムを追加
   * @param arrayName 配列名
   * @param item 追加するアイテム（省略時は自動生成）
   * @returns 追加されたアイテムのインデックス
   */
  protected addArrayItem(arrayName: string, item?: AbstractControl): number {
    const config = this.formArrayConfigs.get(arrayName);
    if (!config) {
      throw new Error(`FormArray config not found for '${arrayName}'`);
    }

    const formArray = this.getFormArray(arrayName);

    // 最大数チェック
    if (config.maxItems && formArray.length >= config.maxItems) {
      this.showError(`最大${config.maxItems}件まで追加できます`);
      return -1;
    }

    const newItem = item || config.itemFactory();
    formArray.push(newItem);
    
    const newIndex = formArray.length - 1;
    this.notificationService.showSuccess('アイテムを追加しました');
    
    return newIndex;
  }

  /**
   * FormArrayからアイテムを削除
   * @param arrayName 配列名
   * @param index 削除するインデックス
   * @returns 削除成功かどうか
   */
  protected removeArrayItem(arrayName: string, index: number): boolean {
    const config = this.formArrayConfigs.get(arrayName);
    if (!config) {
      throw new Error(`FormArray config not found for '${arrayName}'`);
    }

    const formArray = this.getFormArray(arrayName);

    // 最小数チェック
    if (config.minItems && formArray.length <= config.minItems) {
      this.showError(`最低${config.minItems}件は必要です`);
      return false;
    }

    if (index < 0 || index >= formArray.length) {
      this.showError('無効なインデックスです');
      return false;
    }

    formArray.removeAt(index);
    this.notificationService.showSuccess('アイテムを削除しました');
    
    return true;
  }

  /**
   * FormArrayのアイテムを移動
   * @param arrayName 配列名
   * @param fromIndex 移動元インデックス
   * @param toIndex 移動先インデックス
   */
  protected moveArrayItem(arrayName: string, fromIndex: number, toIndex: number): void {
    const formArray = this.getFormArray(arrayName);
    
    if (fromIndex < 0 || fromIndex >= formArray.length ||
        toIndex < 0 || toIndex >= formArray.length) {
      this.showError('無効なインデックスです');
      return;
    }

    const item = formArray.at(fromIndex);
    formArray.removeAt(fromIndex);
    formArray.insert(toIndex, item);
    
    this.notificationService.showSuccess('アイテムを移動しました');
  }

  /**
   * FormArrayのバリデーション
   * @param arrayName 配列名
   * @returns バリデーション結果
   */
  protected validateFormArray(arrayName: string): boolean {
    const config = this.formArrayConfigs.get(arrayName);
    const formArray = this.getFormArray(arrayName);

    if (config?.minItems && formArray.length < config.minItems) {
      this.setError(`${arrayName}は最低${config.minItems}件必要です`);
      return false;
    }

    if (config?.maxItems && formArray.length > config.maxItems) {
      this.setError(`${arrayName}は最大${config.maxItems}件までです`);
      return false;
    }

    return true;
  }

  /**
   * FormArrayの全アイテムを削除
   * @param arrayName 配列名
   */
  protected clearFormArray(arrayName: string): void {
    const formArray = this.getFormArray(arrayName);
    formArray.clear();
    this.notificationService.showSuccess('全アイテムを削除しました');
  }

  // ===== Conditional Validation Support =====

  /**
   * 条件付きバリデーターを設定
   * @param controlName コントロール名
   * @param condition 条件関数
   * @param validators バリデーター配列
   */
  protected setConditionalValidators(
    controlName: string, 
    condition: () => boolean, 
    validators: ValidatorFn[]
  ): void {
    this.conditionalValidators.set(controlName, { condition, validators });
    this.updateConditionalValidators();
  }

  /**
   * 条件付きバリデーターを更新
   */
  protected updateConditionalValidators(): void {
    this.conditionalValidators.forEach((config, controlName) => {
      const control = this.form.get(controlName);
      if (control) {
        if (config.condition()) {
          control.setValidators(config.validators);
        } else {
          control.clearValidators();
        }
        control.updateValueAndValidity();
      }
    });
  }

  /**
   * フォームグループの有効/無効を切り替え
   * @param groupName グループ名
   * @param enable 有効にするかどうか
   */
  protected enableDisableGroup(groupName: string, enable: boolean): void {
    const control = this.form.get(groupName);
    if (control) {
      if (enable) {
        control.enable();
      } else {
        control.disable();
      }
    }
  }

  // ===== Enhanced Error Handling =====

  /**
   * ネストされたパスのエラーメッセージを取得
   * @param path ドット記法のパス (例: 'user.profile.name')
   * @returns エラーメッセージ
   */
  protected getNestedErrorMessage(path: string): string {
    const control = this.form.get(path);
    if (!control || !control.errors) return '';

    const errors = control.errors;
    const fieldName = path.split('.').pop() || path;

    if (errors['required']) {
      return `${fieldName}は必須です`;
    }
    if (errors['email']) {
      return '正しいメールアドレスを入力してください';
    }
    if (errors['minlength']) {
      const requiredLength = errors['minlength'].requiredLength;
      return `${fieldName}は${requiredLength}文字以上で入力してください`;
    }
    if (errors['maxlength']) {
      const requiredLength = errors['maxlength'].requiredLength;
      return `${fieldName}は${requiredLength}文字以下で入力してください`;
    }
    if (errors['pattern']) {
      return `${fieldName}の形式が正しくありません`;
    }
    if (errors['arrayMinItems']) {
      return `${fieldName}は最低${errors['arrayMinItems'].minItems}件必要です`;
    }
    if (errors['arrayMaxItems']) {
      return `${fieldName}は最大${errors['arrayMaxItems'].maxItems}件までです`;
    }

    return `${fieldName}に入力エラーがあります`;
  }

  /**
   * 全てのエラーを収集
   * @returns エラーマップ
   */
  protected collectAllErrors(): { [key: string]: any } {
    return this.collectFormErrors(this.form);
  }

  /**
   * フォームエラーを再帰的に収集
   * @param form フォームグループまたはコントロール
   * @param parentPath 親パス
   * @returns エラーマップ
   */
  private collectFormErrors(form: AbstractControl, parentPath: string = ''): { [key: string]: any } {
    const errors: { [key: string]: any } = {};

    if (form instanceof FormGroup) {
      Object.keys(form.controls).forEach(key => {
        const control = form.get(key);
        const path = parentPath ? `${parentPath}.${key}` : key;
        
        if (control && control.errors) {
          errors[path] = control.errors;
        }
        
        if (control instanceof FormGroup || control instanceof FormArray) {
          const nestedErrors = this.collectFormErrors(control, path);
          Object.assign(errors, nestedErrors);
        }
      });
    } else if (form instanceof FormArray) {
      form.controls.forEach((control, index) => {
        const path = `${parentPath}[${index}]`;
        
        if (control.errors) {
          errors[path] = control.errors;
        }
        
        if (control instanceof FormGroup || control instanceof FormArray) {
          const nestedErrors = this.collectFormErrors(control, path);
          Object.assign(errors, nestedErrors);
        }
      });
    }

    return errors;
  }

  // ===== Form State Management =====

  /**
   * フォームモードを設定
   * @param mode フォームモード
   */
  protected setFormMode(mode: FormMode): void {
    this.formMode = mode;
    
    if (mode === 'view') {
      this.form.disable();
    } else {
      this.form.enable();
    }
  }

  /**
   * フォームが変更されているかチェック
   * @returns 変更されている場合はtrue
   */
  protected isDirty(): boolean {
    return this.form.dirty;
  }

  /**
   * 未保存の変更があるかチェック
   * @returns 未保存の変更がある場合はtrue
   */
  protected hasUnsavedChanges(): boolean {
    return this.isDirty() && !this.isSaving;
  }

  /**
   * ページを離れる前の確認
   * @returns 離れて良い場合はtrue
   */
  protected canDeactivate(): boolean {
    if (this.hasUnsavedChanges()) {
      return confirm('未保存の変更があります。このページを離れてもよろしいですか？');
    }
    return true;
  }

  /**
   * フォームをリセット（初期状態に戻す）
   */
  protected resetToInitialState(): void {
    this.form.reset();
    this.clearError();
    this.formMode = 'create';
  }
}