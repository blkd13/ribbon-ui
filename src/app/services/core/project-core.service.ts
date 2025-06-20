import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, map } from 'rxjs';
import { AuthService } from '../auth.service';
import { 
    Project, 
    ProjectCreateDto, 
    ProjectUpdateDto,
    ProjectVisibility 
} from '../../models/project-models';
import { BaseApiService } from '../../shared/base/base-api.service';
import { NotificationService } from '../../shared/services/notification.service';

export interface ProjectSearchParams {
    query?: string;
    visibility?: ProjectVisibility;
    teamId?: string;
    isActive?: boolean;
    limit?: number;
    offset?: number;
}

export interface ProjectStats {
    totalProjects: number;
    publicProjects: number;
    privateProjects: number;
    sharedProjects: number;
    recentProjects: Project[];
}

/**
 * プロジェクト管理サービス
 * プロジェクトのCRUD操作と検索機能を提供
 */
@Injectable({ providedIn: 'root' })
export class ProjectCoreService extends BaseApiService<Project, ProjectCreateDto, ProjectUpdateDto> {
    protected baseUrl = '/user/project';
    protected entityName = 'プロジェクト';
    
    private readonly authService = inject(AuthService);
    private readonly notificationService = inject(NotificationService);
    
    private projectList: Project[] = [];
    private lastFetchTime: number = 0;
    private cacheDuration = 5 * 60 * 1000; // 5分

    /**
     * 新しいプロジェクトを作成
     * @param project プロジェクト作成データ
     * @returns 作成されたプロジェクト
     */
    createProject(project: ProjectCreateDto): Observable<Project> {
        return this.create(project).pipe(
            tap(createdProject => {
                this.projectList.push(createdProject);
                this.notificationService.showSuccess('プロジェクトを作成しました');
            })
        );
    }

    /**
     * プロジェクトリストを取得
     * @param force キャッシュを無視して強制取得
     * @returns プロジェクトリスト
     */
    getProjectList(force: boolean = false): Observable<Project[]> {
        const now = Date.now();
        const isCacheValid = this.projectList.length > 0 && 
                           !force && 
                           (now - this.lastFetchTime) < this.cacheDuration;

        if (isCacheValid) {
            return of(this.projectList);
        }
        
        return this.getAll().pipe(
            tap(projects => {
                this.projectList = projects;
                this.lastFetchTime = now;
            })
        );
    }

    /**
     * 特定のプロジェクトを取得
     * @param projectId プロジェクトID
     * @returns プロジェクト
     */
    getProject(projectId: string): Observable<Project> {
        // キャッシュから検索
        const cachedProject = this.projectList.find(p => p.id === projectId);
        if (cachedProject) {
            return of(cachedProject);
        }
        
        return this.getById(projectId).pipe(
            tap(project => {
                // キャッシュに追加
                const index = this.projectList.findIndex(p => p.id === projectId);
                if (index !== -1) {
                    this.projectList[index] = project;
                } else {
                    this.projectList.push(project);
                }
            })
        );
    }

    /**
     * プロジェクト情報を更新
     * @param projectId プロジェクトID
     * @param project 更新データ
     * @returns 更新されたプロジェクト
     */
    updateProject(projectId: string, project: ProjectUpdateDto): Observable<Project> {
        return this.update(projectId, project).pipe(
            tap(updatedProject => {
                // キャッシュを更新
                const index = this.projectList.findIndex(p => p.id === projectId);
                if (index !== -1) {
                    this.projectList[index] = updatedProject;
                }
                this.notificationService.showSuccess('プロジェクト情報を更新しました');
            })
        );
    }

    /**
     * プロジェクトを削除
     * @param projectId プロジェクトID
     * @returns 削除完了
     */
    deleteProject(projectId: string): Observable<void> {
        return this.delete(projectId).pipe(
            tap(() => {
                // キャッシュから削除
                this.projectList = this.projectList.filter(p => p.id !== projectId);
                this.notificationService.showSuccess('プロジェクトを削除しました');
            })
        );
    }

    /**
     * プロジェクト検索
     * @param params 検索パラメータ
     * @returns 検索結果
     */
    searchProjects(params: ProjectSearchParams): Observable<Project[]> {
        return this.http.get<Project[]>(`${this.baseUrl}/search`, { params: params as any });
    }

    /**
     * ユーザーが参加しているプロジェクトを取得
     * @param userId ユーザーID（省略時は現在のユーザー）
     * @returns 参加プロジェクトリスト
     */
    getUserProjects(userId?: string): Observable<Project[]> {
        const options = userId ? { params: { userId } } : {};
        return this.http.get<Project[]>(`${this.baseUrl}/user-projects`, options);
    }

