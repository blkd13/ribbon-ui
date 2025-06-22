import { Component, inject, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ChatService } from '../../services/chat.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { NotificationService } from '../../shared/services/notification.service';
import { MessageGroupForView, ProjectVisibility, Thread, ThreadGroup, ThreadGroupType } from '../../models/project-models';
import { Utils } from '../../utils';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { genDummyId, MessageService, ProjectService, ThreadService } from '../../services/project.service';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogComponent } from '../dialog/dialog.component';
import { map, switchMap, tap } from 'rxjs';
import { safeForkJoin } from '../../utils/dom-utils';
import { AIModelManagerService } from '../../services/model-manager.service';
import { BaseDialogComponent } from '../../shared/base/base-dialog.component';

declare const _paq: any;

export interface ParameterSettingDialogData {
  threadGroup: ThreadGroup;
}

export interface ParameterSettingDialogResult {
  threadGroup: ThreadGroup;
}

@Component({
  selector: 'app-parameter-setting-dialog',
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatFormFieldModule, MatSelectModule, MatSliderModule, MatCheckboxModule,
    MatDividerModule, MatTooltipModule, MatDialogModule,
  ],
  templateUrl: './parameter-setting-dialog.component.html',
  styleUrl: './parameter-setting-dialog.component.scss'
})

export class ParameterSettingDialogComponent extends BaseDialogComponent<ParameterSettingDialogData, ParameterSettingDialogResult> {

  readonly chatService: ChatService = inject(ChatService);
  readonly aIModelManagerService: AIModelManagerService = inject(AIModelManagerService);
  readonly projectService: ProjectService = inject(ProjectService);
  readonly threadService: ThreadService = inject(ThreadService);
  readonly messageService: MessageService = inject(MessageService);
  readonly dialog: MatDialog = inject(MatDialog);

  threadGroup: ThreadGroup = Utils.clone(this.data.threadGroup);
  projectId: string = this.threadGroup.projectId;
  isMaxTokenFixedList: boolean[] = [];
  befMaxTokenList: number[] = [];

  maxMaxToken = 8192; // スライダーの最大値

  constructor() {
    super();
    _paq.push(['trackEvent', 'チャットの設定', '設定画面を開く', 0]);
    this.reload();
  }

  appendModel() {
    const thread = this.threadService.genInitialThreadEntity(this.threadGroup.id);
    thread.inDto.args.max_tokens = 0;
    // thread.threadGroupId = threadGroupId;
    this.threadGroup.threadList.push(thread);
    const index = this.threadGroup.threadList.length - 1;
    this.isMaxTokenFixedList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens === 0;
  }

  toggleMaxTokenFixed(index: number) {
    // const modelParams = this.chatService.modelList.find(m => m.id === this.inDto.args.model);
    // this.isMaxTokenFixed = !this.isMaxTokenFixed;
    if (this.isMaxTokenFixedList[index]) {
      this.befMaxTokenList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens || 0;
      this.threadGroup.threadList[index].inDto.args.max_tokens = 0;
    } else {
      this.threadGroup.threadList[index].inDto.args.max_tokens = this.befMaxTokenList[index];
    }
  }

  reload(): void {
    this.threadGroup.threadList.forEach((_, index) => {
      this.isMaxTokenFixedList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens === 0;
      if (this.isMaxTokenFixedList[index]) {
      } else {
        this.befMaxTokenList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens || 0;
      }
    });
  }

  saveAndSubmit() {
    this.executeAsync(async () => {
      // 保存すると元IDが消えるので、元IDを保持しておく
      const threadIdList = this.threadGroup.threadList.map(thread => thread.id);

      // デフォルトプロジェクトにも保存。
      const projects = await this.projectService.getProjectList().toPromise();
      const defaultProject = projects?.find(p => p.visibility === ProjectVisibility.Default);
      
      if (!defaultProject) {
        throw new Error('デフォルトプロジェクトが見つかりません');
      }

      const threadGroup = Utils.clone(this.threadGroup);
      (threadGroup.id as any) = undefined;
      threadGroup.title = 'Default';
      threadGroup.type = ThreadGroupType.Default;
      threadGroup.threadList.forEach((thread) => {
        (thread.id as any) = undefined;
        thread.status = 'Normal';
      });

      const savedThreadGroup = await this.threadService.upsertThreadGroup(defaultProject.id, threadGroup).toPromise();
      
      if (!savedThreadGroup) {
        throw new Error('スレッドグループの保存に失敗しました');
      }

      // システムプロンプトを保存する
      const systemMessageGroupList = threadIdList.map(threadId => {
        return this.messageService.messageGroupList.find(messageGroup => {
          return messageGroup.threadId === threadId && messageGroup.role === 'system';
        });
      }).filter(messageGroup => !!messageGroup) as MessageGroupForView[];
      
      // 元オブジェクトを破壊しないようにcloneしておく 
      const forInsert = Utils.clone(systemMessageGroupList);
      forInsert.forEach((messageGroup, index) => {
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
      });

      // メッセージグループを保存する 
      await safeForkJoin(forInsert.map(messageGroup =>
        this.messageService.upsertSingleMessageGroup(messageGroup)
      )).toPromise();

      Object.assign(this.threadGroup, savedThreadGroup);
      return savedThreadGroup;
    }, '設定を保存しました', '設定の保存に失敗しました').then(result => {
      if (result) {
        this.submit(true);
      }
    });
  }

  submit(savedFlag = false) {
    _paq.push(['trackEvent', 'チャットの設定', '確定', savedFlag]);
    this.threadGroup.threadList.forEach((_, index) => {
      if (this.isMaxTokenFixedList[index]) {
        this.befMaxTokenList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens || 0;
        this.threadGroup.threadList[index].inDto.args.max_tokens = 0;
      } else { }
    });
    this.close({ threadGroup: this.threadGroup });
  }

  override cancel() {
    super.cancel();
  }

  init() {
    this.threadGroup.threadList.forEach((_, index) => {
      if (this.isMaxTokenFixedList[index]) {
      } else {
        this.befMaxTokenList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens || 0;
      }
    });
    // this.threadGroup = this.threadService.genInitialThreadGroupEntity(this.projectId);
    this.reload();
  }

  removeModel(index: number) {
    const threadGroup = this.threadGroup as ThreadGroup;
    this.dialog.open(DialogComponent, { data: { title: '削除', message: `このスレッドを削除しますか？\n「${this.threadGroup.threadList[index].inDto.args.model}」`, options: ['キャンセル', '削除'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 1) {
          threadGroup.threadList.splice(index, 1);
          this.reload();
        } else { /** 削除キャンセル */ }
      },
    });
  }
}
