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

  readonly dialog: MatDialog = inject(MatDialog);
  readonly toolCall: ToolCallService = inject(ToolCallService);

  modelIdMas: { [modelId: string]: LlmModel } = {};
  modelGroupMas: { [modelId: string]: LlmModel[] } = {};
  modelGroupIdList: string[] = [];

  toolChoiceMapper: { [tool_choice: string]: { name: string, label: string } } = {
    'auto': { name: 'auto', label: '自動判定' },
    'none': { name: 'none', label: '使わない' },
    'required': { name: 'required', label: '必ず使う' }
  };

  override ngOnInit(): void {
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
}
