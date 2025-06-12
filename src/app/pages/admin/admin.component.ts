import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterModule, ActivatedRoute, NavigationEnd } from '@angular/router'; // ActivatedRoute, NavigationEnd を追加
import { GService } from '../../services/g.service';
import { ScopeInfo, ScopeInfoForView } from '../../services/model-manager.service';
import { AdminScopeService } from '../../services/admin-scope.service';
import { UserRoleType } from '../../models/models';
import { AuthService, ScopeLabelsResponseItem } from '../../services/auth.service'; // ScopeLabelsResponse を削除
import { tap, filter, map, switchMap, takeUntil, Subject } from 'rxjs'; // filter, map, switchMap, takeUntil, Subject を追加
import { GroupByPipe } from '../../pipe/group-by.pipe';

interface MenuItem {
  link: string;
  icon: string;
  label: string;
  key: string;
  fullPath: string; // scopeを含めたフルパス
}
@Component({
  selector: 'app-admin',
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatButtonModule, MatFormFieldModule, MatSlideToggleModule, MatSelectModule, FormsModule,
    GroupByPipe,
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
  // scopeLabelMap: { [key: string]: string } = {}; // AdminScopeServiceから取得するため不要に
  baseMenuItems: Omit<MenuItem, 'fullPath' | 'link'>[] = [
    { icon: 'extension', label: 'AIプロバイダー', key: 'ai-provider-management' },
    { icon: 'extension', label: 'AIモデル', key: 'ai-model-management' },
    { icon: 'extension', label: 'API連携', key: 'ext-api-provider-form' },
    { icon: 'people', label: 'メンバー管理', key: 'member-management' },
    { icon: 'analytics', label: '利用状況', key: 'department' },
  ];
  menuItems: MenuItem[] = [];

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
        const scopeLabelMap = Object.fromEntries(
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
            label: scopeLabelMap[`${scope.scopeType}:${scope.scopeId}`] || '(未設定)'
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
      this.menuItems = this.baseMenuItems.map(item => ({
        ...item,
        link: item.key, // ルーターリンクはセクションキーのみ
        fullPath: `/admin/${scopePrefix}/${item.key}`
      }));
    }
  }

  private updateActiveSectionFromUrl() {
    const urlSegments = this.router.url.split('/');
    const adminIndex = urlSegments.indexOf('admin');
    if (adminIndex !== -1 && urlSegments.length > adminIndex + 3) {
      // URLが /admin/:scope/:section の形式であることを期待
      this.activeSection = urlSegments[adminIndex + 3];
    } else if (this.menuItems.length > 0) {
      // デフォルトのアクティブセクション (例: 最初のメニューアイテム)
      // this.activeSection = this.menuItems[0].key;
      // setActiveSectionを介してナビゲーションをトリガーしないように注意
    }
  }

  onScopeChange() {
    if (this.selectedScope) {
      this.adminScopeService.setSelectedScope(this.selectedScope);
      // スコープ変更時にURLを更新して、選択中のセクションを維持
      const currentSectionKey = this.activeSection || this.baseMenuItems[0]?.key;
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