import { Component, Input, Output, EventEmitter, ViewChildren, QueryList, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChatPanelMessageComponent } from '../../../../parts/chat-panel-message/chat-panel-message.component';
import { ChatPanelSystemComponent } from '../../../../parts/chat-panel-system/chat-panel-system.component';
import { MessageGroupForView, ThreadGroupForView } from '../../../../models/project-models';
import { NotificationService } from '../../../../shared/services/notification.service';

export interface MessageAction {
  type: 'regenerate' | 'edit' | 'delete' | 'copy' | 'save';
  messageGroup: MessageGroupForView;
  data?: any;
}

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    CommonModule,
    ScrollingModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    ChatPanelMessageComponent,
    ChatPanelSystemComponent
  ],
  template: `
    <div class="message-list-container">
      <!-- Empty State -->
      @if (messageGroups.length === 0 && !isLoading) {
        <div class="empty-state">
          <mat-icon>chat</mat-icon>
          <h3>新しい会話を始めましょう</h3>
          <p>メッセージを入力して AI との対話を開始してください。</p>
        </div>
      }

      <!-- Message List -->
      <div class="message-list" #messageContainer>
        @for (messageGroup of messageGroups; track messageGroup.id; let i = $index) {
          @if (messageGroup.role === 'system') {
            <app-chat-panel-system
              [messageGroup]="messageGroup"
              [threadGroup]="selectedThreadGroup"
              [isEditable]="true"
              (messageAction)="onMessageAction($event)">
            </app-chat-panel-system>
          } @else {
            <app-chat-panel-message
              [messageGroup]="messageGroup"
              [threadGroup]="selectedThreadGroup"
              [isLast]="i === messageGroups.length - 1"
              [isStreaming]="isStreamingMessage(messageGroup)"
              (messageAction)="onMessageAction($event)">
            </app-chat-panel-message>
          }
        }

        <!-- Streaming Indicator -->
        @if (isLoading && showStreamingIndicator) {
          <div class="streaming-indicator">
            <mat-spinner diameter="20"></mat-spinner>
            <span>AI が回答を生成中...</span>
            <button mat-icon-button (click)="onCancelStreaming()" matTooltip="生成を停止">
              <mat-icon>stop</mat-icon>
            </button>
          </div>
        }

        <!-- Scroll Anchor -->
        <div #scrollAnchor class="scroll-anchor"></div>
      </div>

      <!-- Floating Action Button -->
      @if (showScrollToBottom) {
        <button 
          mat-fab 
          color="primary" 
          class="scroll-to-bottom-fab"
          (click)="scrollToBottom()"
          matTooltip="最下部にスクロール">
          <mat-icon>keyboard_arrow_down</mat-icon>
        </button>
      }

      <!-- Message Controls -->
      @if (messageGroups.length > 0) {
        <div class="message-controls">
          <button 
            mat-icon-button 
            (click)="onClearAll()"
            matTooltip="全メッセージをクリア"
            class="clear-button">
            <mat-icon>clear_all</mat-icon>
          </button>
          
          <button 
            mat-icon-button 
            (click)="onExportMessages()"
            matTooltip="メッセージをエクスポート"
            class="export-button">
            <mat-icon>download</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .message-list-container {
      position: relative;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      color: var(--text-secondary, #666);
      gap: 16px;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      opacity: 0.5;
    }

    .empty-state h3 {
      margin: 0;
      font-weight: 400;
    }

    .empty-state p {
      margin: 0;
      opacity: 0.7;
    }

    .message-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px;
      scroll-behavior: smooth;
    }

    .streaming-indicator {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--surface-variant, #f5f5f5);
      border-radius: 8px;
      margin: 8px 0;
      color: var(--text-secondary, #666);
    }

    .scroll-anchor {
      height: 1px;
    }

    .scroll-to-bottom-fab {
      position: absolute;
      bottom: 80px;
      right: 20px;
      z-index: 10;
    }

    .message-controls {
      position: absolute;
      top: 12px;
      right: 12px;
      display: flex;
      gap: 4px;
      background: var(--surface-color, #fff);
      border-radius: 20px;
      padding: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .message-controls:hover {
      opacity: 1;
    }

    .clear-button,
    .export-button {
      width: 36px;
      height: 36px;
    }

    /* スクロールバーのスタイリング */
    .message-list::-webkit-scrollbar {
      width: 6px;
    }

    .message-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .message-list::-webkit-scrollbar-thumb {
      background: var(--scrollbar-color, #ccc);
      border-radius: 3px;
    }

    .message-list::-webkit-scrollbar-thumb:hover {
      background: var(--scrollbar-hover-color, #999);
    }
  `]
})
export class ChatMessageListComponent implements OnChanges {
  @Input() messageGroups: MessageGroupForView[] = [];
  @Input() selectedThreadGroup?: ThreadGroupForView;
  @Input() isLoading = false;
  @Input() showStreamingIndicator = false;
  @Input() streamingMessageId?: string;

