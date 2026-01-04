import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ContextHubService } from '../../services/context-hub.service';
import {
  ContextHubForView,
  ContextResourceForView,
  ContextResourceProviderType,
  ProviderOption,
} from '../../models/context-hub.models';
import { UUID } from '../../models/project-models';

import { ContextHubResourceDialogComponent } from './dialogs/context-hub-resource-dialog.component';
import { MattermostResourceWizardComponent } from './dialogs/mattermost-resource-wizard.component';
import { BoxResourceWizardComponent } from './dialogs/box-resource-wizard.component';
import { GitResourceWizardComponent } from './dialogs/git-resource-wizard.component';
import { ConfluenceResourceWizardComponent } from './dialogs/confluence-resource-wizard.component';
import { JiraResourceWizardComponent } from './dialogs/jira-resource-wizard.component';

interface ResourceCardConfig {
  type: ContextResourceProviderType;
  name: string;
  label: string;
  description: string;
  icon: string;
  colorClass: string;
  features: string[];
  isConnected?: boolean;
  providerName?: string;
}

@Component({
  selector: 'app-context-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="context-hub-container">
      @if (isLoading) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <span>読み込み中...</span>
        </div>
      } @else {
        <!-- 連携サービス -->
        <section class="resource-section">
          <h2 class="section-title">連携サービス</h2>
          <div class="resource-grid">
            @for (card of connectedServiceCards; track card.type) {
              <div class="resource-card" [class]="card.colorClass"
                   (click)="openAddResourceDialog(card.type, card.providerName)"
                   [class.disabled]="!card.isConnected">
                <div class="resource-icon" [style.background-color]="getCardColor(card.colorClass)">
                  {{ card.icon }}
                </div>
                <div class="resource-name">{{ card.label }}</div>
                <div class="resource-description">{{ card.description }}</div>
                <div class="resource-features">
                  @for (feature of card.features; track feature) {
                    <span class="feature-tag">{{ feature }}</span>
                  }
                </div>
                @if (!card.isConnected) {
                  <div class="connection-status disconnected">
                    <mat-icon>link_off</mat-icon>
                    <span>未接続</span>
                  </div>
                }
              </div>
            }
          </div>
        </section>

        <!-- 手動リソース -->
        <section class="resource-section">
          <h2 class="section-title">手動リソース</h2>
          <div class="resource-grid">
            @for (card of manualResourceCards; track card.type) {
              <div class="resource-card" [class]="card.colorClass"
                   (click)="openAddResourceDialog(card.type)">
                <div class="resource-icon" [style.background-color]="getCardColor(card.colorClass)">
                  {{ card.icon }}
                </div>
                <div class="resource-name">{{ card.label }}</div>
                <div class="resource-description">{{ card.description }}</div>
                <div class="resource-features">
                  @for (feature of card.features; track feature) {
                    <span class="feature-tag">{{ feature }}</span>
                  }
                </div>
              </div>
            }
          </div>
        </section>

        <!-- 登録済みリソース -->
        @if (hub && hub.resources.length > 0) {
          <section class="registered-section">
            <h2 class="section-title">登録済みリソース</h2>
            <div class="registered-list">
              <div class="registered-header">
                <span></span>
                <span>リソース名</span>
                <span>タイプ</span>
                <span>ステータス</span>
                <span>最終同期</span>
                <span>操作</span>
              </div>
              @for (resource of hub.resources; track resource.id) {
                <div class="registered-item">
                  <div class="resource-type-icon" [style.background-color]="getProviderColor(resource.providerType)">
                    {{ getProviderEmoji(resource.providerType) }}
                  </div>
                  <div class="resource-info">
                    <div class="resource-info-name">{{ resource.label }}</div>
                    <div class="resource-info-path">{{ getResourceDescription(resource) }}</div>
                  </div>
                  <span class="resource-type-label">{{ getProviderTypeLabel(resource.providerType) }}</span>
                  <span class="status-badge" [class]="getStatusClass(resource.syncStatus)">
                    {{ getStatusLabel(resource.syncStatus) }}
                  </span>
                  <span class="last-sync">{{ formatLastSync(resource.lastSyncAt) }}</span>
                  <div class="action-btns">
                    <button class="action-btn" (click)="editResource(resource); $event.stopPropagation()" matTooltip="編集">
                      <mat-icon>edit</mat-icon>
                    </button>
                    <button class="action-btn" (click)="syncResource(resource); $event.stopPropagation()" matTooltip="同期">
                      <mat-icon>sync</mat-icon>
                    </button>
                    <button class="action-btn delete" (click)="deleteResource(resource); $event.stopPropagation()" matTooltip="削除">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                </div>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      --primary-color: #1a73e8;
      --primary-dark: #1557b0;
      --bg-dark: #1e2128;
      --bg-card: #282c34;
      --bg-input: #3a3f4a;
      --text-primary: #ffffff;
      --text-secondary: #8b929a;
      --border-color: #3a3f4a;
      --success-color: #34a853;
      --warning-color: #fbbc04;
      --error-color: #ea4335;
      --mattermost-color: #0058cc;
      --box-color: #0061d5;
      --jira-color: #0052cc;
      --gitlab-color: #fc6d26;
      --confluence-color: #0052cc;
      --upload-color: #7c4dff;
      --web-color: #00bcd4;
      --gitea-color: #609926;
    }

    .context-hub-container {
      display: flex;
      flex-direction: column;
      gap: 40px;
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

    /* Section Title */
    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-primary);

      &::before {
        content: '';
        width: 4px;
        height: 20px;
        background: var(--primary-color);
        border-radius: 2px;
      }
    }

    /* Resource Grid */
    .resource-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    .resource-card {
      background-color: var(--bg-card);
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 2px solid transparent;
      position: relative;
      overflow: hidden;

      &:hover {
        transform: translateY(-4px);
        border-color: var(--card-color);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      }

      &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: var(--card-color);
      }

      &.disabled {
        opacity: 0.6;
        cursor: not-allowed;

        &:hover {
          transform: none;
          border-color: transparent;
          box-shadow: none;
        }
      }

      &.mattermost { --card-color: var(--mattermost-color); }
      &.box { --card-color: var(--box-color); }
      &.jira { --card-color: var(--jira-color); }
      &.gitlab { --card-color: var(--gitlab-color); }
      &.gitea { --card-color: var(--gitea-color); }
      &.confluence { --card-color: var(--confluence-color); }
      &.upload { --card-color: var(--upload-color); }
      &.web { --card-color: var(--web-color); }
    }

    .resource-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      font-size: 24px;
    }

    .resource-name {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-primary);
    }

    .resource-description {
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    .resource-features {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 16px;
    }

    .feature-tag {
      padding: 4px 10px;
      background-color: var(--bg-input);
      border-radius: 12px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      font-size: 12px;

      &.disconnected {
        color: var(--warning-color);
      }

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    /* Registered Resources Section */
    .registered-section {
      margin-top: 8px;
    }

    .registered-list {
      background-color: var(--bg-card);
      border-radius: 12px;
      overflow: hidden;
    }

    .registered-header {
      display: grid;
      grid-template-columns: 48px 1fr 120px 100px 140px 100px;
      padding: 12px 20px;
      background-color: var(--bg-input);
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .registered-item {
      display: grid;
      grid-template-columns: 48px 1fr 120px 100px 140px 100px;
      padding: 16px 20px;
      align-items: center;
      border-bottom: 1px solid var(--border-color);
      transition: background-color 0.2s;

      &:hover {
        background-color: rgba(255, 255, 255, 0.05);
      }

      &:last-child {
        border-bottom: none;
      }
    }

    .resource-type-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }

    .resource-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .resource-info-name {
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resource-info-path {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resource-type-label {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      width: fit-content;

      &::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      &.synced {
        background-color: rgba(52, 168, 83, 0.2);
        color: var(--success-color);
      }

      &.syncing, &.pending {
        background-color: rgba(251, 188, 4, 0.2);
        color: var(--warning-color);
      }

      &.error {
        background-color: rgba(234, 67, 53, 0.2);
        color: var(--error-color);
      }

      &.disabled {
        background-color: rgba(139, 146, 154, 0.2);
        color: var(--text-secondary);
      }
    }

    .last-sync {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .action-btns {
      display: flex;
      gap: 4px;
    }

    .action-btn {
      width: 32px;
      height: 32px;
      border: none;
      background-color: var(--bg-input);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      &:hover {
        background-color: var(--primary-color);
        color: white;
      }

      &.delete:hover {
        background-color: var(--error-color);
      }
    }

    @media (max-width: 900px) {
      .registered-header,
      .registered-item {
        grid-template-columns: 48px 1fr 100px 80px;

        span:nth-child(5),
        .last-sync {
          display: none;
        }
      }
    }

    @media (max-width: 600px) {
      .registered-header {
        display: none;
      }

      .registered-item {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 16px;

        .resource-type-icon {
          flex-shrink: 0;
        }

        .resource-info {
          flex: 1;
          min-width: 150px;
        }

        .resource-type-label {
          display: none;
        }

        .status-badge {
          order: 3;
        }

        .action-btns {
          order: 4;
          margin-left: auto;
        }
      }
    }
  `]
})
export class ContextHubComponent implements OnInit, OnDestroy {
  @Input() projectId!: UUID;
  @Output() resourceSelected = new EventEmitter<ContextResourceForView>();

  readonly contextHubService = inject(ContextHubService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);

  private destroy$ = new Subject<void>();

  hub: ContextHubForView | null = null;
  isLoading = false;
  availableProviders: ProviderOption[] = [];

  // 連携サービスカード
  connectedServiceCards: ResourceCardConfig[] = [];

  // 手動リソースカード
  manualResourceCards: ResourceCardConfig[] = [
    {
      type: 'local',
      name: 'local',
      label: 'ファイル/ディレクトリ',
      description: 'ローカルファイルやディレクトリを直接アップロード',
      icon: '📁',
      colorClass: 'upload',
      features: ['ドラッグ&ドロップ', '複数選択', 'ZIP対応'],
      isConnected: true,
    },
    {
      type: 'web',
      name: 'web',
      label: 'Webリソース',
      description: 'URLを指定してWebページやAPIを連携',
      icon: '🌐',
      colorClass: 'web',
      features: ['URL指定', 'スクレイピング', 'RSS/API', '定期更新'],
      isConnected: true,
    },
  ];

  ngOnInit(): void {
    // ルートパラメータからprojectIdを取得（@Inputで渡されていない場合）
    if (!this.projectId) {
      const routeProjectId = this.route.snapshot.paramMap.get('projectId');
      if (routeProjectId) {
        this.projectId = routeProjectId as UUID;
      }
    }

    this.loadHub();
    this.loadAvailableProviders();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadHub(): void {
    if (!this.projectId) return;

    this.isLoading = true;
    this.contextHubService.getOrCreateHub(this.projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: hub => {
          this.hub = hub;
          this.isLoading = false;
        },
        error: err => {
          console.error('Failed to load context hub:', err);
          this.isLoading = false;
          this.snackBar.open('Context Hubの読み込みに失敗しました', '閉じる', { duration: 3000 });
        }
      });
  }

  private loadAvailableProviders(): void {
    this.contextHubService.getAvailableProviders()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: providers => {
          this.availableProviders = providers;
          this.buildConnectedServiceCards(providers);
        },
        error: err => {
          console.error('Failed to load providers:', err);
          // 静的なカード定義をフォールバックとして使用
          this.buildDefaultServiceCards();
        }
      });
  }

  private buildConnectedServiceCards(providers: ProviderOption[]): void {
    const serviceConfigs: Record<string, Partial<ResourceCardConfig>> = {
      mattermost: {
        label: 'Mattermost',
        description: 'チームコミュニケーションのチャネルやメッセージを連携',
        icon: '💬',
        colorClass: 'mattermost',
        features: ['チーム指定', 'チャネル指定', '期間指定', 'キーワード'],
      },
      box: {
        label: 'Box',
        description: 'クラウドストレージのファイルやフォルダを連携',
        icon: '📦',
        colorClass: 'box',
        features: ['ディレクトリ指定', '拡張子', '深さ指定', 'サイズ制限'],
      },
      jira: {
        label: 'Jira',
        description: 'プロジェクト管理のチケットやスプリントを連携',
        icon: '📋',
        colorClass: 'jira',
        features: ['プロジェクト指定', 'スプリント', '担当者', 'JQL'],
      },
      gitlab: {
        label: 'GitLab',
        description: 'リポジトリやCI/CDパイプラインを連携',
        icon: '🦊',
        colorClass: 'gitlab',
        features: ['リポジトリ指定', 'ブランチ', 'MR/Issue', 'パイプライン'],
      },
      gitea: {
        label: 'Gitea',
        description: '軽量なGitリポジトリを連携',
        icon: '🍵',
        colorClass: 'gitea',
        features: ['リポジトリ指定', 'ブランチ', 'Issue', 'PR'],
      },
      confluence: {
        label: 'Confluence',
        description: 'ドキュメントやナレッジベースを連携',
        icon: '📖',
        colorClass: 'confluence',
        features: ['スペース指定', 'ページ選択', 'ラベル', '更新日'],
      },
    };

    this.connectedServiceCards = providers
      .filter(p => p.type !== 'local' && p.type !== 'web')
      .map(provider => {
        const config = serviceConfigs[provider.type] || {};
        return {
          type: provider.type,
          name: provider.name,
          label: config.label || provider.label,
          description: config.description || '',
          icon: config.icon || '📦',
          colorClass: config.colorClass || 'box',
          features: config.features || [],
          isConnected: provider.isConnected,
          providerName: provider.name,
        };
      });
  }

  private buildDefaultServiceCards(): void {
    this.connectedServiceCards = [
      {
        type: 'mattermost',
        name: 'mattermost',
        label: 'Mattermost',
        description: 'チームコミュニケーションのチャネルやメッセージを連携',
        icon: '💬',
        colorClass: 'mattermost',
        features: ['チーム指定', 'チャネル指定', '期間指定', 'キーワード'],
        isConnected: false,
      },
      {
        type: 'box',
        name: 'box',
        label: 'Box',
        description: 'クラウドストレージのファイルやフォルダを連携',
        icon: '📦',
        colorClass: 'box',
        features: ['ディレクトリ指定', '拡張子', '深さ指定', 'サイズ制限'],
        isConnected: false,
      },
      {
        type: 'jira',
        name: 'jira',
        label: 'Jira',
        description: 'プロジェクト管理のチケットやスプリントを連携',
        icon: '📋',
        colorClass: 'jira',
        features: ['プロジェクト指定', 'スプリント', '担当者', 'JQL'],
        isConnected: false,
      },
      {
        type: 'gitlab',
        name: 'gitlab',
        label: 'GitLab',
        description: 'リポジトリやCI/CDパイプラインを連携',
        icon: '🦊',
        colorClass: 'gitlab',
        features: ['リポジトリ指定', 'ブランチ', 'MR/Issue', 'パイプライン'],
        isConnected: false,
      },
      {
        type: 'confluence',
        name: 'confluence',
        label: 'Confluence',
        description: 'ドキュメントやナレッジベースを連携',
        icon: '📖',
        colorClass: 'confluence',
        features: ['スペース指定', 'ページ選択', 'ラベル', '更新日'],
        isConnected: false,
      },
    ];
  }

  getCardColor(colorClass: string): string {
    const colors: Record<string, string> = {
      mattermost: '#0058cc',
      box: '#0061d5',
      jira: '#0052cc',
      gitlab: '#fc6d26',
      gitea: '#609926',
      confluence: '#0052cc',
      upload: '#7c4dff',
      web: '#00bcd4',
    };
    return colors[colorClass] || '#1a73e8';
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

  getResourceDescription(resource: ContextResourceForView): string {
    const config = resource.config as any;

    switch (resource.providerType) {
      case 'box':
        return config.folderPath || `フォルダID: ${config.folderId}`;
      case 'gitlab':
        return config.projectPath || `Project ID: ${config.projectId}`;
      case 'gitea':
        return config.repoFullName || `${config.owner}/${config.repo}`;
      case 'confluence':
        return config.spaceName || `スペース: ${config.spaceKey}`;
      case 'jira':
        return config.jql || `プロジェクト: ${config.projectKey}`;
      case 'mattermost':
        return config.timelineName || config.channelNames?.join(', ') || '';
      case 'web':
        return config.urls?.[0] || config.sitelistPath || '';
      default:
        return '';
    }
  }

  getStatusClass(status: string): string {
    return status || 'pending';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      synced: '同期済み',
      syncing: '同期中...',
      pending: '同期待ち',
      error: 'エラー',
      disabled: '無効',
    };
    return labels[status] || status;
  }

  formatLastSync(date: Date | undefined): string {
    if (!date) return '-';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** プロバイダータイプに応じたダイアログ幅を取得 */
  private getDialogWidth(type: ContextResourceProviderType): string {
    // 横長UIを使うプロバイダー
    const wideProviders: ContextResourceProviderType[] = ['mattermost', 'box', 'gitlab', 'gitea'];
    return wideProviders.includes(type) ? '1100px' : '720px';
  }

  openAddResourceDialog(type: ContextResourceProviderType, providerName?: string): void {
    // 未接続のプロバイダーはクリック不可
    const card = this.connectedServiceCards.find(c => c.type === type);
    if (card && !card.isConnected) {
      this.snackBar.open(`${card.label}への接続が必要です`, '閉じる', { duration: 3000 });
      return;
    }

    // Mattermost/Box/GitLab/Giteaはウィザード形式で開く
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

    const dialogRef = this.dialog.open(ContextHubResourceDialogComponent, {
      width: this.getDialogWidth(type),
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
      if (result) {
        this.loadHub();
      }
    });
  }

  /** Mattermostウィザードを開く */
  private openMattermostWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(MattermostResourceWizardComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode,
        contextHubId: this.hub?.id,
        providerName: providerName || resource?.providerName,
        resource,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadHub();
      }
    });
  }

  /** Boxウィザードを開く */
  private openBoxWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(BoxResourceWizardComponent, {
      width: '90vw',
      height: 'calc(100vh - 80px)',
      maxWidth: '1600px',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode,
        contextHubId: this.hub?.id,
        providerName: providerName || resource?.providerName,
        existingResource: resource,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'save' && result.resource) {
        if (mode === 'create') {
          this.contextHubService.addResource(result.resource)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.snackBar.open('リソースを追加しました', '閉じる', { duration: 2000 });
                this.loadHub();
              },
              error: (err: unknown) => {
                console.error('Failed to create resource:', err);
                this.snackBar.open('リソースの追加に失敗しました', '閉じる', { duration: 3000 });
              }
            });
        } else {
          this.contextHubService.updateResource(result.resource.id!, result.resource)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.snackBar.open('リソースを更新しました', '閉じる', { duration: 2000 });
                this.loadHub();
              },
              error: (err: unknown) => {
                console.error('Failed to update resource:', err);
                this.snackBar.open('リソースの更新に失敗しました', '閉じる', { duration: 3000 });
              }
            });
        }
      }
    });
  }

  /** GitLab/Giteaウィザードを開く */
  private openGitWizard(
    mode: 'create' | 'edit',
    providerType: 'gitlab' | 'gitea',
    providerName?: string,
    resource?: ContextResourceForView
  ): void {
    const dialogRef = this.dialog.open(GitResourceWizardComponent, {
      width: '1000px',
      height: 'calc(100vh - 80px)',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode,
        contextHubId: this.hub?.id,
        providerType,
        providerName: providerName || resource?.providerName,
        resource,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'save' && result.resource) {
        if (mode === 'create') {
          this.contextHubService.addResource(result.resource)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.snackBar.open('リソースを追加しました', '閉じる', { duration: 2000 });
                this.loadHub();
              },
              error: (err: unknown) => {
                console.error('Failed to create resource:', err);
                this.snackBar.open('リソースの追加に失敗しました', '閉じる', { duration: 3000 });
              }
            });
        } else if (resource) {
          this.contextHubService.updateResource(resource.id, result.resource)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.snackBar.open('リソースを更新しました', '閉じる', { duration: 2000 });
                this.loadHub();
              },
              error: (err: unknown) => {
                console.error('Failed to update resource:', err);
                this.snackBar.open('リソースの更新に失敗しました', '閉じる', { duration: 3000 });
              }
            });
        }
      }
    });
  }

  /** Confluenceウィザードを開く */
  private openConfluenceWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(ConfluenceResourceWizardComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode,
        contextHubId: this.hub?.id,
        providerName: providerName || resource?.providerName,
        resource,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadHub();
      }
    });
  }

  /** JIRAウィザードを開く */
  private openJiraWizard(mode: 'create' | 'edit', providerName?: string, resource?: ContextResourceForView): void {
    const dialogRef = this.dialog.open(JiraResourceWizardComponent, {
      width: '1000px',
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode,
        contextHubId: this.hub?.id,
        providerName: providerName || resource?.providerName,
        resource,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadHub();
      }
    });
  }

  editResource(resource: ContextResourceForView): void {
    // Mattermost/Box/GitLab/Gitea/Confluenceはウィザード形式で開く
    if (resource.providerType === 'mattermost') {
      this.openMattermostWizard('edit', undefined, resource);
      return;
    }
    if (resource.providerType === 'box') {
      this.openBoxWizard('edit', undefined, resource);
      return;
    }
    if (resource.providerType === 'gitlab' || resource.providerType === 'gitea') {
      this.openGitWizard('edit', resource.providerType, resource.providerName, resource);
      return;
    }
    if (resource.providerType === 'confluence') {
      this.openConfluenceWizard('edit', undefined, resource);
      return;
    }
    if (resource.providerType === 'jira') {
      this.openJiraWizard('edit', undefined, resource);
      return;
    }

    const dialogRef = this.dialog.open(ContextHubResourceDialogComponent, {
      width: this.getDialogWidth(resource.providerType),
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'context-hub-dialog',
      data: {
        mode: 'edit',
        resource: resource,
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadHub();
      }
    });
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
          error: err => {
            console.error('Failed to delete resource:', err);
            this.snackBar.open('削除に失敗しました', '閉じる', { duration: 3000 });
          }
        });
    }
  }

  syncResource(resource: ContextResourceForView): void {
    this.contextHubService.syncResource(resource.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('同期を開始しました', '閉じる', { duration: 2000 });
        },
        error: err => {
          console.error('Failed to sync resource:', err);
          this.snackBar.open('同期に失敗しました', '閉じる', { duration: 3000 });
        }
      });
  }
}
