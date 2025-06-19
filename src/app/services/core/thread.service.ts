import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { 
    ThreadGroupForView, 
    Thread, 
    ThreadGroupType, 
    ThreadGroupVisibility,
    ThreadGroupUpsertDto,
    ThreadGroup
} from '../../models/project-models';
import { ChatCompletionCreateParamsWithoutMessages } from '../../models/models';
import { genInitialBaseEntity } from './project-utils';
import { Utils } from '../../utils';
import { NotificationService } from '../../shared/services/notification.service';
import { ChatCompletionCreateParamsBase } from 'openai/resources/chat/completions.mjs';

/**
 * スレッド管理サービス
 * スレッドグループとスレッドのCRUD操作を提供
 */
@Injectable({ providedIn: 'root' })
export class ThreadService {
    private readonly http = inject(HttpClient);
    private readonly notificationService = inject(NotificationService);
    
    private threadListMas: { [threadGroupId: string]: ThreadGroupForView[] } = {};

    /**
     * 初期スレッドグループエンティティを生成
     * @param projectId プロジェクトID
     * @param template テンプレート（省略可）
     * @returns 初期化されたスレッドグループ
     */
    genInitialThreadGroupEntity(projectId: string, template?: ThreadGroupForView): ThreadGroupForView {
        const defaultThreadGroup = template || 
            Object.keys(this.threadListMas)
                .map(key => this.threadListMas[key].find(threadGroup => threadGroup.type === ThreadGroupType.Default))
                .filter(threadGroup => threadGroup)[0];

        if (defaultThreadGroup) {
            // デフォルトスレッドグループがあればそれをひな型として返す
            const threadGroup = Utils.clone(defaultThreadGroup);
            threadGroup.createdAt = new Date(threadGroup.createdAt);
            threadGroup.updatedAt = new Date(threadGroup.updatedAt);
            
            // ひな型なので要らない項目は消しておく
            Object.assign(threadGroup, genInitialBaseEntity('thread-group'));
            threadGroup.title = '';
            threadGroup.type = ThreadGroupType.Normal;
            threadGroup.description = '';
            threadGroup.visibility = ThreadGroupVisibility.Team;
            threadGroup.threadList.forEach(thread => 
                Object.assign(thread, genInitialBaseEntity('thread'))
            );
            
            return threadGroup;
        } else {
            // デフォルトスレッドグループがなければ新規作成
            const threadGroup = {
                projectId,
                description: '',
                title: '',
                type: ThreadGroupType.Normal,
                visibility: ThreadGroupVisibility.Team,
                threadList: [],
                updatedDate: new Date().toLocaleDateString(
                    navigator.language || 'ja-JP', 
                    { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }
                ),
                ...genInitialBaseEntity('thread-group'),
            } as ThreadGroupForView;

            threadGroup.threadList.push(this.genInitialThreadEntity(threadGroup.id));
            return threadGroup;
        }
    }

    /**
     * 初期スレッドエンティティを生成
     * @param threadGroupId スレッドグループID
     * @returns 初期化されたスレッド
     */
    genInitialThreadEntity(threadGroupId: string): Thread {
        return {
            threadGroupId,
            inDto: {
                args: this.getInitialArgs() as ChatCompletionCreateParamsBase & { providerName: string },
            },
            status: 'Normal',
            ...genInitialBaseEntity('thread'),
        };
    }

    /**
     * 初期引数を取得
     * @returns 初期引数
     */
    getInitialArgs(): ChatCompletionCreateParamsWithoutMessages {
        return {
            model: 'gpt-4o',
            max_tokens: 4096,
            temperature: 0.7,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            providerName: 'openai'
        };
    }

    /**
     * スレッドグループを作成または更新
     * @param projectId プロジェクトID
     * @param threadGroup スレッドグループ
     * @returns 作成/更新されたスレッドグループ
     */
    upsertThreadGroup(projectId: string, threadGroup: ThreadGroupUpsertDto): Observable<ThreadGroup> {
        return this.http.post<ThreadGroup>(`/user/project/${projectId}/thread-group`, threadGroup).pipe(
            tap(result => {
                this.notificationService.showSuccess('スレッドグループを保存しました');
            })
        );
    }

    /**
     * スレッドグループリストを取得
     * @param projectId プロジェクトID
     * @param force キャッシュを無視して強制取得
     * @returns スレッドグループリスト
     */
    getThreadGroupList(projectId: string, force: boolean = false): Observable<ThreadGroupForView[]> {
        if (this.threadListMas[projectId] && !force) {
            return new Observable(observer => {
                observer.next(this.threadListMas[projectId]);
                observer.complete();
            });
        }

        return this.http.get<ThreadGroupForView[]>(`/user/project/${projectId}/thread-groups`).pipe(
            tap(threadGroups => {
                // 日付変換とキャッシュ保存
                threadGroups.forEach(threadGroup => {
                    threadGroup.createdAt = new Date(threadGroup.createdAt);
                    threadGroup.updatedAt = new Date(threadGroup.updatedAt);
                    threadGroup.updatedDate = threadGroup.updatedAt.toLocaleDateString(
                        navigator.language || 'ja-JP',
                        { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }
                    );
                });
                this.threadListMas[projectId] = threadGroups;
            })
        );
    }

    /**
     * 特定のスレッドグループを取得
     * @param threadGroupId スレッドグループID
     * @returns スレッドグループ
     */
    getThreadGroup(threadGroupId: string): Observable<ThreadGroupForView> {
        return this.http.get<ThreadGroupForView>(`/user/thread-group/${threadGroupId}`).pipe(
            tap(threadGroup => {
                threadGroup.createdAt = new Date(threadGroup.createdAt);
                threadGroup.updatedAt = new Date(threadGroup.updatedAt);
                threadGroup.updatedDate = threadGroup.updatedAt.toLocaleDateString(
                    navigator.language || 'ja-JP',
                    { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }
                );
            })
        );
    }

