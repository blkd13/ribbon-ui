import { CommonModule } from '@angular/common';
import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ScopeInfo, ScopeType } from '../../services/model-manager.service';
import { AdminScopeService } from '../../services/admin-scope.service';

export interface ScopeHierarchyItem {
  scope: ScopeInfo;
  label: string;
  icon: string;
  isCurrent: boolean;
}

@Component({
  selector: 'app-admin-scope-breadcrumb',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="scope-breadcrumb">
      <div class="breadcrumb-items">
        @for (item of hierarchyItems; track item.scope.scopeId; let last = $last) {
          <div class="breadcrumb-item" [class.current]="item.isCurrent">
            <mat-icon class="scope-icon">{{ item.icon }}</mat-icon>
            <span class="scope-label">{{ item.label }}</span>
            @if (!last) {
              <mat-icon class="separator">chevron_right</mat-icon>
            }
          </div>
        }
      </div>
      @if (showChangeButton) {
        <button mat-icon-button
                class="change-scope-btn"
                (click)="onChangeScope()"
                matTooltip="スコープを変更">
          <mat-icon>swap_horiz</mat-icon>
        </button>
      }
    </div>
  `,
  styles: [`
    .scope-breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .breadcrumb-items {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }

    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 4px;
      color: #888;
      font-size: 13px;
      transition: all 0.2s ease;

      &.current {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
        font-weight: 500;
      }

      .scope-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      .separator {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #555;
        margin: 0 2px;
      }
    }

    .change-scope-btn {
      margin-left: auto;
      color: #888;

      &:hover {
        color: #3b82f6;
      }
    }
  `]
})
export class AdminScopeBreadcrumbComponent {
  private readonly adminScopeService = inject(AdminScopeService);

  @Input() currentScope: ScopeInfo | null = null;
  @Input() scopeLabelsMap: Record<string, string> = {};
  @Input() showChangeButton = true;
  @Output() changeScopeClick = new EventEmitter<void>();

  get hierarchyItems(): ScopeHierarchyItem[] {
    if (!this.currentScope) return [];

    const items: ScopeHierarchyItem[] = [];

    // スコープ階層を構築（上位から下位へ）
    const scopeOrder: ScopeType[] = [
      ScopeType.GLOBAL,
      ScopeType.ORGANIZATION,
      ScopeType.DIVISION,
      ScopeType.TEAM,
      ScopeType.PROJECT,
      ScopeType.USER
    ];

    const currentPriority = this.adminScopeService.getScopePriority(this.currentScope.scopeType);

    // 現在のスコープより上位のスコープを追加（簡略表示）
    for (const scopeType of scopeOrder) {
      const priority = this.adminScopeService.getScopePriority(scopeType);

      if (priority > currentPriority) {
        // 上位スコープは省略表示
        items.push({
          scope: { scopeType, scopeId: 'inherited' },
          label: this.getScopeTypeLabel(scopeType),
          icon: this.getScopeIcon(scopeType),
          isCurrent: false
        });
      } else if (priority === currentPriority) {
        // 現在のスコープ
        items.push({
          scope: this.currentScope,
          label: this.getScopeLabel(this.currentScope),
          icon: this.getScopeIcon(this.currentScope.scopeType),
          isCurrent: true
        });
        break;
      }
    }

    return items;
  }

  private getScopeLabel(scope: ScopeInfo): string {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    return this.scopeLabelsMap[key] || scope.scopeId;
  }

  private getScopeTypeLabel(scopeType: ScopeType): string {
    const labels: Record<ScopeType, string> = {
      [ScopeType.GLOBAL]: 'システム',
      [ScopeType.ORGANIZATION]: '組織',
      [ScopeType.DIVISION]: '部門',
      [ScopeType.TEAM]: 'チーム',
      [ScopeType.PROJECT]: 'プロジェクト',
      [ScopeType.USER]: 'ユーザー'
    };
    return labels[scopeType] || scopeType;
  }

  private getScopeIcon(scopeType: ScopeType): string {
    const icons: Record<ScopeType, string> = {
      [ScopeType.GLOBAL]: 'public',
      [ScopeType.ORGANIZATION]: 'business',
      [ScopeType.DIVISION]: 'account_tree',
      [ScopeType.TEAM]: 'groups',
      [ScopeType.PROJECT]: 'folder',
      [ScopeType.USER]: 'person'
    };
    return icons[scopeType] || 'folder';
  }

  onChangeScope(): void {
    this.changeScopeClick.emit();
  }
}
