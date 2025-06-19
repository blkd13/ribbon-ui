import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { AuthService } from '../auth.service';
import { 
    Team, 
    TeamCreateDto, 
    TeamUpdateDto, 
    TeamMember, 
    TeamMemberAddDto, 
    TeamMemberUpdateDto 
} from '../../models/project-models';
import { BaseApiService } from '../../shared/base/base-api.service';
import { NotificationService } from '../../shared/services/notification.service';

/**
 * チーム管理サービス
 * チームのCRUD操作とメンバー管理を提供
 */
@Injectable({ providedIn: 'root' })
export class TeamService extends BaseApiService<Team> {
    private readonly authService = inject(AuthService);
    private readonly notificationService = inject(NotificationService);
    
    private teamList: Team[] = [];

    constructor() {
        super('/user/team');
    }

    /**
     * 新しいチームを作成
     * @param team チーム作成データ
     * @returns 作成されたチーム
     */
    createTeam(team: TeamCreateDto): Observable<Team> {
        return this.create(team).pipe(
            tap(createdTeam => {
                this.teamList.push(createdTeam);
                this.notificationService.showSuccess('チームを作成しました');
            })
        );
    }

    /**
     * チームリストを取得
     * @param force キャッシュを無視して強制取得
     * @returns チームリスト
     */
    getTeamList(force: boolean = false): Observable<Team[]> {
        if (this.teamList.length > 0 && !force) {
            return of(this.teamList);
        }
        
        return this.getAll().pipe(
            tap(teams => {
                this.teamList = teams;
            })
        );
    }

    /**
     * 特定のチームを取得
     * @param teamId チームID
     * @returns チーム
     */
    getTeam(teamId: string): Observable<Team> {
        return this.getById(teamId);
    }

    /**
     * チーム情報を更新
     * @param teamId チームID
     * @param team 更新データ
     * @returns 更新されたチーム
     */
    updateTeam(teamId: string, team: TeamUpdateDto): Observable<Team> {
        return this.update(teamId, team).pipe(
            tap(updatedTeam => {
                // キャッシュを更新
                const index = this.teamList.findIndex(t => t.id === teamId);
                if (index !== -1) {
                    this.teamList[index] = updatedTeam;
                }
                this.notificationService.showSuccess('チーム情報を更新しました');
            })
        );
    }

    /**
     * チームを削除
     * @param teamId チームID
     * @returns 削除完了
     */
    deleteTeam(teamId: string): Observable<void> {
        return this.delete(teamId).pipe(
            tap(() => {
                // キャッシュから削除
                this.teamList = this.teamList.filter(t => t.id !== teamId);
                this.notificationService.showSuccess('チームを削除しました');
            })
        );
    }

    // チームメンバー管理

    /**
     * チームメンバーを追加
     * @param teamId チームID
     * @param member メンバー追加データ
     * @returns 追加されたメンバー
     */
    addTeamMember(teamId: string, member: TeamMemberAddDto): Observable<TeamMember> {
        return this.http.post<TeamMember>(`${this.baseUrl}/${teamId}/member`, member).pipe(
            tap(() => {
                this.notificationService.showSuccess('メンバーを追加しました');
            })
        );
    }

    /**
     * チームメンバーリストを取得
     * @param teamId チームID
     * @returns メンバーリスト
     */
    getTeamMembers(teamId: string): Observable<TeamMember[]> {
        return this.http.get<TeamMember[]>(`${this.baseUrl}/${teamId}/members`);
    }

    /**
     * チームメンバー情報を更新
     * @param teamId チームID
     * @param memberId メンバーID
     * @param member 更新データ
     * @returns 更新されたメンバー
     */
    updateTeamMember(teamId: string, memberId: string, member: TeamMemberUpdateDto): Observable<TeamMember> {
        return this.http.put<TeamMember>(`${this.baseUrl}/${teamId}/member/${memberId}`, member).pipe(
            tap(() => {
                this.notificationService.showSuccess('メンバー情報を更新しました');
            })
        );
    }

    /**
     * チームメンバーを削除
     * @param teamId チームID
     * @param memberId メンバーID
     * @returns 削除完了
     */
    removeTeamMember(teamId: string, memberId: string): Observable<void> {
        return this.http.delete<void>(`${this.baseUrl}/${teamId}/member/${memberId}`).pipe(
            tap(() => {
                this.notificationService.showSuccess('メンバーを削除しました');
            })
        );
    }

    /**
     * チームキャッシュをクリア
     */
    clearCache(): void {
        this.teamList = [];
    }

    /**
     * ユーザーが所属するチームを取得
     * @param userId ユーザーID
     * @returns 所属チームリスト
     */
    getUserTeams(userId?: string): Observable<Team[]> {
        const params = userId ? { userId } : {};
        return this.http.get<Team[]>(`${this.baseUrl}/user-teams`, { params });
    }

    /**
     * チーム検索
     * @param query 検索クエリ
     * @returns 検索結果
     */
    searchTeams(query: string): Observable<Team[]> {
        return this.http.get<Team[]>(`${this.baseUrl}/search`, {
            params: { q: query }
        });
    }

    /**
     * チームメンバーの役割を変更
     * @param teamId チームID
     * @param memberId メンバーID
     * @param role 新しい役割
     * @returns 更新されたメンバー
     */
    changeTeamMemberRole(teamId: string, memberId: string, role: string): Observable<TeamMember> {
        return this.http.patch<TeamMember>(`${this.baseUrl}/${teamId}/member/${memberId}/role`, { role }).pipe(
            tap(() => {
                this.notificationService.showSuccess('メンバーの役割を変更しました');
            })
        );
    }
}