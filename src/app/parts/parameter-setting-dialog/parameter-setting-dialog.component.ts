import { Component, inject, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ChatService } from '../../services/chat.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProjectVisibility, Thread, ThreadGroup, ThreadGroupType } from '../../models/project-models';
import { Utils } from '../../utils';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ProjectService, ThreadService } from '../../services/project.service';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DialogComponent } from '../dialog/dialog.component';

declare const _paq: any;

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
export class ParameterSettingDialogComponent {

  readonly chatService: ChatService = inject(ChatService);
  readonly projectService: ProjectService = inject(ProjectService);
  readonly threadService: ThreadService = inject(ThreadService);

  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<ParameterSettingDialogComponent> = inject(MatDialogRef);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly data = inject<{ threadGroup: ThreadGroup }>(MAT_DIALOG_DATA);

  threadGroup: ThreadGroup = Utils.clone(this.data.threadGroup);
  projectId: string = this.threadGroup.projectId;
  isMaxTokenFixedList: boolean[] = [];
  befMaxTokenList: number[] = [];

  maxMaxToken = 8192; // スライダーの最大値

  constructor() {
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
    // デフォルトプロジェクトにも保存。これ自体は終わってなくても問題ないので待たなくてもよい
    this.projectService.getProjectList().subscribe((projects) => {
      const defaultProject = projects.find(p => p.visibility === ProjectVisibility.Default);
      if (defaultProject) {
        const threadGroup = Utils.clone(this.threadGroup);
        (threadGroup.id as any) = undefined;
        threadGroup.title = 'Default';
        threadGroup.type = ThreadGroupType.Default;
        threadGroup.threadList.forEach((thread) => {
          (thread.id as any) = undefined;
          thread.status = 'Normal';
        });
        this.threadService.upsertThreadGroup(defaultProject.id, threadGroup).subscribe((threadGroup) => {
          this.snackBar.open('設定を保存しました。', 'Close', { duration: 2000 });
        });
      } else {
      }
    });
    this.submit();
  }

  submit(savedFlag = false) {
    _paq.push(['trackEvent', 'チャットの設定', '確定', savedFlag]);
    this.threadGroup.threadList.forEach((_, index) => {
      if (this.isMaxTokenFixedList[index]) {
        this.befMaxTokenList[index] = this.threadGroup.threadList[index].inDto.args.max_tokens || 0;
        this.threadGroup.threadList[index].inDto.args.max_tokens = 0;
      } else { }
    });
    this.dialogRef.close(this.threadGroup);
  }

  cancel() {
    this.dialogRef.close();
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
    this.dialog.open(DialogComponent, { data: { title: '削除', message: `このスレッドを削除しますか？\n「${this.threadGroup.threadList[index].inDto.args.model}」`, options: ['削除', 'キャンセル'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 0) {
          threadGroup.threadList.splice(index, 1);
          this.reload();
        } else { /** 削除キャンセル */ }
      },
    });
  }
}
