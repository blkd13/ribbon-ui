import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ScopeInfo, ScopeType } from './model-manager.service';
import { GService } from './g.service';
import { UserRoleType } from '../models/models';
import { Router } from '@angular/router';

export interface UserScopeInfo extends ScopeInfo {
    isAdmin: boolean; // ユーザーがこのスコープでadmin権限を持っているか
}

@Injectable({
    providedIn: 'root'
})
export class AdminScopeService {
    private readonly g: GService = inject(GService);
    private readonly router: Router = inject(Router);
    private selectedScopeSubject = new BehaviorSubject<ScopeInfo | null>(null);

    // 現在選択されているスコープ
    selectedScope$: Observable<ScopeInfo | null> = this.selectedScopeSubject.asObservable();

    // スコープ優先順位の定義
    readonly SCOPE_PRIORITY: Record<ScopeType, number> = {
        [ScopeType.USER]: 10,
        [ScopeType.PROJECT]: 20,
        [ScopeType.TEAM]: 30,
        [ScopeType.DIVISION]: 40,
        [ScopeType.ORGANIZATION]: 50,
        [ScopeType.GLOBAL]: 60,
    };

    // ダミーのスコープラベルマップ（実際のAPIが来るまでの仮実装）
    private readonly SCOPE_LABELS_MAP: Record<string, string> = {
        'user:user1': 'John Doe',
        'user:user2': 'Jane Smith',
        'division:div1': 'Engineering Division',
        'division:div2': 'Sales Division',
        'organization:org1': 'ACME Corporation',
        'organization:org2': 'Tech Solutions Inc.',
        'global:system': 'Global System'
    };

    constructor() { }

    /**
     * スコープを設定する
     * @param scope 選択されたスコープ
     */
    setSelectedScope(scope: ScopeInfo | null): void {
        const current = this.selectedScopeSubject.value;
        if (!current && !scope) return;
        if (current && scope && current.scopeId === scope.scopeId && current.scopeType === scope.scopeType) return;
        this.selectedScopeSubject.next(scope);
    }

    /**
     * 現在選択されているスコープの同期的な値を取得する
     */
    get currentSelectedScopeValue(): ScopeInfo | null {
        return this.selectedScopeSubject.value;
    }

    /**
     * スコープの優先順位を取得する
     * @param scopeType スコープタイプ
     * @returns 優先順位の数値
     */
    public getScopePriority(scopeType: ScopeType): number {
        return this.SCOPE_PRIORITY[scopeType] || 0;
    }

    /**
     * スコープタイプが有効かどうかをチェック
     * @param scopeType チェックするスコープタイプ文字列
     * @returns 有効な ScopeType であれば true
     */
    public isValidScopeType(scopeType: string): scopeType is ScopeType {
        return Object.values(ScopeType).includes(scopeType as ScopeType);
    }

    /**
     * URLパラメータからスコープを復元する
     * @param scopeParam URL内のスコープパラメータ（例: "global:system"）
     * @returns 復元されたScopeInfo、または解析失敗時はnull
     */
    restoreScopeFromUrl(scopeParam: string): ScopeInfo | null {
        try {
            const [scopeType, scopeId] = scopeParam.split(':');
            if (this.isValidScopeType(scopeType) && scopeId) {
                const scope: ScopeInfo = {
                    scopeType: scopeType as ScopeType,
                    scopeId: scopeId
                };
                this.selectedScopeSubject.next(scope);
                return scope;
            }
        } catch (error) {
            console.warn('Failed to parse scope from URL:', scopeParam, error);
        }
        return null;
    }

    /**
     * スコープをURL形式の文字列に変換
     * @param scope 変換するスコープ
     * @returns URL形式のスコープ文字列（例: "global:system"）
     */
    scopeToUrlParam(scope: ScopeInfo): string {
        return `${scope.scopeType}/${scope.scopeId}`;
    }

    /**
     * 現在選択されているスコープを取得する
     * @returns 現在のスコープまたはnull
     */
    getCurrentScope(): ScopeInfo | null {
        return this.selectedScopeSubject.value;
    }

    /**
     * スコープのラベルを取得
     */
    getScopeLabel(scopeType: ScopeType, scopeId: string): string {
        const key = `${scopeType}:${scopeId}`;
        return this.SCOPE_LABELS_MAP[key] || `${scopeType}:${scopeId}`;
    }

