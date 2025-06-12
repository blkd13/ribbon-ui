// admin-scope.service.ts - Enhanced version with generic methods

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
     * @param scopeTypeParam スコープタイプ（例: "division"）
     * @param scopeIdParam スコープID（例: "div1"）
     * @returns 復元されたScopeInfo、または解析失敗時はnull
     */
    restoreScopeFromUrl(scopeTypeParam: string, scopeIdParam: string): ScopeInfo | null {
        try {
            if (this.isValidScopeType(scopeTypeParam) && scopeIdParam) {
                const scope: ScopeInfo = {
                    scopeType: scopeTypeParam as ScopeType,
                    scopeId: scopeIdParam
                };

                this.selectedScopeSubject.next(scope);
                return scope;
            }
        } catch (error) {
            console.warn('Failed to parse scope from URL:', { scopeTypeParam, scopeIdParam }, error);
        }
        return null;
    }

    /**
     * スコープをURL形式の文字列に変換
     * @param scope 変換するスコープ
     * @returns URL形式のスコープ文字列（例: "division/div1"）
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
     * 汎用版 - AI Provider、AI Model両方で使用可能
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
     * ユーザーが表示可能なアイテム一覧を取得
     * 汎用版 - AI Provider、AI Model両方で使用可能
     * スコープの継承ルールに基づいてフィルタリング
     * 
     * @param allItems 全てのアイテム一覧
     * @returns 表示可能なアイテム一覧
     */
    getVisibleItems<T extends { scopeInfo: ScopeInfo }>(allItems: T[]): T[] {
        const currentScope = this.getCurrentScope();
        if (!currentScope) {
            return [];
        }

        const currentScopePriority = this.getScopePriority(currentScope.scopeType);

        // 現在選択されているスコープの優先順位以下（数字が大きい）のアイテムのみを表示
        // 優先順位が同じ場合は、IDが一致するもののみを表示
        return allItems.filter(item => {
            const itemPriority = this.getScopePriority(item.scopeInfo.scopeType);

            return itemPriority > currentScopePriority ||
                (itemPriority === currentScopePriority &&
                    item.scopeInfo.scopeId === currentScope.scopeId);
        });
    }

    /**
     * ユーザーが表示可能なAI Provider一覧を取得
     * 後方互換性のために残す
     * 
     * @param allProviders 全てのAI Provider一覧
     * @returns 表示可能なAI Provider一覧
     */
    getVisibleProviders<T extends { scopeInfo: ScopeInfo }>(allProviders: T[]): T[] {
        return this.getVisibleItems(allProviders);
    }

    /**
     * ユーザーが表示可能なAI Model一覧を取得
     * 
     * @param allModels 全てのAI Model一覧
     * @returns 表示可能なAI Model一覧
     */
    getVisibleModels<T extends { scopeInfo: ScopeInfo }>(allModels: T[]): T[] {
        return this.getVisibleItems(allModels);
    }

    /**
     * ユーザーがスコープで編集権限を持っているかチェック
     * 
     * 修正版: 各スコープは独立しており、そのスコープでの権限が必要
     * 
     * 権限ルール:
     * - Organization Scope: そのOrganizationのAdmin/SuperAdmin権限が必要
     * - Division Scope: そのDivisionのAdmin/SuperAdmin権限が必要  
     * - User Scope: 本人か、そのユーザーが所属するDivisionのAdmin/SuperAdmin権限が必要
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

        switch (scopeType) {
            case ScopeType.ORGANIZATION:
                return this.hasSpecificScopePermission(
                    currentUser.roleList,
                    ScopeType.ORGANIZATION,
                    scopeId,
                    [UserRoleType.Admin, UserRoleType.SuperAdmin]
                );

            case ScopeType.DIVISION:
                // Division作成の場合（scopeIdが空またはnew）
                if (!scopeId || scopeId === 'new') {
                    // Organization Admin/SuperAdmin権限が必要
                    return this.hasAnyScopePermission(
                        currentUser.roleList,
                        ScopeType.ORGANIZATION,
                        [UserRoleType.Admin, UserRoleType.SuperAdmin]
                    );
                }
                // 既存のDivision更新の場合、そのDivisionのAdmin/SuperAdmin権限が必要
                return this.hasSpecificScopePermission(
                    currentUser.roleList,
                    ScopeType.DIVISION,
                    scopeId,
                    [UserRoleType.Admin, UserRoleType.SuperAdmin]
                );

            case ScopeType.USER:
                // ユーザー自身の管理は許可
                if (scopeId === currentUser.id) {
                    return true;
                }

                // TODO: ユーザーが所属するDivisionの情報が必要
                // 現在は実装されていないため、全てのDivision Admin権限をチェック
                // 実際の実装では、対象ユーザーが所属するDivisionを特定し、
                // そのDivisionのAdmin/SuperAdmin権限をチェックするべき
                return this.hasAnyScopePermission(
                    currentUser.roleList,
                    ScopeType.DIVISION,
                    [UserRoleType.Admin, UserRoleType.SuperAdmin]
                );

            case ScopeType.PROJECT:
            case ScopeType.TEAM:
            case ScopeType.GLOBAL:
                // その他のスコープは、そのスコープのAdmin/SuperAdmin権限が必要
                return this.hasSpecificScopePermission(
                    currentUser.roleList,
                    scopeType,
                    scopeId,
                    [UserRoleType.Admin, UserRoleType.SuperAdmin]
                );

            default:
                return false;
        }
    }

    /**
     * 特定のスコープとIDに対する権限をチェック
     * @param roleList ユーザーのロール一覧
     * @param scopeType チェックするスコープタイプ
     * @param scopeId チェックするスコープID
     * @param requiredRoles 必要なロール一覧
     * @returns 権限があるかどうか
     */
    private hasSpecificScopePermission(
        roleList: any[],
        scopeType: ScopeType,
        scopeId: string,
        requiredRoles: UserRoleType[]
    ): boolean {
        return roleList.some(role =>
            role.scopeInfo.scopeType === scopeType &&
            role.scopeInfo.scopeId === scopeId &&
            requiredRoles.includes(role.role)
        );
    }

    /**
     * 特定のスコープタイプに対する任意の権限をチェック（スコープIDは問わない）
     * @param roleList ユーザーのロール一覧
     * @param scopeType チェックするスコープタイプ
     * @param requiredRoles 必要なロール一覧
     * @returns 権限があるかどうか
     */
    private hasAnyScopePermission(
        roleList: any[],
        scopeType: ScopeType,
        requiredRoles: UserRoleType[]
    ): boolean {
        return roleList.some(role =>
            role.scopeInfo.scopeType === scopeType &&
            requiredRoles.includes(role.role)
        );
    }

    /**
     * ユーザーが指定されたDivisionでユーザーロール管理権限を持っているかチェック
     * 現在選択されているスコープの情報も考慮に入れる
     * 
     * @param divisionId 対象DivisionのID
     * @returns ユーザーロール管理権限があるかどうか
     */
    canManageUserRoles(divisionId: string): boolean {
        const currentUser = this.g.info.user;
        if (!currentUser || !currentUser.roleList) {
            return false;
        }

        // 現在選択されているスコープの情報を考慮
        const currentScope = this.getCurrentScope();

        // 現在選択されているスコープが該当するDivisionでない場合は権限なし
        if (!currentScope || currentScope.scopeType !== ScopeType.DIVISION || currentScope.scopeId !== divisionId) {
            return false;
        }

        // 対象Division Admin/SuperAdmin権限をチェック
        return this.hasSpecificScopePermission(
            currentUser.roleList,
            ScopeType.DIVISION,
            divisionId,
            [UserRoleType.Admin, UserRoleType.SuperAdmin]
        );
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

        // Organization Admin/SuperAdmin権限をチェック
        return this.hasAnyScopePermission(
            currentUser.roleList,
            ScopeType.ORGANIZATION,
            [UserRoleType.Admin, UserRoleType.SuperAdmin]
        );
    }

    /**
     * 新しいAI Providerを作成する権限があるかチェック
     * 現在選択されているスコープに基づいて判定
     * 
     * @returns 作成権限があるかどうか
     */
    canCreateAIProvider(): boolean {
        const currentScope = this.getCurrentScope();
        if (!currentScope) {
            return false;
        }

        return this.canEditScope(currentScope.scopeType, currentScope.scopeId);
    }

    /**
     * 新しいAI Modelを作成する権限があるかチェック
     * AI Providerと同じ権限を使用
     * 
     * @returns 作成権限があるかどうか
     */
    canCreateAIModel(): boolean {
        return this.canCreateAIProvider();
    }

    /**
     * ユーザーが編集可能なスコープ一覧を取得
     * UI でスコープ選択肢を表示する際に使用
     * 
     * @returns 編集可能なスコープ情報の配列
     */
    getEditableScopes(): ScopeInfo[] {
        const currentUser = this.g.info.user;
        if (!currentUser || !currentUser.roleList) {
            return [];
        }

        const editableScopes: ScopeInfo[] = [];

        // ユーザーのロール一覧から編集可能なスコープを抽出
        currentUser.roleList.forEach(role => {
            if ([UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role)) {
                const scope: ScopeInfo = {
                    scopeType: role.scopeInfo.scopeType,
                    scopeId: role.scopeInfo.scopeId
                };

                // 重複を避けるためにチェック
                const exists = editableScopes.some(existingScope =>
                    existingScope.scopeType === scope.scopeType &&
                    existingScope.scopeId === scope.scopeId
                );

                if (!exists) {
                    editableScopes.push(scope);
                }
            }
        });

        return editableScopes;
    }
}