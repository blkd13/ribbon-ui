import { Injectable, inject } from '@angular/core';
import { GService } from './g.service';
import { ScopeInfo, ScopeType } from './model-manager.service';
import { UserRoleType } from '../models/models';

export interface UserRoleContext {
  userId: string;
  divisionId: string;
  currentRoles: UserRoleType[];
  isActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UserRolePermissionService {
  private readonly g: GService = inject(GService);

  // ロールの階層定義（数字が小さいほど高い権限）
  private readonly ROLE_HIERARCHY: Record<UserRoleType, number> = {
    // [UserRoleType.SysAdmin]: 10,
    // [UserRoleType.BizAdmin]: 20,
    // [UserRoleType.Owner]: 30,
    [UserRoleType.SuperAdmin]: 10,
    [UserRoleType.Admin]: 20,
    [UserRoleType.MemberManager]: 30,
    [UserRoleType.AIManager]: 40,
    [UserRoleType.APIManager]: 40,
    [UserRoleType.Auditor]: 40,
    [UserRoleType.User]: 60,
    // [UserRoleType.Member]: 70,
    // [UserRoleType.Viewer]: 80,
    // [UserRoleType.Guest]: 90,
  };

  /**
   * ユーザーが特定のDivisionでユーザーロール管理権限を持っているかチェック
   * 
   * @param divisionId 対象DivisionのID
   * @returns ユーザーロール管理権限があるかどうか
   */
  canManageUserRoles(divisionId: string): boolean {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return false;
    }

    // 対象DivisionでAdmin/SuperAdmin権限を持っているかチェック
    const divisionRoles = currentUser.roleList.filter(role =>
      role.scopeInfo.scopeType === ScopeType.DIVISION &&
      role.scopeInfo.scopeId === divisionId &&
      [UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role)
    );

    return divisionRoles.length > 0;
  }

  /**
   * 特定のユーザーのロールを編集できるかチェック
   * 
   * @param targetUser 編集対象のユーザー情報
   * @param divisionId 対象Division ID
   * @returns 編集権限があるかどうか
   */
  canEditUserRole(targetUser: UserRoleContext, divisionId: string): boolean {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return false;
    }

    // 1. 自分自身のロールは編集不可
    if (targetUser.userId === currentUser.id) {
      return false;
    }

    // 2. Division管理権限があるかチェック
    if (!this.canManageUserRoles(divisionId)) {
      return false;
    }

    // 3. 対象ユーザーが同じDivisionに属しているかチェック
    if (targetUser.divisionId !== divisionId) {
      return false;
    }

    // 4. 現在のユーザーの最高権限レベルを取得
    const currentUserMaxAuthority = this.getCurrentUserMaxAuthority(divisionId);
    if (currentUserMaxAuthority === null) {
      return false;
    }

    // 5. 対象ユーザーの最高権限レベルを取得
    const targetUserMaxAuthority = this.getMaxAuthorityLevel(targetUser.currentRoles);

