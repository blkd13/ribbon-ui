import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChatInputArea } from '../../../../services/chat.service';
import { FileDropDirective } from '../../../../parts/file-drop.directive';
import { DocTagComponent } from '../../../../parts/doc-tag/doc-tag.component';
import { NotificationService } from '../../../../shared/services/notification.service';

export interface ChatInputData {
  content: string;
  files?: File[];
  useWebSearch?: boolean;
}

@Component({
  selector: 'app-chat-input',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    FileDropDirective,
    DocTagComponent
  ],
  template: `
    <div class="chat-input-container" appFileDrop (filesDropped)="onFilesDropped($event)">
      <!-- File Upload Area -->
      @if (uploadedFiles.length > 0) {
        <div class="uploaded-files">
          @for (file of uploadedFiles; track file.name) {
            <div class="file-chip">
              <span>{{ file.name }}</span>
              <button mat-icon-button (click)="removeFile(file)" class="remove-file">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
        </div>
      }

      <!-- Main Input Area -->
      <div class="input-area">
        <mat-form-field appearance="outline" class="message-input">
          <textarea
            #textAreaElem
            matInput
            [(ngModel)]="inputArea.message"
            (keydown)="onKeyDown($event)"
            [placeholder]="placeholder"
            [disabled]="isLoading"
            rows="3"
            cdkTextareaAutosize
            [cdkAutosizeMinRows]="3"
            [cdkAutosizeMaxRows]="10">
          </textarea>
        </mat-form-field>

        <!-- Action Buttons -->
        <div class="action-buttons">
          <!-- File Upload -->
          <input 
            #fileInput 
            type="file" 
            multiple 
            (change)="onFileSelected($event)"
            style="display: none;">
          
          <button 
            mat-icon-button 
            (click)="fileInput.click()"
            matTooltip="ファイル添付"
            [disabled]="isLoading">
            <mat-icon>attach_file</mat-icon>
          </button>

          <!-- Web Search Toggle -->
          <button 
            mat-icon-button 
            [color]="inputArea.useWebSearch ? 'primary' : ''"
            (click)="toggleWebSearch()"
            matTooltip="Web検索を使用"
            [disabled]="isLoading">
            <mat-icon>search</mat-icon>
          </button>

          <!-- Send Button -->
          <button 
            mat-raised-button 
            color="primary"
            (click)="onSend()"
            [disabled]="!canSend()"
            class="send-button">
            @if (isLoading) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              <mat-icon>send</mat-icon>
            }
            {{ isLoading ? '送信中...' : '送信' }}
          </button>
        </div>
      </div>

      <!-- Token Count Display -->
      @if (tokenCount > 0) {
        <div class="token-info">
          推定トークン数: {{ tokenCount }}
        </div>
      }
    </div>
  `,
  styles: [`
    .chat-input-container {
      padding: 16px;
      border-top: 1px solid var(--border-color, #e0e0e0);
      background: var(--surface-color, #fff);
    }

    .uploaded-files {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }

    .file-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: var(--chip-background, #f5f5f5);
      border-radius: 16px;
      font-size: 0.9em;
    }

    .remove-file {
      width: 20px;
      height: 20px;
      font-size: 16px;
    }

    .input-area {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }

    .message-input {
      flex: 1;
    }

    .action-buttons {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .send-button {
      min-width: 100px;
      height: 40px;
    }

    .token-info {
      text-align: right;
      font-size: 0.8em;
      color: var(--text-secondary, #666);
      margin-top: 4px;
    }

    [appFileDrop] {
      position: relative;
    }

    [appFileDrop].drag-over::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(33, 150, 243, 0.1);
      border: 2px dashed #2196f3;
      border-radius: 8px;
      pointer-events: none;
    }
  `]
})
export class ChatInputComponent implements OnInit {
  @Input() inputArea: ChatInputArea = { message: '', useWebSearch: false };
  @Input() isLoading = false;
  @Input() placeholder = 'メッセージを入力してください...';
  @Input() tokenCount = 0;

  @Output() sendMessage = new EventEmitter<ChatInputData>();
  @Output() inputChanged = new EventEmitter<string>();
  @Output() filesChanged = new EventEmitter<File[]>();

  @ViewChild('textAreaElem') textAreaElem!: ElementRef<HTMLTextAreaElement>;

  private notificationService = inject(NotificationService);

  uploadedFiles: File[] = [];

  ngOnInit(): void {
    // Initialize component
  }

  onKeyDown(event: KeyboardEvent): void {
    // Ctrl/Cmd + Enter で送信
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      this.onSend();
    }

    // 入力変更を親に通知
    setTimeout(() => {
      this.inputChanged.emit(this.inputArea.message);
    }, 0);
  }

  onSend(): void {
    if (!this.canSend()) {
      return;
    }

    const inputData: ChatInputData = {
      content: this.inputArea.message.trim(),
      files: [...this.uploadedFiles],
      useWebSearch: this.inputArea.useWebSearch
    };

    this.sendMessage.emit(inputData);
    
    // 送信後にクリア
    this.clearInput();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.addFiles(Array.from(input.files));
      input.value = ''; // 同じファイルを再選択可能にする
    }
  }

  onFilesDropped(files: File[]): void {
    this.addFiles(files);
  }

  addFiles(files: File[]): void {
    // ファイルサイズチェック（例：10MB以下）
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        this.notificationService.showError(`${file.name} は10MBを超えているためアップロードできません`);
        return false;
      }
      return true;
    });

    // 重複チェック
    const newFiles = validFiles.filter(file => 
      !this.uploadedFiles.some(existing => 
        existing.name === file.name && existing.size === file.size
      )
    );

    this.uploadedFiles.push(...newFiles);
    this.filesChanged.emit([...this.uploadedFiles]);

    if (newFiles.length > 0) {
      this.notificationService.showSuccess(`${newFiles.length}個のファイルを追加しました`);
    }
  }

  removeFile(file: File): void {
    const index = this.uploadedFiles.indexOf(file);
    if (index > -1) {
      this.uploadedFiles.splice(index, 1);
      this.filesChanged.emit([...this.uploadedFiles]);
    }
  }

  toggleWebSearch(): void {
    this.inputArea.useWebSearch = !this.inputArea.useWebSearch;
  }

  canSend(): boolean {
    return !this.isLoading && 
           (this.inputArea.message.trim().length > 0 || this.uploadedFiles.length > 0);
  }

  clearInput(): void {
    this.inputArea.message = '';
    this.uploadedFiles = [];
    this.filesChanged.emit([]);
  }

  focusInput(): void {
    if (this.textAreaElem) {
      this.textAreaElem.nativeElement.focus();
    }
  }
}