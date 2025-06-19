import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatRadioModule } from '@angular/material/radio';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AppMenuComponent } from '../../../../parts/app-menu/app-menu.component';
import { ThreadGroupForView, Project, TeamForView } from '../../../../models/project-models';
import { NotificationService } from '../../../../shared/services/notification.service';

export interface ThreadListAction {
  type: 'select' | 'delete' | 'rename' | 'duplicate' | 'export';
  threadGroup: ThreadGroupForView;
  data?: any;
}

@Component({
  selector: 'app-chat-thread-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatRadioModule,
    MatTooltipModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    AppMenuComponent
  ],
  template: `
    <div class="thread-list-container" [class.collapsed]="!isVisible">
      <div class="thread-list-content">
        <!-- Header with App Menu -->
        <app-app-menu class="p-4"></app-app-menu>

        <!-- Project Selection -->
        <div class="project-title" [title]="selectedProject?.label">
          <label for="projectMenuTrigger" class="cursor-pointer gradient-text">
            {{ selectedProject?.label || 'プロジェクトを選択' }}
          </label>
          <button id="projectMenuTrigger" [matMenuTriggerFor]="projectMenu" style="display: none;"></button>
        </div>

        <mat-menu #projectMenu="matMenu" xPosition="before" [overlapTrigger]="false">
          @for (team of teamList; track team.id) {
            <div class="gradient-text pl-3">{{ team.label }}</div>
            @for (project of team.projects; track project.id) {
              <a mat-menu-item [routerLink]="['/chat', project.id, 'new-thread']">
                {{ project.label }}
              </a>
            }
            @if (team !== teamList[teamList.length - 1]) {
              <mat-divider></mat-divider>
            }
          }
        </mat-menu>

        <!-- Team Info -->
        @if (selectedTeam && selectedTeam.teamType !== 'Alone') {
          <div class="share-tag">Share: {{ selectedTeam.label }}</div>
        }

        <!-- New Thread Button -->
        <a 
          class="add-thread mb-5 bg-inherit ml-2" 
          matTooltip="新しいスレッドを作成" 
          (click)="onNewThread()"
          [routerLink]="['/chat', selectedProject?.id, 'new-thread']">
          <mat-icon class="mr-3">add_circle</mat-icon>
          <div>新規チャット</div>
        </a>

        <!-- Sort Options -->
        <mat-radio-group 
          color="primary" 
          aria-label="並び順" 
          [(ngModel)]="sortType" 
          class="relative bottom-3"
          (change)="onSortChange()">
          <mat-radio-button [value]="1">時刻順</mat-radio-button>
          <mat-radio-button [value]="2">名前順</mat-radio-button>
        </mat-radio-group>

        <!-- Search -->
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>スレッド検索</mat-label>
          <input 
            matInput 
            [(ngModel)]="searchQuery" 
            (ngModelChange)="onSearchChange()"
            placeholder="スレッド名で検索...">
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <!-- Thread List -->
        <div class="thread-list">
          @for (threadGroup of filteredThreadGroups; track threadGroup.id) {
            <div 
              class="thread-item"
              [class.active]="selectedThreadGroup?.id === threadGroup.id"
              (click)="onSelectThread(threadGroup)">
              
              <!-- Thread Info -->
              <div class="thread-info">
                <div class="thread-title" [title]="threadGroup.title">
                  {{ threadGroup.title || '無題のスレッド' }}
                </div>
                <div class="thread-meta">
                  <span class="message-count">
                    {{ getMessageCount(threadGroup) }} メッセージ
                  </span>
                  <span class="last-updated">
                    {{ formatDate(threadGroup.updatedAt) }}
                  </span>
                </div>
              </div>

              <!-- Thread Actions -->
              <div class="thread-actions" (click)="$event.stopPropagation()">
                <button 
                  mat-icon-button 
                  [matMenuTriggerFor]="threadMenu"
                  [matMenuTriggerData]="{ threadGroup: threadGroup }"
                  matTooltip="アクション">
                  <mat-icon>more_vert</mat-icon>
                </button>
              </div>
            </div>
          }

          <!-- Empty State -->
          @if (filteredThreadGroups.length === 0) {
            <div class="empty-state">
              @if (searchQuery) {
                <mat-icon>search_off</mat-icon>
                <p>検索結果がありません</p>
              } @else {
                <mat-icon>chat</mat-icon>
                <p>スレッドがありません</p>
                <p>新規チャットから始めましょう</p>
              }
            </div>
          }
        </div>
      </div>

      <!-- Thread Actions Menu -->
      <mat-menu #threadMenu="matMenu">
        <ng-template matMenuContent let-threadGroup="threadGroup">
          <button mat-menu-item (click)="onRenameThread(threadGroup)">
            <mat-icon>edit</mat-icon>
            <span>名前を変更</span>
          </button>
          <button mat-menu-item (click)="onDuplicateThread(threadGroup)">
            <mat-icon>content_copy</mat-icon>
            <span>複製</span>
          </button>
          <button mat-menu-item (click)="onExportThread(threadGroup)">
            <mat-icon>download</mat-icon>
            <span>エクスポート</span>
          </button>
          <mat-divider></mat-divider>
          <button mat-menu-item (click)="onDeleteThread(threadGroup)" class="delete-action">
            <mat-icon>delete</mat-icon>
            <span>削除</span>
          </button>
        </ng-template>
      </mat-menu>
    </div>
  `,
  styles: [`
    .thread-list-container {
      height: 100%;
      width: 208px;
      transition: width 0.3s ease;
      overflow: hidden;
      border-right: 1px solid var(--border-color, #e0e0e0);
      background: var(--surface-color, #fff);
    }

    .thread-list-container.collapsed {
      width: 8px;
    }

    .thread-list-content {
      width: 208px;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .project-title {
      padding: 12px 16px;
      font-weight: 500;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .gradient-text {
      background: linear-gradient(45deg, #2196f3, #9c27b0);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .share-tag {
      padding: 8px 16px;
      background: var(--primary-light, #e3f2fd);
      color: var(--primary-dark, #1976d2);
      font-size: 0.9em;
      text-align: center;
    }

    .add-thread {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      color: var(--primary, #2196f3);
      text-decoration: none;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .add-thread:hover {
      background: var(--primary-light, #e3f2fd);
    }

    .search-field {
      margin: 8px 16px;
      font-size: 0.9em;
    }

    .thread-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .thread-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-light, #f0f0f0);
      transition: background-color 0.2s;
    }

    .thread-item:hover {
      background: var(--hover-color, #f5f5f5);
    }

    .thread-item.active {
      background: var(--selected-color, #e3f2fd);
      border-right: 3px solid var(--primary, #2196f3);
    }

    .thread-info {
      flex: 1;
      min-width: 0;
    }

    .thread-title {
      font-weight: 500;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .thread-meta {
      display: flex;
      justify-content: space-between;
      font-size: 0.8em;
      color: var(--text-secondary, #666);
    }

    .thread-actions {
      flex-shrink: 0;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .thread-item:hover .thread-actions {
      opacity: 1;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      text-align: center;
      color: var(--text-secondary, #666);
      gap: 8px;
    }

    .empty-state mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0;
      font-size: 0.9em;
    }

    .delete-action {
      color: var(--error, #f44336);
    }

    /* スクロールバー */
    .thread-list::-webkit-scrollbar {
      width: 4px;
    }

    .thread-list::-webkit-scrollbar-track {
      background: transparent;
    }

    .thread-list::-webkit-scrollbar-thumb {
      background: var(--scrollbar-color, #ccc);
      border-radius: 2px;
    }
  `]
})
export class ChatThreadListComponent {
  @Input() threadGroups: ThreadGroupForView[] = [];
  @Input() selectedThreadGroup?: ThreadGroupForView;
  @Input() selectedProject?: Project;
  @Input() selectedTeam?: TeamForView;
  @Input() teamList: TeamForView[] = [];
  @Input() isVisible = true;
  @Input() sortType = 1; // 1: 時刻順, 2: 名前順

