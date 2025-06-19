import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subscription, Observable } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';

// 新しく作成したコンポーネント
import { ChatModelSelectorComponent } from '../chat-model-selector/chat-model-selector.component';
import { ChatThreadListComponent, ThreadListAction } from '../chat-thread-list/chat-thread-list.component';
import { ChatMessageListComponent, MessageAction } from '../chat-message-list/chat-message-list.component';
import { ChatInputComponent, ChatInputData } from '../chat-input/chat-input.component';

// 既存のサービスとモデル
import { ChatService, ChatInputArea } from '../../../../services/chat.service';
import { MessageService, ProjectService, ThreadService, TeamService } from '../../../../services/project.service';
import { AuthService } from '../../../../services/auth.service';
import { GService } from '../../../../services/g.service';
import { AIModelManagerService } from '../../../../services/model-manager.service';
import { NotificationService } from '../../../../shared/services/notification.service';

import { 
  ThreadGroupForView, 
  MessageGroupForView, 
  Project, 
  TeamForView, 
  ThreadGroup 
} from '../../../../models/project-models';
import { GPTModels } from '../../../../models/models';

@Component({
  selector: 'app-chat-container',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    ChatModelSelectorComponent,
    ChatThreadListComponent,
    ChatMessageListComponent,
    ChatInputComponent
  ],
  template: `
    <div class="chat-container">
      <!-- Toggle Thread List Button -->
      <div 
        class="thread-toggle" 
        (click)="toggleThreadList()" 
        [style.left]="showThreadList ? '202px' : '6px'">
        <mat-icon [style.transform]="showThreadList ? 'rotate(0deg)' : 'rotate(-180deg)'">
          first_page
        </mat-icon>
      </div>

      <!-- Thread List Panel -->
      <app-chat-thread-list
        [threadGroups]="threadGroupList"
        [selectedThreadGroup]="selectedThreadGroup"
        [selectedProject]="selectedProject"
        [selectedTeam]="selectedTeam"
        [teamList]="teamForViewList"
        [isVisible]="showThreadList"
        [sortType]="sortType"
        (threadAction)="onThreadAction($event)"
        (newThread)="onNewThread()"
        (sortChanged)="onSortChanged($event)">
      </app-chat-thread-list>

      <!-- Main Chat Area -->
      <div class="chat-main" [style.margin-left]="showThreadList ? '208px' : '8px'">
        @if (selectedThreadGroup) {
          <!-- Model Selector -->
          <app-chat-model-selector
            [threadGroup]="selectedThreadGroup"
            [selectedModelId]="getCurrentModelId()"
            [availableModels]="availableModels"
            (modelChanged)="onModelChanged($event)"
            (settingsChanged)="onModelSettingsChanged($event)">
          </app-chat-model-selector>

          <!-- Message List -->
          <app-chat-message-list
            [messageGroups]="currentMessageGroups"
            [selectedThreadGroup]="selectedThreadGroup"
            [isLoading]="isMessageLoading"
            [showStreamingIndicator]="isStreaming"
            [streamingMessageId]="streamingMessageId"
            (messageAction)="onMessageAction($event)"
            (cancelStreaming)="onCancelStreaming()"
            (clearMessages)="onClearMessages()"
            (exportMessages)="onExportMessages()">
          </app-chat-message-list>

          <!-- Input Area -->
          <app-chat-input
            [inputArea]="inputArea"
            [isLoading]="isMessageLoading"
            [tokenCount]="estimatedTokenCount"
            (sendMessage)="onSendMessage($event)"
            (inputChanged)="onInputChanged($event)"
            (filesChanged)="onFilesChanged($event)">
          </app-chat-input>
        } @else {
          <!-- Welcome Screen -->
          <div class="welcome-screen">
            <mat-icon>chat</mat-icon>
            <h2>AI チャットへようこそ</h2>
            <p>左側のパネルから新規チャットを作成するか、既存のスレッドを選択してください。</p>
            <button mat-raised-button color="primary" (click)="onNewThread()">
              新規チャットを開始
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .chat-container {
      display: flex;
      height: 100vh;
      position: relative;
      background: var(--background-color, #fafafa);
    }

    .thread-toggle {
      position: fixed;
      top: 50%;
      transform: translateY(-50%);
      z-index: 100;
      background: var(--surface-color, #fff);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
    }

    .thread-toggle:hover {
      background: var(--primary-light, #e3f2fd);
      transform: translateY(-50%) scale(1.1);
    }

    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      transition: margin-left 0.3s ease;
      min-width: 0;
    }

    .welcome-screen {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      text-align: center;
      gap: 24px;
      color: var(--text-secondary, #666);
    }

    .welcome-screen mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      opacity: 0.3;
    }

    .welcome-screen h2 {
      margin: 0;
      font-weight: 400;
    }

    .welcome-screen p {
      margin: 0;
      max-width: 400px;
    }
  `]
})
export class ChatContainerComponent implements OnInit, OnDestroy {
  // Services
  private chatService = inject(ChatService);
  private messageService = inject(MessageService);
  private projectService = inject(ProjectService);
  private threadService = inject(ThreadService);
  private teamService = inject(TeamService);
  private authService = inject(AuthService);
  private aiModelManagerService = inject(AIModelManagerService);
  private notificationService = inject(NotificationService);
  private gService = inject(GService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // State
  showThreadList = true;
  sortType = 1;
  isMessageLoading = false;
  isStreaming = false;
  streamingMessageId?: string;
  estimatedTokenCount = 0;

  // Data
  threadGroupList: ThreadGroupForView[] = [];
  selectedThreadGroup?: ThreadGroupForView;
  selectedProject?: Project;
  selectedTeam?: TeamForView;
  teamForViewList: TeamForView[] = [];
  availableModels: GPTModels[] = [];
  currentMessageGroups: MessageGroupForView[] = [];

  // Input
  inputArea: ChatInputArea = {
    message: '',
    useWebSearch: false
  };

  // Subscriptions
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    this.initializeComponent();
    this.setupRouteSubscription();
    this.loadInitialData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private initializeComponent(): void {
    // コンポーネントの初期化ロジック
    this.loadAvailableModels();
  }

  private setupRouteSubscription(): void {
    const routeSub = this.route.params.subscribe(params => {
      const projectId = params['projectId'];
      const threadGroupId = params['threadGroupId'];
      
      if (projectId) {
        this.loadProjectData(projectId);
      }
      
      if (threadGroupId && threadGroupId !== 'new-thread') {
        this.loadThreadGroup(threadGroupId);
      } else {
        this.createNewThread();
      }
    });
    
    this.subscriptions.push(routeSub);
  }

  private async loadInitialData(): Promise<void> {
    try {
      await Promise.all([
        this.loadProjects(),
        this.loadTeams()
      ]);
    } catch (error) {
      this.notificationService.showError('初期データの読み込みに失敗しました');
      console.error('Failed to load initial data:', error);
    }
  }

  private async loadAvailableModels(): Promise<void> {
    try {
      this.availableModels = await this.aiModelManagerService.getAIModels().toPromise() || [];
    } catch (error) {
      this.notificationService.showError('AIモデルの読み込みに失敗しました');
      console.error('Failed to load AI models:', error);
    }
  }

  private async loadProjects(): Promise<void> {
    // プロジェクト読み込みのロジック
  }

  private async loadTeams(): Promise<void> {
    // チーム読み込みのロジック
  }

  private async loadProjectData(projectId: string): Promise<void> {
    // プロジェクトデータ読み込みのロジック
  }

  private async loadThreadGroup(threadGroupId: string): Promise<void> {
    // スレッドグループ読み込みのロジック
  }

  private createNewThread(): void {
    // 新規スレッド作成のロジック
  }

  // Event Handlers
  toggleThreadList(): void {
    this.showThreadList = !this.showThreadList;
  }

  onThreadAction(action: ThreadListAction): void {
    switch (action.type) {
      case 'select':
        this.selectThread(action.threadGroup);
        break;
      case 'delete':
        this.deleteThread(action.threadGroup);
        break;
      case 'rename':
        this.renameThread(action.threadGroup, action.data.newName);
        break;
      case 'duplicate':
        this.duplicateThread(action.threadGroup);
        break;
      case 'export':
        this.exportThread(action.threadGroup);
        break;
    }
  }

  onNewThread(): void {
    if (this.selectedProject) {
      this.router.navigate(['/chat', this.selectedProject.id, 'new-thread']);
    }
  }

  onSortChanged(sortType: number): void {
    this.sortType = sortType;
    // ソート処理のロジック
  }

  onModelChanged(modelId: string): void {
    // モデル変更のロジック
  }

  onModelSettingsChanged(threadGroup: ThreadGroup): void {
    // モデル設定変更のロジック
  }

  onMessageAction(action: MessageAction): void {
    switch (action.type) {
      case 'regenerate':
        this.regenerateMessage(action.messageGroup);
        break;
      case 'edit':
        this.editMessage(action.messageGroup);
        break;
      case 'delete':
        this.deleteMessage(action.messageGroup);
        break;
      case 'copy':
        this.copyMessage(action.messageGroup);
        break;
      case 'save':
        this.saveMessage(action.messageGroup);
        break;
    }
  }

  onSendMessage(inputData: ChatInputData): void {
    this.sendMessage(inputData);
  }

  onInputChanged(content: string): void {
    // トークン数推定などの処理
    this.estimateTokenCount(content);
  }

  onFilesChanged(files: File[]): void {
    // ファイル変更の処理
  }

  onCancelStreaming(): void {
    this.cancelCurrentStreaming();
  }

  onClearMessages(): void {
    this.clearAllMessages();
  }

  onExportMessages(): void {
    this.exportCurrentThread();
  }

  // Helper Methods
  getCurrentModelId(): string {
    return this.selectedThreadGroup?.threadList?.[0]?.inDto?.args?.model || '';
  }

  private selectThread(threadGroup: ThreadGroupForView): void {
    // スレッド選択のロジック
  }

  private deleteThread(threadGroup: ThreadGroupForView): void {
    // スレッド削除のロジック
  }

  private renameThread(threadGroup: ThreadGroupForView, newName: string): void {
    // スレッド名前変更のロジック
  }

  private duplicateThread(threadGroup: ThreadGroupForView): void {
    // スレッド複製のロジック
  }

  private exportThread(threadGroup: ThreadGroupForView): void {
    // スレッドエクスポートのロジック
  }

  private async sendMessage(inputData: ChatInputData): Promise<void> {
    // メッセージ送信のロジック
  }

  private regenerateMessage(messageGroup: MessageGroupForView): void {
    // メッセージ再生成のロジック
  }

  private editMessage(messageGroup: MessageGroupForView): void {
    // メッセージ編集のロジック
  }

  private deleteMessage(messageGroup: MessageGroupForView): void {
    // メッセージ削除のロジック
  }

  private copyMessage(messageGroup: MessageGroupForView): void {
    // メッセージコピーのロジック
  }

  private saveMessage(messageGroup: MessageGroupForView): void {
    // メッセージ保存のロジック
  }

  private estimateTokenCount(content: string): void {
    // トークン数推定のロジック
  }

  private cancelCurrentStreaming(): void {
    // ストリーミングキャンセルのロジック
  }

  private clearAllMessages(): void {
    // 全メッセージクリアのロジック
  }

  private exportCurrentThread(): void {
    // 現在のスレッドエクスポートのロジック
  }
}