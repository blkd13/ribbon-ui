import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';

import { ContextHubService } from '../../services/context-hub.service';
import { ThreadService } from '../../services/core/thread.service';
import { TeamService } from '../../services/core/team.service';
import { ProjectCoreService } from '../../services/core/project-core.service';
import {
  ContextHubForView,
  ContextResourceForView,
  ContextResourceProviderType,
  ProviderOption,
} from '../../models/context-hub.models';
import { Project, ProjectVisibility, ThreadGroupForView, TeamMember, UUID } from '../../models/project-models';

import { ContextHubResourceDialogComponent } from './dialogs/context-hub-resource-dialog.component';
import { MattermostResourceWizardComponent } from './dialogs/mattermost-resource-wizard.component';
import { BoxResourceWizardComponent } from './dialogs/box-resource-wizard.component';
import { GitResourceWizardComponent } from './dialogs/git-resource-wizard.component';
import { ConfluenceResourceWizardComponent } from './dialogs/confluence-resource-wizard.component';
import { JiraResourceWizardComponent } from './dialogs/jira-resource-wizard.component';

@Component({
  selector: 'app-context-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    MatMenuModule,
  ],
  template: `
    <div class="project-dashboard">
      @if (isLoading) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <span>読み込み中...</span>
        </div>
      } @else {
        <!-- プロジェクトヘッダー -->
        <header class="project-header">
          <div class="header-left">
            <h1 class="project-name">{{ project?.label || 'プロジェクト' }}</h1>
            @if (project && project.visibility) {
              <span class="visibility-badge" [class]="'visibility-' + project.visibility">
                {{ getVisibilityLabel(project.visibility) }}
              </span>
            }
          </div>
          <div class="header-actions">
            <button mat-icon-button matTooltip="新しいスレッド" [routerLink]="['/chat', projectId, 'new-thread']">
              <mat-icon>add_comment</mat-icon>
            </button>
          </div>
        </header>

        <!-- ダッシュボードグリッド -->
        <div class="dashboard-grid">
          <!-- 最近のスレッド -->
          <section class="dashboard-card threads-card">
            <div class="card-header">
              <h2>
                <mat-icon>forum</mat-icon>
                最近のスレッド
              </h2>
              <button mat-icon-button matTooltip="すべてのスレッド" [routerLink]="['/chat', projectId]">
                <mat-icon>open_in_new</mat-icon>
              </button>
            </div>
            <div class="card-content">
              @if (threads.length === 0) {
                <div class="empty-state">
                  <mat-icon>chat_bubble_outline</mat-icon>
                  <p>スレッドがありません</p>
                  <a [routerLink]="['/chat', projectId, 'new-thread']" class="create-link">
                    新しいスレッドを作成
                  </a>
                </div>
              } @else {
                <div class="thread-list">
                  @for (thread of threads; track thread.id) {
                    <a class="thread-item" [routerLink]="['/chat', projectId, thread.id]">
                      <div class="thread-title">{{ thread.title || '無題のスレッド' }}</div>
                      <div class="thread-meta">{{ formatDate(thread.lastUpdate) }}</div>
                    </a>
                  }
                </div>
              }
            </div>
          </section>

          <!-- 登録リソース -->
          <section class="dashboard-card resources-card">
            <div class="card-header">
              <h2>
                <mat-icon>hub</mat-icon>
                登録リソース
              </h2>
              <button mat-icon-button [matMenuTriggerFor]="addResourceMenu" matTooltip="リソースを追加">
                <mat-icon>add</mat-icon>
              </button>
              <mat-menu #addResourceMenu="matMenu">
                @for (provider of availableProviders; track provider.type) {
                  <button mat-menu-item
                          [disabled]="!provider.isConnected && provider.authType !== 'none'"
                          (click)="openAddResourceDialog(provider.type, provider.name)">
                    <mat-icon>{{ getProviderIcon(provider.type) }}</mat-icon>
                    <span>{{ provider.label }}</span>
                    @if (!provider.isConnected && provider.authType !== 'none') {
                      <span class="disconnected-hint">(未接続)</span>
                    }
                  </button>
                }
              </mat-menu>
            </div>
            <div class="card-content">
              @if (!hub || hub.resources.length === 0) {
                <div class="empty-state">
                  <mat-icon>source</mat-icon>
                  <p>リソースがありません</p>
                  <span class="hint">＋ボタンからリソースを追加</span>
                </div>
              } @else {
                <div class="resource-list">
                  @for (resource of hub.resources; track resource.id) {
                    <div class="resource-item">
                      <div class="resource-icon" [style.background-color]="getProviderColor(resource.providerType)">
                        {{ getProviderEmoji(resource.providerType) }}
                      </div>
                      <div class="resource-info">
                        <div class="resource-name">{{ resource.label }}</div>
                        <div class="resource-type">{{ getProviderTypeLabel(resource.providerType) }}</div>
                      </div>
                      @if (resource.searchMode === 'realtime') {
                        <span class="mode-badge realtime" matTooltip="リアルタイム検索">RT</span>
                      } @else {
                        <span class="mode-badge vector" matTooltip="ベクトル検索">VEC</span>
                      }
                      <div class="resource-actions">
                        <button mat-icon-button (click)="editResource(resource)" matTooltip="編集">
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button mat-icon-button (click)="deleteResource(resource)" matTooltip="削除" class="delete-btn">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </section>

          <!-- メンバー (Team可視性のみ) -->
          @if (project?.visibility === 'Team') {
            <section class="dashboard-card members-card">
              <div class="card-header">
                <h2>
                  <mat-icon>group</mat-icon>
                  メンバー
                </h2>
              </div>
              <div class="card-content">
                @if (members.length === 0) {
                  <div class="empty-state">
                    <mat-icon>person_outline</mat-icon>
                    <p>メンバーがいません</p>
                  </div>
                } @else {
                  <div class="member-list">
                    @for (member of members; track member.id) {
                      <div class="member-item">
                        <div class="member-avatar">
                          {{ getMemberInitial(member) }}
                        </div>
                        <div class="member-info">
                          <div class="member-name">{{ getMemberName(member) }}</div>
                          <div class="member-role">{{ member.role }}</div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </section>
          }

          <!-- 統計 -->
          <section class="dashboard-card stats-card">
            <div class="card-header">
              <h2>
                <mat-icon>analytics</mat-icon>
                統計
              </h2>
            </div>
            <div class="card-content">
              <div class="stats-grid">
                <div class="stat-item">
                  <div class="stat-value">{{ threads.length }}</div>
                  <div class="stat-label">スレッド</div>
                </div>
                <div class="stat-item">
                  <div class="stat-value">{{ hub?.resources?.length || 0 }}</div>
                  <div class="stat-label">リソース</div>
                </div>
                @if (project?.visibility === 'Team') {
                  <div class="stat-item">
                    <div class="stat-value">{{ members.length }}</div>
                    <div class="stat-label">メンバー</div>
                  </div>
                }
              </div>
            </div>
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      --primary-color: #1a73e8;
      --bg-dark: #1e2128;
      --bg-card: #282c34;
      --bg-input: #3a3f4a;
      --text-primary: #ffffff;
      --text-secondary: #8b929a;
      --border-color: #3a3f4a;
      --success-color: #34a853;
      --warning-color: #fbbc04;
      --error-color: #ea4335;
    }

    .project-dashboard {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      gap: 16px;
      color: var(--text-secondary);
    }

    /* プロジェクトヘッダー */
    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-bottom: 1px solid var(--border-color);
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .project-name {
      font-size: 24px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
    }

    .visibility-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;

      &.visibility-Default {
        background-color: rgba(139, 146, 154, 0.2);
        color: var(--text-secondary);
      }
      &.visibility-Team {
        background-color: rgba(26, 115, 232, 0.2);
        color: var(--primary-color);
      }
      &.visibility-Public {
        background-color: rgba(52, 168, 83, 0.2);
        color: var(--success-color);
      }
      &.visibility-Login {
        background-color: rgba(251, 188, 4, 0.2);
        color: var(--warning-color);
      }
    }

    /* ダッシュボードグリッド */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;

      @media (max-width: 768px) {
        grid-template-columns: 1fr;
      }
    }

    /* カード共通 */
    .dashboard-card {
      background-color: var(--bg-card);
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);

      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
          color: var(--primary-color);
        }
      }
    }

    .card-content {
      padding: 16px 20px;
      min-height: 150px;
    }

    /* 空状態 */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      color: var(--text-secondary);
      text-align: center;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
        margin-bottom: 12px;
      }

      p {
        margin: 0 0 8px;
      }

      .create-link {
        color: var(--primary-color);
        text-decoration: none;
        font-size: 14px;

        &:hover {
          text-decoration: underline;
        }
      }

      .hint {
        font-size: 12px;
        opacity: 0.7;
      }
    }

    /* スレッドリスト */
    .thread-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .thread-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background-color: var(--bg-input);
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      transition: background-color 0.2s;

      &:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    }

    .thread-title {
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }

    .thread-meta {
      font-size: 12px;
      color: var(--text-secondary);
    }

    /* リソースリスト */
    .resource-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .resource-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background-color: var(--bg-input);
      border-radius: 8px;
    }

    .resource-icon {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }

    .resource-info {
      flex: 1;
      min-width: 0;
    }

    .resource-name {
      font-weight: 500;
      color: var(--text-primary);
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resource-type {
      font-size: 11px;
      color: var(--text-secondary);
    }

    .mode-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;

      &.realtime {
        background-color: rgba(255, 179, 0, 0.2);
        color: #ffb300;
      }

      &.vector {
        background-color: rgba(124, 77, 255, 0.2);
        color: #7c4dff;
      }
    }

    .resource-actions {
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.2s;

      button {
        width: 28px;
        height: 28px;

        mat-icon {
          font-size: 16px;
          width: 16px;
          height: 16px;
        }
      }

      .delete-btn:hover {
        color: var(--error-color);
      }
    }

    .resource-item:hover .resource-actions {
      opacity: 1;
    }

    /* メンバーリスト */
    .member-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .member-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
    }

    .member-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background-color: var(--primary-color);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
      color: white;
    }

    .member-info {
      flex: 1;
    }

    .member-name {
      font-weight: 500;
      color: var(--text-primary);
      font-size: 14px;
    }

    .member-role {
      font-size: 11px;
      color: var(--text-secondary);
    }

    /* 統計 */
    .stats-grid {
      display: flex;
      gap: 24px;
      justify-content: center;
      padding: 16px 0;
    }

    .stat-item {
      text-align: center;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      color: var(--primary-color);
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    /* メニュー */
    .disconnected-hint {
      color: var(--text-secondary);
      font-size: 11px;
      margin-left: 8px;
    }
  `]
})
export class ContextHubComponent implements OnInit, OnDestroy {
  @Input() projectId!: UUID;
  @Output() resourceSelected = new EventEmitter<ContextResourceForView>();

