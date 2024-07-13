import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';

import { ChatCompletionContentPartText, Message, MessageForView } from '../../models/models';
import { ChatService } from '../../services/chat.service';
import { DomUtils } from '../../utils/dom-utils';
import { MarkdownComponent } from 'ngx-markdown';
import { DocTagComponent } from '../doc-tag/doc-tag.component';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DocTagComponent,
    MatTooltipModule, MarkdownComponent, MatIconModule, MatButtonModule, MatExpansionModule
  ],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss'
})
export class ChatPanelComponent {

  @Input() // status 0:未開始 1:実行中 2:完了
  message!: MessageForView;

  @ViewChild('textBodyElem')
  textBodyElem!: ElementRef<HTMLDivElement>;

  @Input()
  title!: string;

  @Input()
  placeholder?: string;

  @ViewChild('exPanel')
  exPanel!: MatExpansionPanel;

  @Input()
  set bitCounter(bitCounter: number) {
    setTimeout(() => this.scroll(), 1);
  }

  @Output('edit')
  editEmitter: EventEmitter<Message> = new EventEmitter();

  @Output('removeDoc')
  removeDocEmitter: EventEmitter<number> = new EventEmitter();

  @Output('remove')
  removeEmitter: EventEmitter<Message> = new EventEmitter();

  // Jsonの場合は```jsonで囲むための文字列
  brackets = { pre: '', post: '' };

  constructor(
    public chatService: ChatService,
  ) {

  }

  ngOnInit(): void {
    // TODO スクローラを一番下に
  }

  scroll(): void {
    const content = (this.message.content.find(content => content.type === 'text') as ChatCompletionContentPartText);
    if (content.text.startsWith('{') || content.text.startsWith('[')) {
      this.brackets.pre = '```json\n';
      this.brackets.post = '\n```';
    }
    // 一番下にスクロール
    DomUtils.scrollToBottomIfNeeded(this.textBodyElem.nativeElement);
  }

  /**
   * テキストをクリップボードにコピーする
   */
  copyToClipboard($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    const text = this.chatService.messageToText(this.message);
    const textArea = document.createElement("textarea");
    textArea.style.cssText = "position:absolute;left:-100%";
    document.body.appendChild(textArea);
    textArea.value = text;
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
  }

  removeDoc($index: number): void {
    this.removeDocEmitter.emit($index);
  }

  remove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    if (this.message.role === 'system') {
      // systemは行消さずに中身消すだけにする。
      this.message.content = [{ type: 'text', text: '' }];
      this.exPanel.close();
    } else {
    this.removeEmitter.emit(this.message);
  }
  }

  onBlur(): void {
    this.message.editing = 0;
  }

  timeoutId: any;
  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ($event.ctrlKey) {
      } else {
        this.editEmitter.emit(this.message);
      }
    } else {
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => this.onChange(), 1000);
    }
  }

  onChange(): void {
    this.editEmitter.emit(this.message);
  }

  height: string = 'auto';
  onLoad(): void {
  }

  setEdit($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    if (this.message.editing) {
    } else {
      this.exPanel.open();
      this.height = `${this.textBodyElem.nativeElement.clientHeight}px`;
    }
    this.message.editing = this.message.editing === 1 ? 0 : 1;
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}


export enum ChatCardStatus {
  NotStarted = 0,
  Running = 1,
  Completed = 2,
}