    /**
     * スレッドグループを更新
     * @param threadGroupId スレッドグループID
     * @param updateData 更新データ
     * @returns 更新されたスレッドグループ
     */
    updateThreadGroup(threadGroupId: string, updateData: Partial<ThreadGroup>): Observable<ThreadGroup> {
        return this.http.patch<ThreadGroup>(`/user/thread-group/${threadGroupId}`, updateData).pipe(
            tap(updatedThreadGroup => {
                // キャッシュを更新
                Object.keys(this.threadListMas).forEach(projectId => {
                    const threadGroups = this.threadListMas[projectId];
                    const index = threadGroups.findIndex(tg => tg.id === threadGroupId);
                    if (index !== -1) {
                        threadGroups[index] = { ...threadGroups[index], ...updatedThreadGroup };
                    }
                });
                this.notificationService.showSuccess('スレッドグループを更新しました');
            })
        );
    }

    /**
     * スレッドグループを削除
     * @param threadGroupId スレッドグループID
     * @returns 削除完了
     */
    deleteThreadGroup(threadGroupId: string): Observable<void> {
        return this.http.delete<void>(`/user/thread-group/${threadGroupId}`).pipe(
            tap(() => {
                // キャッシュから削除
                Object.keys(this.threadListMas).forEach(projectId => {
                    this.threadListMas[projectId] = this.threadListMas[projectId]
                        .filter(tg => tg.id !== threadGroupId);
                });
                this.notificationService.showSuccess('スレッドグループを削除しました');
            })
        );
    }

    /**
     * スレッドグループを複製
     * @param threadGroupId スレッドグループID
     * @param newTitle 新しいタイトル
     * @returns 複製されたスレッドグループ
     */
    duplicateThreadGroup(threadGroupId: string, newTitle: string): Observable<ThreadGroup> {
        return this.http.post<ThreadGroup>(`/user/thread-group/${threadGroupId}/duplicate`, { title: newTitle }).pipe(
            tap(duplicatedThreadGroup => {
                this.notificationService.showSuccess('スレッドグループを複製しました');
            })
        );
    }

    /**
     * スレッドグループをアーカイブ
     * @param threadGroupId スレッドグループID
     * @returns アーカイブされたスレッドグループ
     */
    archiveThreadGroup(threadGroupId: string): Observable<ThreadGroup> {
        return this.http.patch<ThreadGroup>(`/user/thread-group/${threadGroupId}/archive`, {}).pipe(
            tap(() => {
                this.notificationService.showSuccess('スレッドグループをアーカイブしました');
            })
        );
    }

    /**
     * スレッドグループのアーカイブを解除
     * @param threadGroupId スレッドグループID
     * @returns アーカイブ解除されたスレッドグループ
     */
    unarchiveThreadGroup(threadGroupId: string): Observable<ThreadGroup> {
        return this.http.patch<ThreadGroup>(`/user/thread-group/${threadGroupId}/unarchive`, {}).pipe(
            tap(() => {
                this.notificationService.showSuccess('スレッドグループのアーカイブを解除しました');
            })
        );
    }

    /**
     * スレッドグループを検索
     * @param projectId プロジェクトID
     * @param query 検索クエリ
     * @returns 検索結果
     */
    searchThreadGroups(projectId: string, query: string): Observable<ThreadGroupForView[]> {
        return this.http.get<ThreadGroupForView[]>(`/user/project/${projectId}/thread-groups/search`, {
            params: { q: query }
        });
    }

    /**
     * スレッドグループの並び順を更新
     * @param projectId プロジェクトID
     * @param threadGroupIds スレッドグループIDの配列（新しい順序）
     * @returns 更新完了
     */
    updateThreadGroupOrder(projectId: string, threadGroupIds: string[]): Observable<void> {
        return this.http.patch<void>(`/user/project/${projectId}/thread-groups/order`, { 
            threadGroupIds 
        }).pipe(
            tap(() => {
                this.notificationService.showSuccess('並び順を更新しました');
            })
        );
    }

    /**
     * キャッシュをクリア
     * @param projectId プロジェクトID（省略時は全てクリア）
     */
    clearCache(projectId?: string): void {
        if (projectId) {
            delete this.threadListMas[projectId];
        } else {
            this.threadListMas = {};
        }
    }

    /**
     * スレッドグループの統計情報を取得
     * @param projectId プロジェクトID
     * @returns 統計情報
     */
    getThreadGroupStats(projectId: string): Observable<{
        totalThreadGroups: number;
        activeThreadGroups: number;
        archivedThreadGroups: number;
        recentThreadGroups: ThreadGroupForView[];
    }> {
        return this.http.get<any>(`/user/project/${projectId}/thread-groups/stats`);
    }

    /**
     * スレッドグループをエクスポート
     * @param threadGroupId スレッドグループID
     * @param format エクスポート形式
     * @returns エクスポートデータ
     */
    exportThreadGroup(threadGroupId: string, format: 'json' | 'markdown' | 'csv' = 'json'): Observable<Blob> {
        return this.http.get(`/user/thread-group/${threadGroupId}/export`, {
            params: { format },
            responseType: 'blob'
        }).pipe(
            tap(() => {
                this.notificationService.showSuccess('スレッドグループをエクスポートしました');
            })
        );
    }
}