  readonly contextHubService = inject(ContextHubService);
  private readonly threadService = inject(ThreadService);
  private readonly teamService = inject(TeamService);
  private readonly projectService = inject(ProjectCoreService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);

  private destroy$ = new Subject<void>();

  // データ
  project: Project | null = null;
  hub: ContextHubForView | null = null;
  threads: ThreadGroupForView[] = [];
  members: TeamMember[] = [];
  availableProviders: ProviderOption[] = [];
  isLoading = false;

  ngOnInit(): void {
    if (!this.projectId) {
      const routeProjectId = this.route.snapshot.paramMap.get('projectId');
      if (routeProjectId) {
        this.projectId = routeProjectId as UUID;
      }
    }

    this.loadDashboardData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadDashboardData(): void {
    if (!this.projectId) return;

    this.isLoading = true;

    // 並列でデータ取得
    forkJoin({
      project: this.projectService.getProject(this.projectId),
      hub: this.contextHubService.getOrCreateHub(this.projectId),
      threads: this.threadService.getThreadGroupList(this.projectId, false, 1, 5),
      providers: this.contextHubService.getAvailableProviders(),
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: ({ project, hub, threads, providers }) => {
        this.project = project;
        this.hub = hub;
        this.threads = threads;
        this.availableProviders = providers;

        // Teamの場合はメンバーも取得
        if (project.visibility === ProjectVisibility.Team && project.teamId) {
          this.loadMembers(project.teamId);
        }

        this.isLoading = false;
      },
      error: err => {
        console.error('Failed to load dashboard:', err);
        this.isLoading = false;
        this.snackBar.open('データの読み込みに失敗しました', '閉じる', { duration: 3000 });
      }
    });
  }

  private loadMembers(teamId: string): void {
    this.teamService.getTeamMembers(teamId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: members => {
          this.members = members;
        },
        error: err => {
          console.error('Failed to load members:', err);
        }
      });
  }

