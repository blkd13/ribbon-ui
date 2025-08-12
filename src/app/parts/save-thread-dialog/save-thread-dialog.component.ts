import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { BaseDialogComponent } from '../../shared/base/base-dialog.component';
import { DialogComponent } from '../dialog/dialog.component';
import { ThreadGroup, ProjectVisibility, ThreadGroupType } from '../../models/project-models';
import { ProjectService, ThreadService, MessageService, genDummyId } from '../../services/project.service';
import { Utils } from '../../utils';
import { safeForkJoin } from '../../utils/dom-utils';

export interface SaveThreadData {
  threadGroupId?: string;
  threadName: string;
  description: string;
  includeMessages: boolean;
  hasMessages: boolean;
  isRenameOnly: boolean;
  templateThreadGroupList: ThreadGroup[];
  currentThreadGroup?: ThreadGroup;
}

export interface SaveThreadResult {
  threadGroupId?: string;
  threadName: string;
  description: string;
  includeMessages: boolean;
  saveType: 'new' | 'update' | 'default';
}

type SaveType = 'new' | 'update' | 'default';

@Component({
  selector: 'app-save-thread-dialog',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatCheckboxModule,
    MatInputModule,
    MatButtonModule,
    MatAutocompleteModule,
    MatRadioModule,
    MatSelectModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './save-thread-dialog.component.html',
  styleUrl: './save-thread-dialog.component.scss'
})
export class SaveThreadDialogComponent extends BaseDialogComponent<SaveThreadData, SaveThreadResult> {
  private readonly dialog = inject(MatDialog);
  private readonly projectService = inject(ProjectService);
  private readonly threadService = inject(ThreadService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);

  // 既存モードがあるかどうか
  get hasExistingModes(): boolean {
    return this.data.templateThreadGroupList && this.data.templateThreadGroupList.length > 0;
  }

  // フォーム定義
  protected readonly form = new FormGroup({
    saveType: new FormControl<SaveType>('new', [Validators.required]),
    selectedThreadGroupId: new FormControl<string>(''),
    threadName: new FormControl(this.data.threadName || ''),
    description: new FormControl(this.data.description || ''),
    includeMessages: new FormControl(this.data.includeMessages || false)
  });

  constructor() {
    super();

    // 初期値設定
    if (this.data.threadGroupId) {
      // 更新モードで開かれた場合
      this.form.patchValue({
        saveType: 'update',
        selectedThreadGroupId: this.data.threadGroupId
      });
    }

    // saveTypeの変更を監視してバリデーションを動的に変更
    this.form.get('saveType')?.valueChanges.subscribe(saveType => {
      this.updateFormValidation(saveType);
    });

    // 初期バリデーション設定
    this.updateFormValidation(this.form.get('saveType')?.value || null);
  }

  setSaveType(saveType: SaveType): void {
    if (saveType === 'update' && !this.hasExistingModes) {
      return; // 既存モードがない場合は選択不可
    }

    this.form.patchValue({ saveType });
  }

  private updateFormValidation(saveType: SaveType | null): void {
    const threadNameControl = this.form.get('threadName');
    const selectedThreadGroupControl = this.form.get('selectedThreadGroupId');

    // 一旦バリデーターをクリア
    threadNameControl?.clearValidators();
    selectedThreadGroupControl?.clearValidators();

    // saveTypeに応じてバリデーターを設定
    switch (saveType) {
      case 'new':
        threadNameControl?.setValidators([Validators.required]);
        break;
      case 'update':
        selectedThreadGroupControl?.setValidators([Validators.required]);
        break;
      case 'default':
        // デフォルト設定の場合は名前不要
        break;
    }

    // バリデーターを更新
    threadNameControl?.updateValueAndValidity();
    selectedThreadGroupControl?.updateValueAndValidity();
  }

  getPlaceholderText(): string {
    const saveType = this.form.get('saveType')?.value;
    switch (saveType) {
      case 'new':
        return this.translate.instant('NEW_MODE_PLACEHOLDER');
      case 'update':
        return this.translate.instant('UPDATE_MODE_PLACEHOLDER');
      default:
        return '';
    }
  }