  @Output() threadAction = new EventEmitter<ThreadListAction>();
  @Output() newThread = new EventEmitter<void>();
  @Output() sortChanged = new EventEmitter<number>();

  private notificationService = inject(NotificationService);

  searchQuery = '';
  filteredThreadGroups: ThreadGroupForView[] = [];

  ngOnInit(): void {
    this.updateFilteredThreadGroups();
  }

  ngOnChanges(): void {
    this.updateFilteredThreadGroups();
  }

  onSelectThread(threadGroup: ThreadGroupForView): void {
    this.threadAction.emit({
      type: 'select',
      threadGroup
    });
  }

  onNewThread(): void {
    this.newThread.emit();
  }

  onSortChange(): void {
    this.sortChanged.emit(this.sortType);
    this.updateFilteredThreadGroups();
  }

  onSearchChange(): void {
    this.updateFilteredThreadGroups();
  }

  onRenameThread(threadGroup: ThreadGroupForView): void {
    const newName = prompt('新しいスレッド名を入力してください:', threadGroup.title);
    if (newName && newName.trim() && newName.trim() !== threadGroup.title) {
      this.threadAction.emit({
        type: 'rename',
        threadGroup,
        data: { newName: newName.trim() }
      });
    }
  }

  onDuplicateThread(threadGroup: ThreadGroupForView): void {
    this.threadAction.emit({
      type: 'duplicate',
      threadGroup
    });
  }

  onExportThread(threadGroup: ThreadGroupForView): void {
    this.threadAction.emit({
      type: 'export',
      threadGroup
    });
  }

  onDeleteThread(threadGroup: ThreadGroupForView): void {
    const confirmed = confirm(`スレッド "${threadGroup.title}" を削除してもよろしいですか？`);
    if (confirmed) {
      this.threadAction.emit({
        type: 'delete',
        threadGroup
      });
    }
  }

  getMessageCount(threadGroup: ThreadGroupForView): number {
    // メッセージ数の計算ロジック
    return threadGroup.messageCount || 0;
  }

  formatDate(date: string | Date): string {
    if (!date) return '';
    
    const dateObj = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return dateObj.toLocaleTimeString('ja-JP', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else if (diffDays === 1) {
      return '昨日';
    } else if (diffDays < 7) {
      return `${diffDays}日前`;
    } else {
      return dateObj.toLocaleDateString('ja-JP', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  }

  private updateFilteredThreadGroups(): void {
    let filtered = [...this.threadGroups];

    // 検索フィルタ
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(thread => 
        thread.title?.toLowerCase().includes(query) ||
        thread.description?.toLowerCase().includes(query)
      );
    }

    // ソート
    filtered.sort((a, b) => {
      if (this.sortType === 2) { // 名前順
        return (a.title || '').localeCompare(b.title || '');
      } else { // 時刻順（デフォルト）
        const dateA = new Date(a.updatedAt || a.createdAt || '').getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || '').getTime();
        return dateB - dateA; // 新しい順
      }
    });

    this.filteredThreadGroups = filtered;
  }
}