import { Component, inject, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
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

@Component({
  selector: 'app-save-thread-dialog',
  imports: [FormsModule, MatFormFieldModule, MatCheckboxModule, MatInputModule, MatButtonModule, MatAutocompleteModule],
  templateUrl: './save-thread-dialog.component.html',
  styleUrl: './save-thread-dialog.component.scss'
})
export class SaveThreadDialogComponent {

  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<SaveThreadDialogComponent> = inject(MatDialogRef);
  @Inject(MAT_DIALOG_DATA) readonly data: SaveThreadData = inject(MAT_DIALOG_DATA);

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (!this.data.threadName?.trim()) {
      alert('スレッド名を入力してください。');
      return;
    }
    const sameNameThreadGroup = this.data.templateThreadGroupList.find(t => t.title === this.data.threadName);
    if (this.data.threadGroupId || sameNameThreadGroup) {
      let message = '';
      if (this.data.threadGroupId) {
        message = `${this.data.threadName}を更新します。よろしいですか？`;
      } else if (sameNameThreadGroup) {
        this.data.threadGroupId = sameNameThreadGroup.id; // 上書き保存のため、IDをセット
        message = `モード名「${this.data.threadName}」は既に存在します。\n上書き保存しますか？`;
      }
      this.dialog.open(DialogComponent, { data: { title: '確認', message, options: ['キャンセル', 'OK（上書き保存）', '別名で新規保存'] } }).afterClosed().subscribe({
        next: next => {
          if (next === 1) {
            this.dialogRef.close(this.data);
          } else if (next === 2) {
            this.data.threadGroupId = undefined; // 新規保存
            this.data.threadName = this.data.threadName + '（コピー）'; // スレッド名を変更
            this.dialogRef.close(this.data);
          } else { /** 削除キャンセル */ }
        }
      });
    } else {
      this.dialogRef.close(this.data);
    }
  }
}
