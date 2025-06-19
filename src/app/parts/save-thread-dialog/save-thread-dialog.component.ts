import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { BaseDialogComponent } from '../../shared/base/base-dialog.component';
import { DialogComponent } from '../dialog/dialog.component';
import { ThreadGroup } from '../../models/project-models';

export interface SaveThreadData {
  threadGroupId?: string;
  threadName: string;
  description: string;
  includeMessages: boolean;
  hasMessages: boolean;
  isRenameOnly: boolean;
  templateThreadGroupList: ThreadGroup[];
}

export interface SaveThreadResult {
  threadGroupId?: string;
  threadName: string;
  description: string;
  includeMessages: boolean;
}

@Component({
  selector: 'app-save-thread-dialog',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatCheckboxModule, MatInputModule, MatButtonModule, MatAutocompleteModule],
  templateUrl: './save-thread-dialog.component.html',
  styleUrl: './save-thread-dialog.component.scss'
})
export class SaveThreadDialogComponent extends BaseDialogComponent<SaveThreadData, SaveThreadResult> {
  private readonly dialog = inject(MatDialog);

  // フォーム定義
  protected readonly form = new FormGroup({
    threadName: new FormControl(this.data.threadName, [Validators.required]),
    description: new FormControl(this.data.description),
    includeMessages: new FormControl(this.data.includeMessages)
  });

  protected async onSave(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    const formValue = this.form.value;
    const threadName = formValue.threadName?.trim();

    if (!threadName) {
      this.setError('スレッド名を入力してください。');
      return;
    }

    // 重複チェック
    const sameNameThreadGroup = this.data.templateThreadGroupList.find(t => t.title === threadName);
    
    if (this.data.threadGroupId || sameNameThreadGroup) {
      const shouldProceed = await this.confirmOverwrite(threadName, sameNameThreadGroup);
      if (!shouldProceed) {
        return;
      }
    }

    // 結果を返して閉じる
    this.confirm({
      threadGroupId: this.data.threadGroupId,
      threadName: threadName,
      description: formValue.description || '',
      includeMessages: formValue.includeMessages || false
    });
  }

  private validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.setError('入力内容を確認してください。');
      return false;
    }
    return true;
  }

  private async confirmOverwrite(threadName: string, sameNameThreadGroup?: ThreadGroup): Promise<boolean> {
    let message = '';
    
    if (this.data.threadGroupId) {
      message = `${threadName}を更新します。よろしいですか？`;
    } else if (sameNameThreadGroup) {
      this.data.threadGroupId = sameNameThreadGroup.id; // 上書き保存のため、IDをセット
      message = `モード名「${threadName}」は既に存在します。\n上書き保存しますか？`;
    }

    return new Promise((resolve) => {
      const dialogRef = this.dialog.open(DialogComponent, {
        data: {
          title: '確認',
          message,
          options: ['キャンセル', 'OK（上書き保存）', '別名で新規保存']
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result === 1) {
          // 上書き保存
          resolve(true);
        } else if (result === 2) {
          // 別名で新規保存
          this.data.threadGroupId = undefined;
          this.form.patchValue({
            threadName: threadName + '（コピー）'
          });
          resolve(true);
        } else {
          // キャンセル
          resolve(false);
        }
      });
    });
  }

  protected onCancel(): void {
    this.cancel();
  }

  // BaseDialogComponentのテンプレートメソッドのオーバーライド
  protected hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!(control?.invalid && control?.touched);
  }

  protected override getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control?.errors) return '';

    if (control.errors['required']) {
      return `${controlName}は必須です`;
    }
    return `${controlName}に入力エラーがあります`;
  }
}
