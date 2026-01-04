import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { ContextHubForView, ContextResourceForView, ContextResourceProviderType, ContextResourceSyncStatus } from '../../models/context-hub.models';
import { UUID } from '../../models/project-models';
import { ContextHubService } from '../../services/context-hub.service';

export interface ResourceSelectionChange {
  resourceId: string;
  selected: boolean;
}

@Component({
  selector: 'app-context-hub-sidebar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="context-hub-sidebar">
      <!-- Header -->
      <div class="sidebar-header">
        <mat-icon class="header-icon">hub</mat-icon>
        <span class="header-title">コンテキスト</span>
        <button mat-icon-button
                matTooltip="全て同期"
                (click)="onSyncAll()"
                [disabled]="isSyncing">
          <mat-icon>sync</mat-icon>
        </button>
      </div>

      <!-- Loading State -->
      @if (isLoading) {
        <div class="loading-container">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      }

      <!-- Empty State -->
      @if (!isLoading && (!hub || hub.resources.length === 0)) {
        <div class="empty-state">
          <mat-icon class="empty-icon">folder_off</mat-icon>
          <p>リソースがありません</p>
          <a [routerLink]="['/context-hub', projectId]" class="add-link">
            <mat-icon>add</mat-icon>
            リソースを追加
          </a>
        </div>
      }

      <!-- Resource List -->
      @if (!isLoading && hub && hub.resources.length > 0) {
        <div class="resource-list">
          @for (resource of hub.resources; track resource.id) {
            <div class="resource-item"
                 [class.selected]="isSelected(resource.id)"
                 [class.disabled]="!resource.isActive">

              <!-- Checkbox -->
              <mat-checkbox
                [checked]="isSelected(resource.id)"
                [disabled]="!resource.isActive || resource.syncStatus === 'error'"
                (change)="onSelectionChange(resource, $event.checked)"
                color="primary">
              </mat-checkbox>

              <!-- Provider Icon -->
              <mat-icon class="provider-icon" [class]="'provider-' + resource.providerType">
                {{ getProviderIcon(resource.providerType) }}
              </mat-icon>

              <!-- Resource Info -->
              <div class="resource-info" (click)="onResourceClick(resource)">
                <div class="resource-label">{{ resource.label }}</div>
                <div class="resource-meta">
                  <span class="provider-name">{{ getProviderLabel(resource.providerType) }}</span>
                  @if (resource.itemCount !== undefined && resource.itemCount !== null) {
                    <span class="item-count">{{ resource.itemCount }}件</span>
                  }
                </div>
              </div>

              <!-- Sync Status -->
              <div class="sync-status" [class]="'status-' + resource.syncStatus">
                @switch (resource.syncStatus) {
                  @case ('syncing') {
                    <mat-spinner diameter="16"></mat-spinner>
                  }
                  @case ('synced') {
                    <mat-icon matTooltip="同期済み">check_circle</mat-icon>
                  }
                  @case ('error') {
                    <mat-icon [matTooltip]="resource.lastError || 'エラー'">error</mat-icon>
                  }
                  @case ('pending') {
                    <mat-icon matTooltip="未同期">schedule</mat-icon>
                  }
                  @default {
                    <mat-icon matTooltip="無効">block</mat-icon>
                  }
                }
              </div>

              <!-- Sync Button -->
              <button mat-icon-button
                      class="sync-button"
                      matTooltip="同期"
                      (click)="onSyncResource(resource); $event.stopPropagation()"
                      [disabled]="resource.syncStatus === 'syncing'">
                <mat-icon>refresh</mat-icon>
              </button>
            </div>
          }
        </div>

        <!-- Footer -->
        <div class="sidebar-footer">
          <a [routerLink]="['/context-hub', projectId]" class="manage-link">
            <mat-icon>settings</mat-icon>
            リソースを管理
          </a>
        </div>
      }
    </div>
  `,
  styles: [`
    .context-hub-sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      gap: 8px;
    }

    .header-icon {
      color: var(--primary-color, #7c4dff);
    }

    .header-title {
      flex: 1;
      font-weight: 500;
      font-size: 14px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 32px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
      color: var(--text-secondary, rgba(255, 255, 255, 0.6));
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }

    .add-link {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 16px;
      color: var(--primary-color, #7c4dff);
      text-decoration: none;
      font-size: 13px;
    }

    .add-link:hover {
      text-decoration: underline;
    }

    .resource-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .resource-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      gap: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .resource-item:hover {
      background-color: var(--hover-bg, rgba(255, 255, 255, 0.05));
    }

    .resource-item.selected {
      background-color: var(--selected-bg, rgba(124, 77, 255, 0.15));
    }

    .resource-item.disabled {
      opacity: 0.5;
    }

    .provider-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .provider-box { color: #0061d5; }
    .provider-gitlab { color: #fc6d26; }
    .provider-gitea { color: #609926; }
    .provider-mattermost { color: #0058cc; }
    .provider-confluence { color: #0052cc; }
    .provider-jira { color: #0052cc; }
    .provider-web { color: #4285f4; }
    .provider-local { color: #ffc107; }

    .resource-info {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .resource-label {
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .resource-meta {
      display: flex;
      gap: 8px;
      font-size: 11px;
      color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    }

    .sync-status {
      display: flex;
      align-items: center;
    }

    .sync-status mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .status-synced mat-icon { color: #4caf50; }
    .status-error mat-icon { color: #f44336; }
    .status-pending mat-icon { color: #ff9800; }
    .status-disabled mat-icon { color: #9e9e9e; }

    .sync-button {
      opacity: 0;
      transition: opacity 0.2s;
    }

    .resource-item:hover .sync-button {
      opacity: 1;
    }

    .sync-button mat-icon {
      font-size: 18px;
    }

    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    }

    .manage-link {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-secondary, rgba(255, 255, 255, 0.6));
      text-decoration: none;
      font-size: 13px;
    }

    .manage-link:hover {
      color: var(--text-primary, rgba(255, 255, 255, 0.87));
    }

    .manage-link mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `]
})
export class ContextHubSidebarComponent implements OnInit, OnChanges {
  private readonly contextHubService = inject(ContextHubService);

  @Input() projectId!: UUID;
  @Input() selectedResourceIds: string[] = [];

  @Output() selectionChange = new EventEmitter<ResourceSelectionChange>();
  @Output() resourceClick = new EventEmitter<ContextResourceForView>();

  hub: ContextHubForView | null = null;
  isLoading = false;
  isSyncing = false;

  ngOnInit(): void {
    this.loadHub();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectId'] && !changes['projectId'].firstChange) {
      this.loadHub();
    }
  }

  private loadHub(): void {
    if (!this.projectId) return;

    this.isLoading = true;
    this.contextHubService.getOrCreateHub(this.projectId).subscribe({
      next: (hub) => {
        this.hub = hub;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  isSelected(resourceId: string): boolean {
    return this.selectedResourceIds.includes(resourceId);
  }

  onSelectionChange(resource: ContextResourceForView, selected: boolean): void {
    this.selectionChange.emit({ resourceId: resource.id, selected });
  }

  onResourceClick(resource: ContextResourceForView): void {
    this.resourceClick.emit(resource);
  }

  onSyncResource(resource: ContextResourceForView): void {
    this.contextHubService.syncResource(resource.id).subscribe({
      next: () => this.loadHub(),
      error: () => this.loadHub()
    });
  }

  onSyncAll(): void {
    if (!this.projectId || this.isSyncing) return;

    this.isSyncing = true;
    this.contextHubService.syncAllResources(this.projectId).subscribe({
      next: (hub) => {
        this.hub = hub;
        this.isSyncing = false;
      },
      error: () => {
        this.isSyncing = false;
        this.loadHub();
      }
    });
  }

  getProviderIcon(type: ContextResourceProviderType): string {
    const iconMap: Record<ContextResourceProviderType, string> = {
      'box': 'cloud',
      'gitlab': 'code',
      'gitea': 'code',
      'mattermost': 'chat',
      'confluence': 'article',
      'jira': 'bug_report',
      'local': 'folder',
      'web': 'language',
    };
    return iconMap[type] || 'storage';
  }

  getProviderLabel(type: ContextResourceProviderType): string {
    const labelMap: Record<ContextResourceProviderType, string> = {
      'box': 'Box',
      'gitlab': 'GitLab',
      'gitea': 'Gitea',
      'mattermost': 'Mattermost',
      'confluence': 'Confluence',
      'jira': 'Jira',
      'local': 'ローカル',
      'web': 'Web',
    };
    return labelMap[type] || type;
  }
}
