import { Component, inject, input, output } from '@angular/core';
import { ChatPanelBaseComponent } from '../chat-panel-base/chat-panel-base.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocTagComponent } from '../doc-tag/doc-tag.component';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarkdownComponent } from 'ngx-markdown';
import { MessageGroupForView, Thread } from '../../models/project-models';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DialogComponent } from '../dialog/dialog.component';
import { LlmModel } from '../../services/chat.service';
import { MatRadioModule } from '@angular/material/radio';
import { ChatCompletionToolChoiceOption } from 'openai/resources/index.mjs';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ToolCallService } from '../../services/tool-call.service';

@Component({
  selector: 'app-chat-panel-system',
  imports: [
    CommonModule, FormsModule, DocTagComponent,
    MatTooltipModule, MarkdownComponent, MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule, MatProgressSpinnerModule,
    MatDialogModule, MatRadioModule, MatCheckboxModule,
  ],
  templateUrl: './chat-panel-system.component.html',
  styleUrls: ['../chat-panel-base/chat-panel-base.component.scss', './chat-panel-system.component.scss']
})
export class ChatPanelSystemComponent extends ChatPanelBaseComponent {

  readonly thread = input.required<Thread>();
  readonly removable = input.required<boolean>();

  readonly removeThreadEmitter = output<Thread>({ alias: 'removeThread' });

  readonly modelChangeEmitter = output<string>({ alias: 'modelChange' });

  readonly threadChangeEmitter = output<Thread>({ alias: 'threadChange' });

  readonly toolCallService: ToolCallService = inject(ToolCallService);

  modelIdMas: { [modelId: string]: LlmModel } = {};
  modelGroupMas: { [modelId: string]: LlmModel[] } = {};
  modelGroupIdList: string[] = [];

  toolChoiceMapper: { [tool_choice: string]: { name: string, label: string } } = {
    'auto': { name: 'auto', label: '自動判定' },
    'none': { name: 'none', label: '使わない' },
    'required': { name: 'required', label: '必ず使う' }
  };

  override ngOnInit(): void {
    super.ngOnInit();
    this.modelIdMas = this.chatService.modelList.reduce((acc: { [key: string]: LlmModel }, model) => {
      acc[model.id] = model;
      return acc;
    }, {});
    this.modelGroupMas = this.chatService.modelList.reduce((acc: { [key: string]: LlmModel[] }, model) => {
      const tag = model.tag;
      if (!acc[tag]) {
        this.modelGroupIdList.push(tag);
        acc[tag] = [];
      }
      acc[tag].push(model);
      return acc;
    }, {});

    // // ツールの初期選択状態を設定
    // this.initializeToolSelection();
  }

  removeThread($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.removeThreadEmitter.emit(this.thread());
  }

  modelChange(): void {
    const thread = this.thread();
    this.modelChangeEmitter.emit(thread.inDto.args.model || '');
    // console.log(`Change---------------${this.thread.inDto.args.model}`);
    this.modelCheck([thread.inDto.args.model || '']);
  }

  threadChange(): void {
    this.threadChangeEmitter.emit(this.thread());
  }

  modelCheck(modelList: string[] = []): void {
    // const mess = this.chatService.validateModelAttributes(modelList);
    // if (mess.message.length > 0) {
    //   this.dialog.open(DialogComponent, { data: { title: 'Alert', message: mess.message, options: ['Close'] } });
    // } else {
    //   // アラート不用
    // }
  }

  // // ツールの選択状態を管理
  // selectedTools: { [key: string]: boolean } = {};
  // groupSelection: { [key: string]: boolean } = {};


  // private initializeToolSelection(): void {
  //   // スレッドの設定から初期状態を設定
  //   const thread = this.thread();
  //   if (!thread.inDto.args.tools) {
  //     thread.inDto.args.tools = [];
  //   }

  //   // グループとツールの選択状態を初期化
  //   this.toolCallService.tools.forEach(group => {
  //     this.groupSelection[group.group] = false;
  //     group.tools.forEach(tool => {
  //       if (thread.inDto.args.tools && tool.info) {
  //         this.selectedTools[tool.info.name] = thread.inDto.args.tools.map(tool => tool.function?.name)?.includes(tool.info.name);
  //         if (this.selectedTools[tool.info.name]) {
  //           this.groupSelection[group.group] = true;
  //         }
  //       } else {
  //         // ツールが未設定の場合はすべて選択状態にする
  //       }
  //     });
  //   });
  // }

  // toggleGroup(groupName: string): void {
  //   this.groupSelection[groupName] = !this.groupSelection[groupName];

  //   // グループ内のすべてのツールを更新
  //   this.toolCallService.tools
  //     .find(g => g.group === groupName)?.tools
  //     .forEach(tool => {
  //       this.selectedTools[tool.info.name] = this.groupSelection[groupName];
  //     });

  //   this.updateThreadTools();
  // }

  // toggleTool(toolName: string, groupName: string): void {
  //   this.selectedTools[toolName] = !this.selectedTools[toolName];

  //   // グループの状態を更新
  //   const group = this.toolCallService.tools.find(g => g.group === groupName);
  //   if (group) {
  //     this.groupSelection[groupName] = group.tools
  //       .every(tool => this.selectedTools[tool.info.name]);
  //   }

  //   this.updateThreadTools();
  // }

  // private updateThreadTools(): void {
  //   const thread = this.thread();
  //   thread.inDto.args.tools = Object.entries(this.selectedTools)
  //     .filter(([_, selected]) => selected)
  //     .map(([name, _]) => this.toolCallService.tools
  //       .find(g => g.tools.some(tool => tool.info.name === name))
  //       ?.tools.find(tool => tool.info.name === name)?.definition.function).filter(Boolean) as any;
  //   console.dir(thread.inDto.args.tools);
  //   this.threadChangeEmitter.emit(thread);
  // }

  // isAllToolsInGroupSelected(groupName: string): boolean {
  //   const group = this.toolCallService.tools.find(g => g.group === groupName);
  //   return group?.tools.every(tool => this.selectedTools[tool.info.name]) ?? false;
  // }

  // isAnyToolInGroupSelected(groupName: string): boolean {
  //   const group = this.toolCallService.tools.find(g => g.group === groupName);
  //   return group?.tools.some(tool => this.selectedTools[tool.info.name]) ?? false;
  // }

}