  getInfoText(): string {
    const saveType = this.form.get('saveType')?.value;
    switch (saveType) {
      case 'new':
        return this.translate.instant('NEW_MODE_INFO');
      case 'update':
        return this.translate.instant('UPDATE_MODE_INFO');
      case 'default':
        return this.translate.instant('DEFAULT_MODE_INFO');
      default:
        return '';
    }
  }

  getSaveButtonText(): string {
    const saveType = this.form.get('saveType')?.value;
    switch (saveType) {
      case 'new':
        return this.translate.instant('NEW_MODE_SAVE_BUTTON');
      case 'update':
        return this.translate.instant('UPDATE_MODE_SAVE_BUTTON');
      case 'default':
        return this.translate.instant('DEFAULT_MODE_SAVE_BUTTON');
      default:
        return this.translate.instant('SAVE');
    }
  }

  protected async onSave(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    const formValue = this.form.value;
    const saveType = formValue.saveType as SaveType;

    // デフォルト設定の場合は確認ダイアログと実際の保存処理
    if (saveType === 'default') {
      const shouldProceed = await this.confirmDefaultOverwrite();
      if (!shouldProceed) {
        return;
      }
      
      // デフォルト設定を保存
      await this.saveDefaultSettings();
    }

    // 新規作成で重複チェック
    if (saveType === 'new') {
      const threadName = formValue.threadName?.trim();
      if (threadName) {
        const sameNameThreadGroup = this.data.templateThreadGroupList.find(t => t.title === threadName);
        if (sameNameThreadGroup) {
          const shouldProceed = await this.confirmOverwrite(threadName, sameNameThreadGroup);
          if (!shouldProceed) {
            return;
          }
        }
      }
    }

    // 結果を返して閉じる
    const result: SaveThreadResult = {
      threadGroupId: this.getResultThreadGroupId(saveType, formValue),
      threadName: this.getResultThreadName(saveType, formValue),
      description: formValue.description || '',
      includeMessages: formValue.includeMessages || false,
      saveType: saveType
    };

    this.confirm(result);
  }

  private getResultThreadGroupId(saveType: SaveType, formValue: any): string | undefined {
    switch (saveType) {
      case 'update':
        return formValue.selectedThreadGroupId;
      case 'default':
        return 'default'; // 特別なID
      default:
        return undefined;
    }
  }

  private getResultThreadName(saveType: SaveType, formValue: any): string {
    switch (saveType) {
      case 'new':
        return formValue.threadName?.trim() || '';
      case 'update':
        // 名前が入力されている場合は更新、されていない場合は既存の名前を維持
        if (formValue.threadName?.trim()) {
          return formValue.threadName.trim();
        } else {
          const selectedGroup = this.data.templateThreadGroupList.find(
            t => t.id === formValue.selectedThreadGroupId
          );
          return selectedGroup?.title || '';
        }
      case 'default':
        return this.translate.instant('DEFAULT_MODE_NAME');
      default:
        return '';
    }
  }

