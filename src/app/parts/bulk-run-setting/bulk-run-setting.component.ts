import { MatInputModule } from '@angular/material/input';
import { Component, ElementRef, inject, viewChild, viewChildren } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { concatMap, from, map, mergeMap, of, Subscription, switchMap } from 'rxjs';

import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { FileEntity, FileManagerService, FileUploadContent, FullPathFile } from './../../services/file-manager.service';
import { FileDropDirective } from './../file-drop.directive';
import { ContentPart } from './../../models/project-models';

export interface BulkRunSettingData {
  projectId: string;
  mode: 'serial' | 'parallel';
  contents: ({ type: 'text', text: string } | { type: 'file', text: string, fileGroupId: string })[];
  promptTemplate: string;
}

@Component({
  selector: 'app-bulk-run-setting',
  imports: [FormsModule,
    MatButtonModule, MatTableModule, MatProgressBarModule, MatInputModule, MatIconModule,
    MatFormFieldModule, MatSnackBarModule, MatRadioModule,
    FileDropDirective],
  templateUrl: './bulk-run-setting.component.html',
  styleUrl: './bulk-run-setting.component.scss'
})
export class BulkRunSettingComponent {
  displayedColumns: string[] = ['no', 'question', 'actions'];
  dataSource: ({ type: 'text', text: string } | { type: 'file', text: string, fileGroupId: string })[] = [];

  promptTemplate = ``;
  readonly promptTemplateElement = viewChild.required<ElementRef<HTMLTextAreaElement>>('promptTemplateElement');

  readonly valueElement = viewChildren<ElementRef<HTMLInputElement>>('valueElement');


  contents: ContentPart[] = [];

  readonly dialogRef: MatDialogRef<BulkRunSettingComponent> = inject(MatDialogRef<BulkRunSettingComponent>);
  readonly data: { mode: 'serial' | 'parallel', contents: ({ type: 'text', text: string } | { type: 'file', text: string, fileGroupId: string })[], promptTemplate: string, projectId: string } = inject(MAT_DIALOG_DATA);
  readonly fileManagerService: FileManagerService = inject(FileManagerService);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);

  constructor() {
    if (this.data) {
      this.data = JSON.parse(JSON.stringify(this.data));
      this.promptTemplate = this.data.promptTemplate;
      this.dataSource = this.data.contents;
      if (this.dataSource.length === 0) {
        this.dataSource.push({ type: 'text', text: '' });
        this.dataSource = [...this.dataSource];
      } else { }
    } else { }
  }

  executeBatch(): void {
    this.data.contents = this.dataSource.filter(value => value.text.trim() !== '');
    const outDto: BulkRunSettingData = {
      mode: this.data.mode,
      contents: this.data.contents.filter(content => content.text),  // 空コンテンツは除外
      promptTemplate: this.promptTemplate,
      projectId: this.data.projectId,
    };
    this.dialogRef.close(outDto);
  }

  addRow() {
    this.dataSource.push({ type: 'text', text: '' });
    this.dataSource = [...this.dataSource];
  }

  removeRow(index: number) {
    this.dataSource.splice(index, 1);
    this.dataSource = [...this.dataSource];
  }

  hasValidInput(): boolean {
    return this.dataSource.some((row) => row.text.trim() !== '');
  }

  // カスタムバリデーションメソッド
  validatePromptTemplate(input: NgModel): void {
    const forbiddenWord = '${value}';
    const hasInvalidWord = !this.promptTemplate.includes(forbiddenWord);

    // TODO ${value} を含まないときにエラーにするロジック。エラーにしなくてもいいかなと思って一旦コメントアウト。
    // // 独自バリデーションロジック
    // if (hasInvalidWord) {
    //   input.control.setErrors({ invalidWord: true });
    // } else {
    //   // エラーをクリア
    //   input.control.setErrors(null);
    // }
  }


  isLock = false;
  onFilesDropped(files: FullPathFile[]): Subscription {
    // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする。
    this.isLock = true;
    return this.fileManagerService
      .uploadFiles({ uploadType: 'Single', projectId: this.data.projectId, contents: files.map(file => ({ filePath: file.fullPath, base64Data: file.base64String, })) })
      .subscribe({
        next: next => {
          next.results.forEach((fileGroupEntity, index) => {
            const files = (fileGroupEntity as any as { files: FileEntity[] }).files;
            if (files === null || files === undefined || files.length === 0) {
              return;
            } else { }
            this.dataSource = [...this.dataSource.filter(data => data.text)];
            // this.inputArea.content.push({ type: 'file', fileId: fileGroupEntity.id, text: fileGroupEntity.fileName });
            this.dataSource.push({ type: 'file', text: files[0].filePath, fileGroupId: fileGroupEntity.id });
            this.dataSource = [...this.dataSource];
          });
          // this.onChange();
          this.isLock = false;
        },
        error: error => {
          this.snackBar.open(`アップロードエラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
          this.isLock = false;
        },
      });
  }


  onKeyDown($event: KeyboardEvent, index: number = -1): void {
    // Enterが押されたら次の行に移る
    if ($event.key === 'Enter') {
      if (this.valueElement().length > index + 1) {
      } else {
        this.addRow();
      }
      setTimeout(() => {
        this.valueElement().at(index + 1)?.nativeElement.focus();
      }, 100);
    } else if ($event.key === 'ArrowUp') {
      if (index > 0) {
        this.valueElement().at(index - 1)?.nativeElement.focus();
        setTimeout(() => {
          this.valueElement().at(index - 1)?.nativeElement.select();
        }, 0);
      }
    } else if ($event.key === 'ArrowDown') {
      if (this.valueElement().length > index + 1) {
        this.valueElement().at(index + 1)?.nativeElement.focus();
        setTimeout(() => {
          this.valueElement().at(index + 1)?.nativeElement.select();
        }, 0);
      }
    }
  }

  onFocus($event: FocusEvent): void {
    ($event.target as any).select();
    // this.promptTemplateElement.nativeElement.select();
  }

  onPaste($event: ClipboardEvent, index: number): void {
    this.stopPropagation($event);
    const clipboardData = $event.clipboardData || (window as any).clipboardData;
    if (clipboardData) {
      const items = clipboardData.items;
      const fileList = [];
      let text = '';

      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          fileList.push(items[i].getAsFile());
        } else if (items[i].kind === 'string') {
          // console.log(items[i]);
          text += clipboardData?.getData('text');
        } else { }
      }
      text = clipboardData?.getData('text');

      const rows = text.trim().split(/[\r\n]+/g);
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        if (this.dataSource[index + rowIndex] === undefined) {
          this.dataSource.push({ type: 'text', text: rows[rowIndex] });
        } else {
          this.dataSource[index + rowIndex].text = rows[rowIndex];
        }
      }
      this.dataSource = [...this.dataSource];

    } else { }
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