  @Output() messageAction = new EventEmitter<MessageAction>();
  @Output() cancelStreaming = new EventEmitter<void>();
  @Output() clearMessages = new EventEmitter<void>();
  @Output() exportMessages = new EventEmitter<void>();

  @ViewChildren(ChatPanelMessageComponent) messagePanels!: QueryList<ChatPanelMessageComponent>;
  @ViewChildren(ChatPanelSystemComponent) systemPanels!: QueryList<ChatPanelSystemComponent>;

  private notificationService = inject(NotificationService);

  showScrollToBottom = false;
  private messageContainer?: HTMLElement;
  private scrollAnchor?: HTMLElement;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['messageGroups'] && this.messageGroups.length > 0) {
      // 新しいメッセージが追加された時は自動スクロール
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  ngAfterViewInit(): void {
    this.setupScrollListener();
  }

  isStreamingMessage(messageGroup: MessageGroupForView): boolean {
    return this.isLoading && this.streamingMessageId === messageGroup.id;
  }

  onMessageAction(action: MessageAction): void {
    this.messageAction.emit(action);
  }

  onCancelStreaming(): void {
    this.cancelStreaming.emit();
  }

  onClearAll(): void {
    this.clearMessages.emit();
  }

  onExportMessages(): void {
    this.exportMessages.emit();
  }

  scrollToBottom(): void {
    if (this.scrollAnchor) {
      this.scrollAnchor.scrollIntoView({ behavior: 'smooth' });
    }
  }

  scrollToTop(): void {
    if (this.messageContainer) {
      this.messageContainer.scrollTop = 0;
    }
  }

  private setupScrollListener(): void {
    const container = document.querySelector('.message-list') as HTMLElement;
    if (container) {
      this.messageContainer = container;
      this.scrollAnchor = container.querySelector('.scroll-anchor') as HTMLElement;

      container.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = container;
        // 最下部から100px以上離れている場合にスクロールボタンを表示
        this.showScrollToBottom = scrollTop < scrollHeight - clientHeight - 100;
      });
    }
  }

  // メッセージ検索機能
  searchMessage(query: string): void {
    if (!query.trim()) return;

    const panels = [
      ...this.messagePanels.toArray(),
      ...this.systemPanels.toArray()
    ];

    let found = false;
    panels.forEach(panel => {
      const element = panel.element?.nativeElement;
      if (element && element.textContent?.toLowerCase().includes(query.toLowerCase())) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // ハイライト効果
        element.style.background = 'rgba(255, 235, 59, 0.3)';
        setTimeout(() => {
          element.style.background = '';
        }, 2000);
        
        if (!found) {
          found = true;
        }
      }
    });

    if (!found) {
      this.notificationService.showInfo(`"${query}" が見つかりませんでした`);
    }
  }

  // メッセージ統計情報
  getMessageStats(): { total: number; user: number; assistant: number; system: number } {
    const stats = {
      total: this.messageGroups.length,
      user: 0,
      assistant: 0,
      system: 0
    };

    this.messageGroups.forEach(msg => {
      switch (msg.role) {
        case 'user':
          stats.user++;
          break;
        case 'assistant':
          stats.assistant++;
          break;
        case 'system':
          stats.system++;
          break;
      }
    });

    return stats;
  }
}