import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Observable, Observer, Subscription, catchError, switchMap, tap, throwError } from 'rxjs';
import OpenAI from 'openai';

import { ChatService } from '../../../../services/chat.service';
import { MessageService } from '../../../../services/core/message.service';
import { FileManagerService } from '../../../../services/file-manager.service';
import { UserService } from '../../../../services/user.service';
import { AIModelManagerService } from '../../../../services/model-manager.service';
import { DomSanitizer } from '@angular/platform-browser';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  MessageForView,
  MessageStatusType,
  Thread,
  ContentPart,
  ContentPartType,
  Project
} from '../../../../models/project-models';
import { ChatInputArea } from '../../../../services/chat.service';
import { ToolCallPartCommand } from '../../../../services/tool-call.service';
import { FullPathFile } from '../../../../services/file-manager.service';

@Component({
  selector: 'app-chat-core',
  template: `<!-- Template will be extracted from main component -->`,
  standalone: true
})
export class ChatCoreComponent {
  @Input() selectedProject!: Project;
  @Input() threadList: Thread[] = [];
  @Input() inputArea!: ChatInputArea;
  @Input() isLock = false;
  @Input() threadLocks: { [threadId: string]: boolean } = {};

  @Output() lockChanged = new EventEmitter<boolean>();
  @Output() messageReceived = new EventEmitter<MessageForView>();
  @Output() streamCompleted = new EventEmitter<MessageForView>();
  @Output() streamError = new EventEmitter<{ message: MessageForView, error: Error }>();
  @Output() filesDropped = new EventEmitter<FullPathFile[]>();

  readonly chatService = inject(ChatService);
  readonly messageService = inject(MessageService);
  readonly fileManagerService = inject(FileManagerService);
  readonly userService = inject(UserService);
  readonly aiModelManagerService = inject(AIModelManagerService);
  readonly sanitizer = inject(DomSanitizer);
  readonly snackBar = inject(MatSnackBar);

  private chatStreamSubscriptionList: { [threadGroupId: string]: { message: MessageForView, subscription: Subscription }[] } = {};

  /**
   * チャット送信の中核処理
   */
  sendChat(
    type: 'threadGroup' | 'thread' | 'messageGroup' | 'message' | 'contentPart' | undefined,
    idList: string[] = [],
    toolCallPartCommandList?: ToolCallPartCommand[]
  ): Observable<any> {
    if (this.isLock) {
      this.snackBar.open('メッセージ受信中は送信できません。途中でやめる場合は右下の✕ボタンでメッセージをキャンセルしてください。', 'close', { duration: 3000 });
      throw new Error('メッセージ受信中は送信できません。');
    }

    // バリデーション処理
    this.validateBeforeSend();

    // スレッドロック設定
    this.setThreadLocks(true);
    this.lockChanged.emit(true);

    return this.executeChatCompletion(toolCallPartCommandList);
  }

  /**
   * チャットレスポンスストリームハンドラ
   */
  createChatStreamHandler(message: MessageForView): Partial<Observer<OpenAI.ChatCompletionChunk>> {
    return {
      next: (chunk) => {
        this.handleChatStreamChunk(message, chunk);
        this.messageReceived.emit(message);
      },
      error: (error) => {
        this.handleChatError(message, error);
        this.streamError.emit({ message, error });
        this.handleChatComplete(message);
      },
      complete: () => {
        this.handleChatComplete(message);
        this.streamCompleted.emit(message);
      }
    };
  }