    // 6. 自分より高い権限または同等の権限を持つユーザーは編集不可
    return currentUserMaxAuthority < targetUserMaxAuthority;
  }

  /**
   * 特定のロールを割り当てることができるかチェック
   * 
   * @param targetUserId 対象ユーザーID
   * @param newRole 割り当てたいロール
   * @param divisionId 対象Division ID
   * @returns 割り当て権限があるかどうか
   */
  canAssignRole(targetUserId: string, newRole: UserRoleType, divisionId: string): boolean {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return false;
    }

    // 1. 自分自身には割り当て不可
    if (targetUserId === currentUser.id) {
      return false;
    }

    // 2. Division管理権限があるかチェック
    if (!this.canManageUserRoles(divisionId)) {
      return false;
    }

    // 3. 現在のユーザーの最高権限レベルを取得
    const currentUserMaxAuthority = this.getCurrentUserMaxAuthority(divisionId);
    if (currentUserMaxAuthority === null) {
      return false;
    }

    // 4. 割り当てたいロールの権限レベルを取得
    const newRoleAuthority = this.ROLE_HIERARCHY[newRole];

    // 5. 自分より高い権限は割り当て不可
    // 同等権限の場合も割り当て不可（Admin同士でのAdmin権限付与を防ぐ）
    return currentUserMaxAuthority < newRoleAuthority;
  }

  /**
   * ユーザーを特定のDivisionから削除できるかチェック
   * 
   * @param targetUser 削除対象のユーザー情報
   * @param divisionId 対象Division ID
   * @returns 削除権限があるかどうか
   */
  canRemoveUserFromDivision(targetUser: UserRoleContext, divisionId: string): boolean {
    const currentUser = this.g.info.user;
    if (!currentUser) {
      return false;
    }

    // 1. 自分自身は削除不可
    if (targetUser.userId === currentUser.id) {
      return false;
    }

    // 2. Division管理権限があるかチェック
    if (!this.canManageUserRoles(divisionId)) {
      return false;
    }

    // 3. 権限レベルチェック（編集権限と同じロジック）
    return this.canEditUserRole(targetUser, divisionId);
  }

  /**
   * Division作成権限があるかチェック
   * 
   * @returns Division作成権限があるかどうか
   */
  canCreateDivision(): boolean {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return false;
    }

    // Organization Admin/SuperAdmin権限をチェック
    const orgRoles = currentUser.roleList.filter(role =>
      role.scopeInfo.scopeType === ScopeType.ORGANIZATION &&
      [UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role)
    );

    return orgRoles.length > 0;
  }

  /**
   * Division更新権限があるかチェック
   * 
   * @param divisionId 対象Division ID
   * @returns Division更新権限があるかどうか
   */
  canUpdateDivision(divisionId: string): boolean {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return false;
    }

    // そのDivisionのAdmin/SuperAdmin権限をチェック
    const divisionRoles = currentUser.roleList.filter(role =>
      role.scopeInfo.scopeType === ScopeType.DIVISION &&
      role.scopeInfo.scopeId === divisionId &&
      [UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role)
    );

    return divisionRoles.length > 0;
  }

  /**
   * 指定されたDivisionで現在のユーザーが割り当て可能なロール一覧を取得
   * 
   * @param divisionId 対象Division ID
   * @returns 割り当て可能なロール一覧
   */
  getAssignableRoles(divisionId: string): UserRoleType[] {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return [];
    }

    // Division管理権限がない場合は空配列
    if (!this.canManageUserRoles(divisionId)) {
      return [];
    }

    const currentUserMaxAuthority = this.getCurrentUserMaxAuthority(divisionId);
    if (currentUserMaxAuthority === null) {
      return [];
    }

    // 自分より低い権限のロールのみ返す
    return Object.entries(this.ROLE_HIERARCHY)
      .filter(([_, authority]) => authority > currentUserMaxAuthority)
      .map(([role, _]) => role as UserRoleType)
      .filter(role => this.isDivisionScopeRole(role)); // Division レベルで有効なロールのみ
  }

  /**
   * 現在のユーザーの指定Divisionでの最高権限レベルを取得
   * 
   * @param divisionId Division ID
   * @returns 最高権限レベル（数字が小さいほど高権限）、権限がない場合はnull
   */
  private getCurrentUserMaxAuthority(divisionId: string): number | null {
    const currentUser = this.g.info.user;
    if (!currentUser || !currentUser.roleList) {
      return null;
    }

    const divisionRoles = currentUser.roleList
      .filter(role =>
        role.scopeInfo.scopeType === ScopeType.DIVISION &&
        role.scopeInfo.scopeId === divisionId
      )
      .map(role => role.role);

    if (divisionRoles.length === 0) {
      return null;
    }

    return this.getMaxAuthorityLevel(divisionRoles);
  }

  /**
   * ロール一覧から最高権限レベルを取得
   * 
   * @param roles ロール一覧
   * @returns 最高権限レベル（数字が小さいほど高権限）
   */
  private getMaxAuthorityLevel(roles: UserRoleType[]): number {
    return Math.min(...roles.map(role => this.ROLE_HIERARCHY[role] || 999));
  }

  /**
   * 指定されたロールがDivisionスコープで有効かチェック
   * 
   * @param role チェックするロール
   * @returns Divisionスコープで有効かどうか
   */
  private isDivisionScopeRole(role: UserRoleType): boolean {
    // SysAdmin, BizAdminなどはOrganization/Globalスコープなので除外
    const divisionValidRoles: UserRoleType[] = [
      UserRoleType.Admin,
      UserRoleType.SuperAdmin,
      UserRoleType.User,
      UserRoleType.MemberManager,
      UserRoleType.AIManager,
      UserRoleType.APIManager,
      UserRoleType.Auditor,
      // UserRoleType.Member,
      // UserRoleType.Viewer,
      // UserRoleType.Guest
    ];

    return divisionValidRoles.includes(role);
  }

  /**
   * ユーザーの権限変更履歴をログに記録するためのメタデータを生成
   * 
   * @param targetUserId 対象ユーザーID
   * @param oldRoles 変更前のロール
   * @param newRoles 変更後のロール
   * @param divisionId Division ID
   * @returns ログ用メタデータ
   */
  generateRoleChangeMetadata(
    targetUserId: string,
    oldRoles: UserRoleType[],
    newRoles: UserRoleType[],
    divisionId: string
  ): any {
    const currentUser = this.g.info.user;

    return {
      actionBy: currentUser?.id,
      actionByName: currentUser?.name,
      targetUserId,
      divisionId,
      oldRoles,
      newRoles,
      timestamp: new Date().toISOString(),
      action: 'role_change'
    };
  }

  /**
   * 権限エラーメッセージを生成
   * 
   * @param action 実行しようとしたアクション
   * @param reason エラーの理由
   * @returns エラーメッセージ
   */
  generatePermissionErrorMessage(action: string, reason: string): string {
    const messages: Record<string, string> = {
      'self_edit': '自分自身のロールは変更できません',
      'insufficient_authority': 'この操作を実行する権限がありません',
      'target_higher_authority': '自分より高い権限を持つユーザーは管理できません',
      'target_same_authority': '同等の権限を持つユーザーは管理できません',
      'role_not_assignable': 'このロールを割り当てる権限がありません',
      'division_not_managed': 'このDivisionを管理する権限がありません'
    };

    return messages[reason] || `${action}を実行する権限がありません`;
  }
}