  private loadHub(): void {
    if (!this.projectId) return;
    this.contextHubService.getOrCreateHub(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(hub => this.hub = hub);
  }

  // ヘルパーメソッド
  getVisibilityLabel(visibility: ProjectVisibility): string {
    const labels: Record<ProjectVisibility, string> = {
      [ProjectVisibility.Default]: '自分のみ',
      [ProjectVisibility.Team]: 'チーム',
      [ProjectVisibility.Public]: '公開',
      [ProjectVisibility.Login]: 'ログインユーザー',
    };
    return labels[visibility] || visibility;
  }

  formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '今日';
    if (days === 1) return '昨日';
    if (days < 7) return `${days}日前`;
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  getMemberInitial(member: TeamMember): string {
    const name = (member as any).user?.name || '';
    return name.charAt(0).toUpperCase() || '?';
  }

  getMemberName(member: TeamMember): string {
    return (member as any).user?.name || 'Unknown';
  }

  getProviderIcon(type: ContextResourceProviderType): string {
    const icons: Record<ContextResourceProviderType, string> = {
      box: 'cloud',
      gitlab: 'code',
      gitea: 'code',
      mattermost: 'chat',
      confluence: 'article',
      jira: 'bug_report',
      local: 'folder',
      web: 'language',
    };
    return icons[type] || 'storage';
  }

  getProviderColor(type: ContextResourceProviderType): string {
    const colors: Record<ContextResourceProviderType, string> = {
      mattermost: '#0058cc',
      box: '#0061d5',
      jira: '#0052cc',
      gitlab: '#fc6d26',
      gitea: '#609926',
      confluence: '#0052cc',
      local: '#7c4dff',
      web: '#00bcd4',
    };
    return colors[type] || '#1a73e8';
  }

  getProviderEmoji(type: ContextResourceProviderType): string {
    const emojis: Record<ContextResourceProviderType, string> = {
      mattermost: '💬',
      box: '📦',
      jira: '📋',
      gitlab: '🦊',
      gitea: '🍵',
      confluence: '📖',
      local: '📁',
      web: '🌐',
    };
    return emojis[type] || '📦';
  }

  getProviderTypeLabel(type: ContextResourceProviderType): string {
    return this.contextHubService.getProviderTypeLabel(type);
  }

  // リソース操作
  openAddResourceDialog(type: ContextResourceProviderType, providerName?: string): void {
    const provider = this.availableProviders.find(p => p.type === type);
    if (provider && !provider.isConnected && provider.authType !== 'none') {
      this.snackBar.open(`${provider.label}への接続が必要です`, '閉じる', { duration: 3000 });
      return;
    }

    // プロバイダー別ウィザード
    if (type === 'mattermost') {
      this.openMattermostWizard('create', providerName);
      return;
    }
    if (type === 'box') {
      this.openBoxWizard('create', providerName);
      return;
    }
    if (type === 'gitlab' || type === 'gitea') {
      this.openGitWizard('create', type, providerName);
      return;
    }
    if (type === 'confluence') {
      this.openConfluenceWizard('create', providerName);
      return;
    }
    if (type === 'jira') {
      this.openJiraWizard('create', providerName);
      return;
    }

    // その他はデフォルトダイアログ
    const dialogRef = this.dialog.open(ContextHubResourceDialogComponent, {
      width: '720px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode: 'create',
        contextHubId: this.hub?.id,
        providerType: type,
        providerName: providerName,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadHub();
    });
  }

  private openMattermostWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(MattermostResourceWizardComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: { mode, contextHubId: this.hub?.id, providerName: providerName || resource?.providerName, resource }
    });
    dialogRef.afterClosed().subscribe(result => { if (result) this.loadHub(); });
  }

  private openBoxWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(BoxResourceWizardComponent, {
      width: '90vw',
      height: 'calc(100vh - 80px)',
      maxWidth: '1600px',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: { mode, contextHubId: this.hub?.id, providerName: providerName || resource?.providerName, existingResource: resource }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'save' && result.resource) {
        if (mode === 'create') {
          this.contextHubService.addResource(result.resource).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => { this.snackBar.open('リソースを追加しました', '閉じる', { duration: 2000 }); this.loadHub(); },
            error: () => this.snackBar.open('リソースの追加に失敗しました', '閉じる', { duration: 3000 })
          });
        } else {
          this.contextHubService.updateResource(result.resource.id!, result.resource).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => { this.snackBar.open('リソースを更新しました', '閉じる', { duration: 2000 }); this.loadHub(); },
            error: () => this.snackBar.open('リソースの更新に失敗しました', '閉じる', { duration: 3000 })
          });
        }
      }
    });
  }

  private openGitWizard(mode: 'create' | 'edit', providerType: 'gitlab' | 'gitea', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(GitResourceWizardComponent, {
      width: '1000px',
      height: 'calc(100vh - 80px)',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'context-hub-dialog',
      data: { mode, contextHubId: this.hub?.id, providerType, providerName: providerName || resource?.providerName, resource }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'save' && result.resource) {
        if (mode === 'create') {
          this.contextHubService.addResource(result.resource).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => { this.snackBar.open('リソースを追加しました', '閉じる', { duration: 2000 }); this.loadHub(); },
            error: () => this.snackBar.open('リソースの追加に失敗しました', '閉じる', { duration: 3000 })
          });
        } else if (resource) {
          this.contextHubService.updateResource(resource.id, result.resource).pipe(takeUntil(this.destroy$)).subscribe({
            next: () => { this.snackBar.open('リソースを更新しました', '閉じる', { duration: 2000 }); this.loadHub(); },
            error: () => this.snackBar.open('リソースの更新に失敗しました', '閉じる', { duration: 3000 })
          });
        }
      }
    });
  }

  private openConfluenceWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(ConfluenceResourceWizardComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: { mode, contextHubId: this.hub?.id, providerName: providerName || resource?.providerName, resource }
    });
    dialogRef.afterClosed().subscribe(result => { if (result) this.loadHub(); });
  }

  private openJiraWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(JiraResourceWizardComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: { mode, contextHubId: this.hub?.id, providerName: providerName || resource?.providerName, resource }
    });
    dialogRef.afterClosed().subscribe(result => { if (result) this.loadHub(); });
  }

  editResource(resource: ContextResourceForView): void {
    if (resource.providerType === 'mattermost') {
      this.openMattermostWizard('edit', undefined, resource);
    } else if (resource.providerType === 'box') {
      this.openBoxWizard('edit', undefined, resource);
    } else if (resource.providerType === 'gitlab' || resource.providerType === 'gitea') {
      this.openGitWizard('edit', resource.providerType, resource.providerName, resource);
    } else if (resource.providerType === 'confluence') {
      this.openConfluenceWizard('edit', undefined, resource);
    } else if (resource.providerType === 'jira') {
      this.openJiraWizard('edit', undefined, resource);
    } else {
      const dialogRef = this.dialog.open(ContextHubResourceDialogComponent, {
        width: '720px',
        maxWidth: '95vw',
        maxHeight: '95vh',
        panelClass: 'context-hub-dialog',
        data: { mode: 'edit', resource }
      });
      dialogRef.afterClosed().subscribe(result => { if (result) this.loadHub(); });
    }
  }

  deleteResource(resource: ContextResourceForView): void {
    if (confirm(`「${resource.label}」を削除しますか？`)) {
      this.contextHubService.deleteResource(resource.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.snackBar.open('リソースを削除しました', '閉じる', { duration: 2000 });
            this.loadHub();
          },
          error: () => this.snackBar.open('削除に失敗しました', '閉じる', { duration: 3000 })
        });
    }
  }
}