  /**
   * ファイルドロップ処理
   */
  onFilesDropped(files: FullPathFile[]): Subscription {
    this.lockChanged.emit(true);
    
    const label = this.generateFileLabel(files);
    const file = {
      type: 'file' as const,
      fileGroupId: '',
      linkId: '',
      text: label,
      isLoading: true
    };
    
    this.inputArea.content.push(file);
    
    return this.fileManagerService
      .uploadFiles({
        uploadType: 'Group',
        projectId: this.selectedProject.id,
        contents: files.map(f => ({ filePath: f.fullPath, base64Data: f.base64String }))
      })
      .subscribe({
        next: (result) => {
          result.results.forEach(fileGroupEntity => {
            file.fileGroupId = fileGroupEntity.id;
            file.linkId = file.fileGroupId;
            file.isLoading = false;
          });
          this.lockChanged.emit(false);
        },
        error: (error) => {
          this.snackBar.open(`アップロードエラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
          this.lockChanged.emit(false);
        }
      });
  }

  /**
   * チャットキャンセル
   */
  cancelChat(threadGroupId: string): void {
    if (this.chatStreamSubscriptionList[threadGroupId]) {
      this.chatStreamSubscriptionList[threadGroupId].forEach(s => s.subscription.unsubscribe());
      delete this.chatStreamSubscriptionList[threadGroupId];
    }
    
    this.setThreadLocks(false);
    this.lockChanged.emit(false);
  }

  private validateBeforeSend(): void {
    for (const thread of this.threadList) {
      const modelName = thread.inDto.args.model ?? '';
      const model = this.aiModelManagerService.modelMap[modelName];

      if (!thread.inDto.args.model || !model) {
        this.snackBar.open(`${modelName}は利用できません。他のモデルに変更してください。`, 'close', { duration: 3000 });
        throw new Error('Model is not available.');
      }

      if (this.isThreadLocked(thread.id)) {
        this.snackBar.open('メッセージ受信中のスレッドがあります。', 'close', { duration: 3000 });
        throw new Error('Thread is locked.');
      }
    }
  }

  private setThreadLocks(locked: boolean): void {
    this.threadList.forEach(thread => {
      this.threadLocks[thread.id] = locked;
    });
  }

  private isThreadLocked(threadId: string): boolean {
    return this.threadLocks[threadId] || false;
  }

  private executeChatCompletion(toolCallPartCommandList?: ToolCallPartCommand[]): Observable<any> {
    // チャット実行の具体的な実装
    return this.chatService.chatCompletionObservableStreamByProjectModel(
      this.threadList[0].inDto.args,
      'messageGroup',
      '', // messageGroupId
      toolCallPartCommandList
    ).pipe(
      tap(response => {
        // レスポンス処理
        this.handleChatResponse(response);
      }),
      catchError(error => {
        this.setThreadLocks(false);
        this.lockChanged.emit(false);
        return throwError(() => error);
      })
    );
  }

  private handleChatStreamChunk(message: MessageForView, chunk: OpenAI.ChatCompletionChunk): void {
    // ストリームチャンクの処理ロジック
    const next = chunk as OpenAI.ChatCompletionChunk & { contentPart?: ContentPart };
    
    let content: ContentPart;
    next.choices.forEach(choice => {
      content = message.contents[message.contents.length - 1];
      
      if (choice.delta?.content && !['tool', 'info', 'command', 'input'].includes(choice.delta.role || '')) {
        if (content.type === ContentPartType.TEXT) {
          content.text += choice.delta.content;
        }
      }
      
      // その他のチャンク処理ロジック...
    });

    if (message.contents.some(c => c.type === 'text' && c.text?.trim())) {
      message.status = MessageStatusType.Loading;
    }
  }

  private handleChatError(message: MessageForView, error: Error): void {
    const contentPart = this.messageService.initContentPart(message.id, JSON.stringify(error));
    message.contents.push(contentPart);
    contentPart.type = ContentPartType.ERROR;
    
    message.status = MessageStatusType.Error;
  }

  private handleChatComplete(message: MessageForView): void {
    message.contents = message.contents.filter(content => 
      !(content.type === ContentPartType.TEXT && !content.text)
    );
    
    message.status = MessageStatusType.Loaded;
    message.label = message.contents
      .filter(content => content.type === 'text')
      .map(content => content.text)
      .join('\n')
      .substring(0, 250);
      
    this.setThreadLocks(false);
    this.lockChanged.emit(false);
  }

  private handleChatResponse(response: any): void {
    // チャットレスポンスの処理
    response.messageGroupList?.forEach((messageGroup: any) => {
      messageGroup.messages.forEach((message: MessageForView) => {
        message.contents.forEach((contentPart: ContentPart) => {
          if (contentPart.type === ContentPartType.TOOL) {
            contentPart.toolCallGroup = {
              id: '',
              projectId: this.selectedProject.id,
              toolCallList: JSON.parse(contentPart.text as string)
            };
          }
        });
      });
    });
  }

  private generateFileLabel(files: FullPathFile[]): string {
    if (files.length === 1) {
      return files[0].fullPath;
    } else {
      const file = files.find(f => f.fullPath.includes('/'));
      if (file) {
        return `${file.fullPath.split('/')[0]}/`;
      } else {
        return `${files.length} files`;
      }
    }
  }
}