    /**
     * 最近使用したプロジェクトを取得
     * @param limit 取得件数
     * @returns 最近使用プロジェクトリスト
     */
    getRecentProjects(limit: number = 10): Observable<Project[]> {
        return this.http.get<Project[]>(`${this.baseUrl}/recent`, {
            params: { limit: limit.toString() }
        });
    }

    /**
     * プロジェクト統計情報を取得
     * @returns 統計情報
     */
    getProjectStats(): Observable<ProjectStats> {
        return this.http.get<ProjectStats>(`${this.baseUrl}/stats`);
    }

    /**
     * プロジェクトを複製
     * @param projectId 複製元プロジェクトID
     * @param newName 新しいプロジェクト名
     * @returns 複製されたプロジェクト
     */
    duplicateProject(projectId: string, newName: string): Observable<Project> {
        return this.http.post<Project>(`${this.baseUrl}/${projectId}/duplicate`, { name: newName }).pipe(
            tap(duplicatedProject => {
                this.projectList.push(duplicatedProject);
                this.notificationService.showSuccess('プロジェクトを複製しました');
            })
        );
    }

    /**
     * プロジェクトをアーカイブ
     * @param projectId プロジェクトID
     * @returns アーカイブされたプロジェクト
     */
    archiveProject(projectId: string): Observable<Project> {
        return this.http.patch<Project>(`${this.baseUrl}/${projectId}/archive`, {}).pipe(
            tap(archivedProject => {
                // キャッシュを更新
                const index = this.projectList.findIndex(p => p.id === projectId);
                if (index !== -1) {
                    this.projectList[index] = archivedProject;
                }
                this.notificationService.showSuccess('プロジェクトをアーカイブしました');
            })
        );
    }

    /**
     * プロジェクトのアーカイブを解除
     * @param projectId プロジェクトID
     * @returns アーカイブ解除されたプロジェクト
     */
    unarchiveProject(projectId: string): Observable<Project> {
        return this.http.patch<Project>(`${this.baseUrl}/${projectId}/unarchive`, {}).pipe(
            tap(unarchivedProject => {
                // キャッシュを更新
                const index = this.projectList.findIndex(p => p.id === projectId);
                if (index !== -1) {
                    this.projectList[index] = unarchivedProject;
                }
                this.notificationService.showSuccess('プロジェクトのアーカイブを解除しました');
            })
        );
    }

    /**
     * プロジェクトの可視性を変更
     * @param projectId プロジェクトID
     * @param visibility 新しい可視性
     * @returns 更新されたプロジェクト
     */
    changeProjectVisibility(projectId: string, visibility: ProjectVisibility): Observable<Project> {
        return this.http.patch<Project>(`${this.baseUrl}/${projectId}/visibility`, { visibility }).pipe(
            tap(updatedProject => {
                // キャッシュを更新
                const index = this.projectList.findIndex(p => p.id === projectId);
                if (index !== -1) {
                    this.projectList[index] = updatedProject;
                }
                this.notificationService.showSuccess('プロジェクトの可視性を変更しました');
            })
        );
    }

    /**
     * プロジェクトキャッシュをクリア
     */
    override clearCache(): void {
        this.projectList = [];
        this.lastFetchTime = 0;
    }

    /**
     * プロジェクトをお気に入りに追加/削除
     * @param projectId プロジェクトID
     * @param isFavorite お気に入り状態
     * @returns 更新されたプロジェクト
     */
    toggleProjectFavorite(projectId: string, isFavorite: boolean): Observable<Project> {
        const action = isFavorite ? 'add' : 'remove';
        return this.http.patch<Project>(`${this.baseUrl}/${projectId}/favorite/${action}`, {}).pipe(
            tap(updatedProject => {
                // キャッシュを更新
                const index = this.projectList.findIndex(p => p.id === projectId);
                if (index !== -1) {
                    this.projectList[index] = updatedProject;
                }
                const message = isFavorite ? 'お気に入りに追加しました' : 'お気に入りから削除しました';
                this.notificationService.showSuccess(message);
            })
        );
    }

    /**
     * 可視性でプロジェクトをフィルタ
     * @param visibility 可視性
     * @returns フィルタされたプロジェクトリスト
     */
    getProjectsByVisibility(visibility: ProjectVisibility): Observable<Project[]> {
        return this.getProjectList().pipe(
            map(projects => projects.filter(p => p.visibility === visibility))
        );
    }

    /**
     * アクティブなプロジェクトのみを取得
     * @returns アクティブプロジェクトリスト
     */
    getActiveProjects(): Observable<Project[]> {
        return this.getProjectList().pipe(
            map(projects => projects.filter(p => p.id)) // idが存在するものをアクティブとみなす
        );
    }
}