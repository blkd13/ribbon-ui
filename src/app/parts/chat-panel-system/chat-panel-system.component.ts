import { Component, effect, inject, input, output } from '@angular/core';
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
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MyToolType, ToolCallPart, ToolCallService } from '../../services/tool-call.service';

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

  readonly effectBitCounter2 = effect(() => {
    this.bitCounter();
    this.initialize();
  });

  constructor() {
    super();
  }

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
  initialize(): void {
    // ツールの初期選択状態を設定
    const thread = this.thread();
    if (thread) {
      // tool_choice が undefined だったら"none"を入れる。こうしないとチェックがどこにもつかない状態になる。
      thread.inDto.args.tool_choice = thread.inDto.args.tool_choice || 'none';
      const groups = Array.from(new Set(this.toolCallService.tools.map(tool => tool.group)));
      groups.forEach(group => {
        this.applyGroupCheck(thread, group);
      });
    } else { }
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

  // TODO これはisCheckが呼ばれまくるのでよくないように思う。
  isChecked(tool: MyToolType): boolean {
    const thread = this.thread();
    return thread.inDto.args.tools && thread.inDto.args.tools.find(t => t.function.name === tool.definition.function.name) ? true : false;
  }

  toolGroupCheckMasRecord(obj: any): { groupName: string, label: string, checked: boolean }[] {
    return Object.keys(obj).map(key => {
      const split = key.split('-');
      const groupName = split[0];
      split.splice(0, 1);
      const label = split.join('-');
      return { groupName, label, checked: obj[key], };
    });
  }

  toolGroupCheckMas: { [toolName: string]: number } = {};
  toolGroupClick($event: MouseEvent, groupDef: { group: string, tools: MyToolType[] }): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    const thread = this.thread();
    if (!thread.inDto.args.tools) {
      thread.inDto.args.tools = [];
    } else { }

    if (!thread.inDto.args.tool_choice || thread.inDto.args.tool_choice === 'none') {
      return;
    } else { }

    // 0：未選択、1：一部選択、2：全選択
    if (this.toolGroupCheckMas[groupDef.group] === 0) {
      this.toolGroupCheckMas[groupDef.group] = 2;
    } else if (this.toolGroupCheckMas[groupDef.group] === 1) {
      this.toolGroupCheckMas[groupDef.group] = 2;
    } else if (this.toolGroupCheckMas[groupDef.group] === 2) {
      this.toolGroupCheckMas[groupDef.group] = 0;
    } else {
      this.toolGroupCheckMas[groupDef.group] = 2;
    }

    // グループ選択に合わせて個別の選択状態を変更
    for (const toolCallPart of groupDef.tools) {
      const checkedDef = thread.inDto.args.tools.find(tool => tool.function.name === toolCallPart.definition.function.name);
      if (this.toolGroupCheckMas[groupDef.group] === 2) {
        if (checkedDef) {
          // すでにある場合は何もしない
        } else {
          thread.inDto.args.tools.push(toolCallPart.definition);
        }
      } else {
        thread.inDto.args.tools = thread.inDto.args.tools.filter(tool => tool.function.name !== toolCallPart.definition.function.name);
      }
    }
    this.threadChange();
  }

  toolCheckMas: { [toolName: string]: boolean } = {};
  toolCheck($event: MatCheckboxChange, toolCallPart: MyToolType): void {
    const thread = this.thread();
    if (!thread.inDto.args.tools) {
      thread.inDto.args.tools = [];
    } else { }

    const checkedDef = thread.inDto.args.tools.find(tool => tool.function.name === toolCallPart.definition.function.name);
    if ($event.checked) {
      if (checkedDef) {
        // すでにある場合は何もしない
      } else {
        thread.inDto.args.tools.push(toolCallPart.definition);
      }
    } else {
      thread.inDto.args.tools = thread.inDto.args.tools.filter(tool => tool.function.name !== toolCallPart.definition.function.name);
    }

    this.applyGroupCheck(thread, toolCallPart.info.group);
    this.threadChange();
  }

  applyGroupCheck(thread: Thread, group: string): void {
    const groupDef = this.toolCallService.tools.find(tool => tool.group === group);
    if (groupDef) {
      const checkedCount = groupDef.tools.filter(tool => thread.inDto.args.tools?.find(_tool => tool.definition.function.name === _tool.function.name)).length;
      // this.toolCheckMas[`${group}:indeterminate`] = checkedCount > 0 && checkedCount < groupDef.tools.length;

      if (checkedCount === groupDef.tools.length) {
        this.toolGroupCheckMas[groupDef.group] = 2;
      } else if (checkedCount === 0) {
        this.toolGroupCheckMas[groupDef.group] = 0;
      } else {
        this.toolGroupCheckMas[groupDef.group] = 1;
      }
    } else { }
  }


  // toolGroupCheck($event: MatCheckboxChange, groupDef: MyToolType[]): void {
  //   // groupDef.forEach(toolCallPart => {
  //   //   this.toolCheck($event, toolCallPart);
  //   //   this.toolCheckMas[`${toolCallPart.info.group}:${toolCallPart.definition.function.name}`] = $event.checked;

  //   //   //
  //   //   const thread = this.thread();
  //   //   if (!thread.inDto.args.tools) {
  //   //     thread.inDto.args.tools = [];
  //   //   } else { }
  //   //   if ($event.checked) {
  //   //     thread.inDto.args.tools.push(toolCallPart.definition);
  //   //   } else {
  //   //     thread.inDto.args.tools = thread.inDto.args.tools.filter(tool => tool.function.name !== toolCallPart.definition.function.name);
  //   //   }
  //   // });
  //   this.toolCheckMas[`${groupDef[0].info.group}:indeterminate`] = false;

  //   const thread = this.thread();
  //   if (!thread.inDto.args.tools) {
  //     thread.inDto.args.tools = [];
  //   } else { }

  //   for (const toolCallPart of groupDef) {
  //     const checkedDef = thread.inDto.args.tools.find(tool => tool.function.name === toolCallPart.definition.function.name);
  //     if ($event.checked) {
  //       if (checkedDef) {
  //         // すでにある場合は何もしない
  //       } else {
  //         thread.inDto.args.tools.push(toolCallPart.definition);
  //       }
  //     } else {
  //       thread.inDto.args.tools = thread.inDto.args.tools.filter(tool => tool.function.name !== toolCallPart.definition.function.name);
  //     }
  //   }
  //   this.threadChange();
  // }

  modelCheck(modelList: string[] = []): void {
    // const mess = this.chatService.validateModelAttributes(modelList);
    // if (mess.message.length > 0) {
    //   this.dialog.open(DialogComponent, { data: { title: 'Alert', message: mess.message, options: ['Close'] } });
    // } else {
    //   // アラート不用
    // }
  }
}