    /**
     * アイテムリストから最優先のものを取得
     */
    getEffectiveItems<T extends { name?: string; scopeInfo: ScopeInfo }>(items: T[]): T[] {
        // 名前でグループ化
        const groupedByName = items.reduce((groups, item) => {
            const key = item.name || 'unnamed';
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(item);
            return groups;
        }, {} as Record<string, T[]>);

        // 各グループから最優先のものを選択
        const effectiveItems: T[] = [];
        Object.values(groupedByName).forEach(group => {
            const mostPriorityItem = group.reduce((prev, current) => {
                const prevPriority = this.getScopePriority(prev.scopeInfo.scopeType);
                const currentPriority = this.getScopePriority(current.scopeInfo.scopeType);
                return currentPriority < prevPriority ? current : prev;
            });
            effectiveItems.push(mostPriorityItem);
        });

        return effectiveItems;
    }
    /**
     * ユーザーがスコープで編集権限を持っているかチェック
     * 
     * 権限ルール:
     * - Division作成: Organization Admin/Maintainer権限が必要
     * - Division更新: 対象Division Admin/Maintainer権限が必要  
     * - User Role管理: 対象Division Admin/Maintainer権限が必要
     * 
     * @param scopeType 対象スコープタイプ
     * @param scopeId 対象スコープID
     * @returns 編集権限があるかどうか
     */
    canEditScope(scopeType: ScopeType, scopeId: string): boolean {
        const currentUser = this.g.info.user;
        if (!currentUser || !currentUser.roleList) {
            return false;
        }

        // Division作成の場合 - Organization Admin/Maintainer権限が必要
        if (scopeType === ScopeType.DIVISION) {
            // 既存のDivision更新の場合、対象Division Admin/Maintainer権限をチェック
            const divisionRoles = currentUser.roleList.filter(role =>
                role.scopeInfo.scopeType === ScopeType.DIVISION &&
                role.scopeInfo.scopeId === scopeId &&
                [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
            );

            if (divisionRoles.length > 0) {
                return true;
            }

            // Division作成の場合（scopeIdが空またはnew）、Organization Admin/Maintainer権限をチェック
            if (!scopeId || scopeId === 'new') {
                const orgRoles = currentUser.roleList.filter(role =>
                    role.scopeInfo.scopeType === ScopeType.ORGANIZATION &&
                    [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
                );
                return orgRoles.length > 0;
            }

            return false;
        }

        // Organization管理の場合 - Organization Admin/Maintainer権限が必要
        if (scopeType === ScopeType.ORGANIZATION) {
            const orgRoles = currentUser.roleList.filter(role =>
                role.scopeInfo.scopeType === ScopeType.ORGANIZATION &&
                role.scopeInfo.scopeId === scopeId &&
                [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
            );
            return orgRoles.length > 0;
        }

        // User管理の場合 - 関連するDivision Admin/Maintainer権限をチェック
        if (scopeType === ScopeType.USER) {
            // ユーザー自身の管理は許可
            if (scopeId === currentUser.id) {
                return true;
            }

            // Division Admin/Maintainer権限があるかチェック
            const divisionAdminRoles = currentUser.roleList.filter(role =>
                role.scopeInfo.scopeType === ScopeType.DIVISION &&
                [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
            );
            return divisionAdminRoles.length > 0;
        }

        // その他のスコープタイプの場合、基本的には対象スコープのAdmin/Maintainer権限が必要
        const targetRoles = currentUser.roleList.filter(role =>
            role.scopeInfo.scopeType === scopeType &&
            role.scopeInfo.scopeId === scopeId &&
            [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
        );

        return targetRoles.length > 0;
    }

    /**
     * ユーザーが指定されたDivisionでユーザーロール管理権限を持っているかチェック
     * 
     * @param divisionId 対象DivisionのID
     * @returns ユーザーロール管理権限があるかどうか
     */
    canManageUserRoles(divisionId: string): boolean {
        const currentUser = this.g.info.user;
        if (!currentUser || !currentUser.roleList) {
            return false;
        }

        // 対象Division Admin/Maintainer権限をチェック
        const divisionRoles = currentUser.roleList.filter(role =>
            role.scopeInfo.scopeType === ScopeType.DIVISION &&
            role.scopeInfo.scopeId === divisionId &&
            [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
        );

        return divisionRoles.length > 0;
    }

    /**
     * ユーザーがDivision作成権限を持っているかチェック
     * 
     * @returns Division作成権限があるかどうか
     */
    canCreateDivision(): boolean {
        const currentUser = this.g.info.user;
        if (!currentUser || !currentUser.roleList) {
            return false;
        }

        // Organization Admin/Maintainer権限をチェック
        const orgRoles = currentUser.roleList.filter(role =>
            role.scopeInfo.scopeType === ScopeType.ORGANIZATION &&
            [UserRoleType.Admin, UserRoleType.Maintainer].includes(role.role)
        );

        return orgRoles.length > 0;
    }
}
