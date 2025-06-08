import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { UserRoleType, UserStatus } from '../models/models';

export interface UserName {
    id: string;
    name: string;
    email: string;
}

export interface DivisionMember {
    userId: string;
    role: UserRoleType;
    // priority: number;
    status: UserStatus;
    userName: string;
    userEmail: string;
    // createdAt: Date;
    // updatedAt: Date;
}

export interface DivisionMemberForView extends DivisionMember {
    id: string; // Unique identifier for the member record
    user: UserName;
    divisionName?: string; // Division name for display purposes
    divisionId: string; // Required for operations like removal
    isActive: boolean; // Added for template compatibility
}

export interface Division {
    id: string;
    name: string;
    label: string;
    description?: string;
    isActive: boolean;
    userRole: UserRoleType;
    userPriority: number;
    createdAt?: Date; // Added for template compatibility  
    updatedAt?: Date; // Added for template compatibility
}

export interface MemberAssignmentRequest {
    userId: string;
    role: UserRoleType;
}

export interface MemberUpdateRequest {
    role?: UserRoleType;
    priority?: number;
}

export interface MemberSearchParams {
    searchTerm?: string;
}

export interface DivisionCreateRequest {
    name: string;
    label: string;
    description?: string;
}

export interface DivisionUpdateRequest {
    name?: string;
    label?: string;
    description?: string;
    isActive?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class MemberManagementService {
    readonly http: HttpClient = inject(HttpClient);

    /**
     * ユーザーが所属しているDivision一覧を取得
     */
    getDivisions(): Observable<Division[]> {
        return this.http.get<Division[]>('/user/divisions');
    }

    /**
     * 指定されたDivisionのメンバー一覧を取得
     */
    getMembers(divisionId: string): Observable<DivisionMember[]> {
        return this.http.get<DivisionMember[]>(`/user/division/${divisionId}/members`);
    }

    /**
     * 利用可能なユーザー一覧を取得（組織のユーザー）
     * 既存のAuthServiceのgetOrganizationUsersメソッドを使用することを推奨
     */
    getAvailableUsers(): Observable<UserName[]> {
        return this.http.get<UserName[]>(`/admin/organizations/users`);
    }

    /**
     * Divisionメンバーを追加
     */
    assignMember(divisionId: string, request: MemberAssignmentRequest): Observable<DivisionMember> {
        return this.http.post<DivisionMember>(`/admin/division/${divisionId}/member`, request);
    }

    /**
     * Divisionメンバーの情報を更新
     */
    updateMember(divisionId: string, userId: string, request: MemberUpdateRequest): Observable<DivisionMember> {
        return this.http.patch<DivisionMember>(`/admin/division/${divisionId}/member/${userId}`, request);
    }

    /**
     * Divisionからメンバーを削除
     */
    removeMember(divisionId: string, userId: string): Observable<void> {
        return this.http.delete<void>(`/admin/division/${divisionId}/member/${userId}`);
    }
    /**
     * 複数メンバーを一括で割り当て
     * Note: この機能にはAPIエンドポイントが不足している可能性があります
     * サーバーチームに以下のエンドポイントの実装を依頼してください:
     * POST /division/{divisionId}/members/bulk
     */
    bulkAssignMembers(divisionId: string, requests: MemberAssignmentRequest[]): Observable<DivisionMember[]> {
        return this.http.post<DivisionMember[]>(`/admin/division/${divisionId}/members/bulk`, { assignments: requests });
    }

    /**
     * 複数メンバーを一括で削除
     * Note: この機能にはAPIエンドポイントが不足している可能性があります
     * サーバーチームに以下のエンドポイントの実装を依頼してください:
     * DELETE /division/{divisionId}/members/bulk
     */
    bulkRemoveMembers(divisionId: string, userIds: string[]): Observable<void> {
        return this.http.delete<void>(`/admin/division/${divisionId}/members/bulk`, {
            body: { userIds }
        });
    }

    /**
     * メンバーのロール一覧を取得（APIで定義されているロール）
     */
    getAvailableRoles(): UserRoleType[] {
        return [
            // UserRoleType.Maintainer,
            UserRoleType.Admin,
            UserRoleType.User,
            // UserRoleType.Owner,
            // UserRoleType.BizAdmin,
            // UserRoleType.SysAdmin,
            // UserRoleType.Member,
            // UserRoleType.Viewer,
            // UserRoleType.Guest
        ];
    }

    /**
     * 特定のユーザーの所属情報を取得
     */
    getUserMemberships(userId: string): Observable<DivisionMemberForView[]> {
        return this.http.get<DivisionMemberForView[]>(`/admin/users/${userId}/memberships`);
    }

    /**
     * ディビジョンの統計情報を取得
     */
    getDivisionStats(divisionId: string): Observable<{
        totalMembers: number;
        activeMembers: number;
        membersByRole: Record<UserRoleType, number>;
    }> {
        return this.http.get<{
            totalMembers: number;
            activeMembers: number;
            membersByRole: Record<UserRoleType, number>;
        }>(`/admin/divisions/${divisionId}/stats`);
    }

    /**
     * 新しいDivisionを作成
     */
    createDivision(request: DivisionCreateRequest): Observable<Division> {
        return this.http.post<Division>('/admin/division', request);
    }

    /**
     * Divisionの情報を更新
     */
    updateDivision(divisionId: string, request: DivisionUpdateRequest): Observable<Division> {
        return this.http.patch<Division>(`/admin/division/${divisionId}`, request);
    }

    /**
     * Divisionを削除
     */
    deleteDivision(divisionId: string): Observable<void> {
        return this.http.delete<void>(`/admin/division/${divisionId}`);
    }
}
