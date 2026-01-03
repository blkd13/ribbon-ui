import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router'; // ActivatedRoute, NavigationEnd を追加
import { TranslateModule } from '@ngx-translate/core';
import { filter, map, Subject, switchMap, takeUntil, tap } from 'rxjs'; // filter, map, switchMap, takeUntil, Subject を追加
import { UserRoleType } from '../../models/models';
import { AppMenuComponent } from "../../parts/app-menu/app-menu.component";
import { AdminScopeBreadcrumbComponent } from "../../parts/admin-scope-breadcrumb/admin-scope-breadcrumb.component";
import { GroupByPipe } from '../../pipe/group-by.pipe';
import { AdminScopeService } from '../../services/admin-scope.service';
import { AuthService, ScopeLabelsResponseItem } from '../../services/auth.service';
import { GService } from '../../services/g.service';
import { ScopeInfo, ScopeInfoForView } from '../../services/model-manager.service';

interface MenuItem {
  link: string;
  icon: string;
  label: string;
  key: string;
  fullPath: string; // scopeを含めたフルパス
}

interface MenuGroup {
  label: string;
  icon: string;
  items: MenuItem[];
}

interface BaseMenuItem {
  icon: string;
  label: string;
  key: string;
}

interface BaseMenuGroup {
  label: string;
  icon: string;
  items: Omit<BaseMenuItem, never>[];
}
@Component({
  selector: 'app-admin',
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatButtonModule, MatFormFieldModule, MatSlideToggleModule, MatSelectModule, FormsModule,
    GroupByPipe,
    AppMenuComponent,
    AdminScopeBreadcrumbComponent,
    TranslateModule
],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, OnDestroy {
  readonly g: GService = inject(GService);
  private readonly authService = inject(AuthService);
  readonly adminScopeService: AdminScopeService = inject(AdminScopeService); // public に変更
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  activeSection = ''; // 初期値を空に
  selectedScope: ScopeInfoForView | null = null;
  availableScopes: ScopeInfoForView[] = [];
  scopeLabelsMap: Record<string, string> = {}; // ブレッドクラム用
  // グループ化されたメニュー構造
  baseMenuGroups: BaseMenuGroup[] = [
    {
      label: 'AI設定',
      icon: 'smart_toy',
      items: [
        { icon: 'hub', label: 'プロバイダー', key: 'ai-provider-management' },
        { icon: 'psychology', label: 'モデル', key: 'ai-model-management' },
      ]
    },
    {
      label: '外部連携',
      icon: 'sync_alt',
      items: [
        { icon: 'api', label: '連携設定', key: 'ext-api-provider-form' },
        { icon: 'description', label: 'テンプレート', key: 'ext-api-provider-template-form' },
      ]
    },
    {
      label: 'メンバー',
      icon: 'people',
      items: [
        { icon: 'manage_accounts', label: 'メンバー管理', key: 'member-management' },
      ]
    },
    {
      label: 'ダッシュボード',
      icon: 'dashboard',
      items: [
        { icon: 'analytics', label: '利用状況', key: 'department' },
      ]
    },
  ];
  menuGroups: MenuGroup[] = [];

  constructor() { // constructor を追加
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.route.firstChild?.snapshot.paramMap.get('scope')),
      filter(scopeParam => !!scopeParam),
      takeUntil(this.destroy$)
    ).subscribe(scopeParam => {
      if (scopeParam) {
        this.updateActiveSectionFromUrl();
      }
    });
  }

  ngOnInit() {
    this.adminScopeService.selectedScope$.pipe(
      takeUntil(this.destroy$),
      tap(scope => {
        if (scope) {
          this.selectedScope = scope as ScopeInfoForView; // AdminScopeServiceがScopeInfoForViewを保証する前提
          this.updateMenuItems();
          this.updateActiveSectionFromUrl(); // スコープ変更時にもアクティブセクションを更新
        }
      }),
      // availableScopesの初期化はAdminScopeService側で行われるか、Guardで解決される前提
      // ここではselectedScopeの変更に基づいてUIを更新する
      switchMap(() => this.authService.getScopeLabels()),
      tap(labels => {
        this.scopeLabelsMap = Object.fromEntries(
          (Object.entries(labels.scopeLabels) as Array<[keyof typeof labels.scopeLabels, ScopeLabelsResponseItem[]]>)
            .filter(([_, value]) => value && value.length > 0)
            .flatMap(([key, value]) => value.map(item => [`${key}:${item.id}`, item.label]))
        );
        // ユーザーの管理者ロールからスコープ一覧を作成（同じscopeの重複は除去）
        this.availableScopes = this.g.info.user.roleList
          .filter(role => [UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role))
          .map(role => role.scopeInfo)
          .filter((scope, index, self) =>
            index === self.findIndex(s => s.scopeId === scope.scopeId && s.scopeType === scope.scopeType)
          )
          .sort((a, b) => {
            // スコープタイプで優先順位をつけて、同じタイプなら名前でソート
            const priorityA = this.adminScopeService.getScopePriority(a.scopeType);
            const priorityB = this.adminScopeService.getScopePriority(b.scopeType);
            if (priorityA !== priorityB) {
              return priorityB - priorityA;
            }
            return a.scopeId.localeCompare(b.scopeId);
          })
          .map(scope => ({
            ...scope,
            label: this.scopeLabelsMap[`${scope.scopeType}:${scope.scopeId}`] || '(未設定)'
          })) || [];

        // GuardによってselectedScopeが設定されているはずなので、ここでのデフォルト設定は不要
        // ただし、万が一selectedScopeがnullの場合は最初のものを選択するフォールバックはあっても良い
        if (!this.selectedScope && this.availableScopes.length > 0) {
          this.selectedScope = this.availableScopes[0];
          this.adminScopeService.setSelectedScope(this.selectedScope); // Guardと競合しないように注意
          this.updateMenuItems();
        }
      })
    ).subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateMenuItems() {
    if (this.selectedScope) {
      const scopePrefix = this.adminScopeService.scopeToUrlParam(this.selectedScope);
      this.menuGroups = this.baseMenuGroups.map(group => ({
        label: group.label,
        icon: group.icon,
        items: group.items.map(item => ({
          ...item,
          link: item.key,
          fullPath: `/admin/${scopePrefix}/${item.key}`
        }))
      }));
    }
  }

  private updateActiveSectionFromUrl() {
    const urlSegments = this.router.url.split('/');
    const adminIndex = urlSegments.indexOf('admin');
    if (adminIndex !== -1 && urlSegments.length > adminIndex + 3) {
      // URLが /admin/:scope/:section の形式であることを期待
      this.activeSection = urlSegments[adminIndex + 3];
    } else if (this.menuGroups.length > 0 && this.menuGroups[0].items.length > 0) {
      // デフォルトのアクティブセクション (例: 最初のメニューアイテム)
      // this.activeSection = this.menuGroups[0].items[0].key;
      // setActiveSectionを介してナビゲーションをトリガーしないように注意
    }
  }

  onScopeChange() {
    if (this.selectedScope) {
      this.adminScopeService.setSelectedScope(this.selectedScope);
      // スコープ変更時にURLを更新して、選択中のセクションを維持
      const currentSectionKey = this.activeSection || this.baseMenuGroups[0]?.items[0]?.key;
      if (currentSectionKey) {
        const scopeUrlParam = this.adminScopeService.scopeToUrlParam(this.selectedScope);
        const scopePathParts = scopeUrlParam.split('/');

        // スコープを含めたフルパスでナビゲーション
        this.router.navigate(['/admin', ...scopePathParts, currentSectionKey]);
      }
      this.updateMenuItems(); // メニューのリンクも更新
    }
  }

  // getScopeDisplayName は admin.component.html で使われていない場合は削除可能
  getScopeDisplayName(scope: ScopeInfo): string {
    return `${scope.scopeType}: ${scope.scopeId}`;
  }

  compareScopeInfo(scope1: ScopeInfo, scope2: ScopeInfo): boolean {
    return scope1 && scope2 && scope1.scopeType === scope2.scopeType && scope1.scopeId === scope2.scopeId;
  }
}