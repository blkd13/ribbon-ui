import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
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

@Component({
  selector: 'app-chat-panel-system',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DocTagComponent,
    MatTooltipModule, MarkdownComponent, MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule, MatProgressSpinnerModule,
    MatDialogModule,
  ],
  templateUrl: './chat-panel-system.component.html',
  styleUrls: ['../chat-panel-base/chat-panel-base.component.scss', './chat-panel-system.component.scss'],
})
export class ChatPanelSystemComponent extends ChatPanelBaseComponent {

  @Input() thread!: Thread;
  @Input() removable!: boolean;

  @Output('removeThread')
  removeThreadEmitter: EventEmitter<Thread> = new EventEmitter();

  @Output('modelChange')
  modelChangeEmitter: EventEmitter<string> = new EventEmitter();

  readonly dialog: MatDialog = inject(MatDialog);


  removeThread($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.removeThreadEmitter.emit(this.thread);
  }

  modelChange(): void {
    this.modelChangeEmitter.emit(this.thread.inDto.args.model);
    // console.log(`Change---------------${this.thread.inDto.args.model}`);
    this.modelCheck([this.thread.inDto.args.model || '']);
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