  private validateForm(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.setError(this.translate.instant('INPUT_VALIDATION_ERROR'));
      return false;
    }
    return true;
  }

  private async confirmDefaultOverwrite(): Promise<boolean> {
    return new Promise((resolve) => {
      const dialogRef = this.dialog.open(DialogComponent, {
        data: {
          title: this.translate.instant('DEFAULT_OVERWRITE_CONFIRM_TITLE'),
          message: this.translate.instant('DEFAULT_OVERWRITE_CONFIRM_MESSAGE'),
          options: [this.translate.instant('DEFAULT_OVERWRITE_CONFIRM_CANCEL'), this.translate.instant('DEFAULT_OVERWRITE_CONFIRM_OK')]
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        resolve(result === 1);
      });
    });
  }

  private async confirmOverwrite(threadName: string, sameNameThreadGroup: ThreadGroup): Promise<boolean> {
    return new Promise((resolve) => {
      const dialogRef = this.dialog.open(DialogComponent, {
        data: {
          title: this.translate.instant('DUPLICATE_MODE_CONFIRM_TITLE'),
          message: this.translate.instant('DUPLICATE_MODE_CONFIRM_MESSAGE', { name: threadName }),
          options: [this.translate.instant('DUPLICATE_MODE_CONFIRM_CANCEL'), this.translate.instant('DUPLICATE_MODE_CONFIRM_OVERWRITE'), this.translate.instant('DUPLICATE_MODE_CONFIRM_RENAME')]
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result === 1) {
          // 上書き保存 - selectedThreadGroupIdを設定して更新モードに
          this.form.patchValue({
            saveType: 'update',
            selectedThreadGroupId: sameNameThreadGroup.id
          });
          resolve(true);
        } else if (result === 2) {
          // 別名で新規保存
          this.form.patchValue({
            threadName: threadName + this.translate.instant('DUPLICATE_MODE_RENAME_SUFFIX')
          });
          resolve(true);
        } else {
          // キャンセル
          resolve(false);
        }
      });
    });
  }

  private async saveDefaultSettings(): Promise<void> {
    if (!this.data.currentThreadGroup) {
      throw new Error(this.translate.instant('CURRENT_THREAD_GROUP_NOT_FOUND'));
    }

    // 保存すると元IDが消えるので、元IDを保持しておく
    const threadIdList = this.data.currentThreadGroup.threadList.map(thread => thread.id);

    // デフォルトプロジェクトを取得
    const projects = await this.projectService.getProjectList().toPromise();
    const defaultProject = projects?.find(p => p.visibility === ProjectVisibility.Default);
    
    if (!defaultProject) {
      throw new Error(this.translate.instant('DEFAULT_PROJECT_NOT_FOUND'));
    }

    // 現在のスレッドグループをクローンしてデフォルト設定用に準備
    const threadGroup = Utils.clone(this.data.currentThreadGroup);
    (threadGroup.id as any) = undefined;
    threadGroup.title = 'Default';
    threadGroup.type = ThreadGroupType.Default;
    threadGroup.threadList.forEach((thread) => {
      (thread.id as any) = undefined;
      thread.status = 'Normal';
    });

    // スレッドグループを保存
    const savedThreadGroup = await this.threadService.upsertThreadGroup(defaultProject.id, threadGroup).toPromise();
    
    if (!savedThreadGroup) {
      throw new Error(this.translate.instant('THREAD_GROUP_SAVE_FAILED'));
    }

    // システムプロンプトを保存する（ParameterSettingDialogComponentと同様に必ず実行）
    const systemMessageGroupList = threadIdList.map(threadId => {
      return this.messageService.messageGroupList.find(messageGroup => {
        return messageGroup.threadId === threadId && messageGroup.role === 'system';
      });
    }).filter(messageGroup => !!messageGroup);
    
    // 元オブジェクトを破壊しないようにcloneしておく 
    const forInsert = Utils.clone(systemMessageGroupList);
    forInsert.forEach((messageGroup, index) => {
      if (messageGroup) {
        messageGroup.id = genDummyId('messageGroup');
        messageGroup.threadId = savedThreadGroup.threadList[index].id;
        messageGroup.messages.forEach(message => {
          message.id = genDummyId('message');
          message.cacheId = undefined;
          message.messageGroupId = messageGroup.id;
          message.contents.forEach(content => {
            content.id = genDummyId('contentPart');
            content.messageId = message.id;
          });
        });
      }
    });

    // メッセージグループを保存する 
    await safeForkJoin(forInsert.map(messageGroup =>
      this.messageService.upsertSingleMessageGroup(messageGroup!)
    )).toPromise();
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
      switch (controlName) {
        case 'threadName':
          return this.translate.instant('MODE_NAME_REQUIRED');
        case 'selectedThreadGroupId':
          return this.translate.instant('MODE_SELECTION_REQUIRED');
        default:
          return this.translate.instant('FIELD_IS_REQUIRED', { field: controlName });
      }
    }
    return this.translate.instant('INPUT_ERROR_IN_FIELD', { field: controlName });
  }
}