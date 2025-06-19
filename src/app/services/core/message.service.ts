import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { DomSanitizer } from '@angular/platform-browser';
import {
    MessageGroupForView,
    MessageForView,
    ContentPart,
    ContentPartType,
    MessageGroup,
    Message,
    MessageGroupType,
    MessageStatusType,
} from '../../models/project-models';
import { genInitialBaseEntity } from './project-utils';
import { NotificationService } from '../../shared/services/notification.service';
import OpenAI from 'openai';

/**
 * メッセージ管理サービス
 * メッセージとコンテンツパーツのCRUD操作を提供
 */
@Injectable({ providedIn: 'root' })
export class MessageService {
    private readonly http = inject(HttpClient);
    private readonly sanitizer = inject(DomSanitizer);
    private readonly notificationService = inject(NotificationService);

    // キャッシュ
    messageGroupList: MessageGroupForView[] = [];
    messageList: MessageForView[] = [];
    contentPartList: ContentPart[] = [];

    // インデックス
    messageGroupMas: { [messageGroupId: string]: MessageGroupForView } = {};
    messageMas: { [messageId: string]: MessageForView } = {};
    contentPartMas: { [contentPartId: string]: ContentPart } = {};

    // リレーション管理
    prevMessageGroupId: { [messageGroupId: string]: string } = {};
    nextMessageGroupId: { [messageGroupId: string]: string[] } = {};
    oldMessageId: { [messageId: string]: string } = {};
    newMessageId: { [messageId: string]: string[] } = {};

    // ID変換テーブル
    idRemapTable: { [dummyId: string]: string } = {};

    /**
     * メッセージのタイムスタンプを更新
     * @param type メッセージタイプ
     * @param id ID
     * @returns 更新されたメッセージ
     */
    updateTimestamp(type: 'message-group' | 'message', id: string): Observable<Message | MessageGroup> {
        return this.http.patch<MessageForView>(`/user/thread/${type}/${id}`, id).pipe(
            tap(res => {
                // アップデートした分を反映
                (type === 'message-group' ? this.messageGroupMas : this.messageMas)[id].updatedAt = new Date(res.updatedAt);
            })
        );
    }

    /**
     * メッセージとコンテンツを編集
     * @param message メッセージ
     * @returns 更新されたメッセージ
     */
    editMessageWithContents(message: MessageForView): Observable<MessageForView> {
        return this.http.patch<MessageForView>(`/user/message/${message.id}/content-parts`, message).pipe(
            tap(() => {
                this.notificationService.showSuccess('メッセージを更新しました');
            })
        );
    }

    /**
     * メッセージグループリストを取得
     * @param threadGroupId スレッドグループID
     * @param page ページ番号
     * @param limit 取得件数
     * @returns メッセージグループリスト
     */
    getMessageGroupList(threadGroupId: string, page: number = 1, limit: number = 1000): Observable<{ messageGroups: MessageGroupForView[] }> {
        return this.http.get<{ messageGroups: MessageGroupForView[] }>(`/user/thread/${threadGroupId}/message-groups`, {
            params: { page: page.toString(), limit: limit.toString() },
        }).pipe(
            tap(result => {
                // キャッシュに追加
                result.messageGroups.forEach(messageGroup => {
                    if (!this.messageGroupMas[messageGroup.id]) {
                        this.messageGroupList.push(messageGroup);
                        this.messageGroupMas[messageGroup.id] = messageGroup;
                    }
                });
            })
        );
    }

    /**
     * メッセージのコンテンツパーツを取得
     * @param message メッセージ
     * @returns コンテンツパーツリスト
     */
    getMessageContentParts(message: MessageForView): Observable<ContentPart[]> {
        return this.http.get<ContentPart[]>(`/user/message/${message.id}/content-parts`).pipe(
            tap(list => {
                message.contents = list;
                list.forEach(contentPart => {
                    this.processContentPart(contentPart);
                });
            })
        );
    }

    /**
     * コンテンツパーツを処理
     * @param contentPart コンテンツパーツ
     */
    private processContentPart(contentPart: ContentPart): void {
        // キャッシュに保存
        if (!this.contentPartMas[contentPart.id]) {
            this.contentPartList.push(contentPart);
            this.contentPartMas[contentPart.id] = contentPart;
        }

        // タイプによって処理を分ける
        if (contentPart.type === ContentPartType.TOOL) {
            // ツールの場合、ツールの内容をセット
            try {
                contentPart.toolCallGroup = {
                    id: '',
                    projectId: '',
                    toolCallList: JSON.parse(contentPart.text as string)
                };
            } catch (error) {
                console.error('Failed to parse tool call group:', error);
            }
        } else if (contentPart.type === ContentPartType.META) {
            // Google検索結果のメタデータをセット
            try {
                contentPart.meta = JSON.parse(contentPart.text as string);
                if (contentPart.meta?.groundingMetadata?.searchEntryPoint?.renderedContent) {
                    // リンクを新しいタブで開くようにする
                    const renderedContent = contentPart.meta.groundingMetadata.searchEntryPoint.renderedContent;
                    contentPart.meta.groundingMetadata.searchEntryPoint.renderedContent =
                        this.sanitizer.bypassSecurityTrustHtml(renderedContent.replace(/<a /g, '<a target="_blank" '));
                }
            } catch (error) {
                console.error('Failed to parse meta content:', error);
            }
        }

        // 日付を変換
        contentPart.createdAt = new Date(contentPart.createdAt);
        contentPart.updatedAt = new Date(contentPart.updatedAt);
    }

    /**
     * メッセージコンテンツパーツをドライ追加（サーバーに送信せずキャッシュのみ）
     * @param messageId メッセージID
     * @param contentPart コンテンツパーツ
     * @returns 追加されたコンテンツパーツ
     */
    addMessageContentPartDry(messageId: string, contentPart: ContentPart): ContentPart {
        if (!this.contentPartMas[contentPart.id]) {
            this.contentPartList.push(contentPart);
            this.contentPartMas[contentPart.id] = contentPart;
        }
        return contentPart;
    }

    /**
     * メッセージグループを削除
     * @param messageGroupId メッセージグループID
     * @returns 削除結果
     */
    deleteMessageGroup(messageGroupId: string): Observable<{ message: string, target: MessageGroup }> {
        return this.http.delete<{ message: string, target: MessageGroup }>(`/user/message-group/${messageGroupId}`).pipe(
            tap(() => {
                // キャッシュから削除
                delete this.messageGroupMas[messageGroupId];
                this.messageGroupList = this.messageGroupList.filter(mg => mg.id !== messageGroupId);
                this.notificationService.showSuccess('メッセージグループを削除しました');
            })
        );
    }

    /**
     * コンテンツパーツを削除
     * @param contentPartId コンテンツパーツID
     * @returns 削除完了
     */
    deleteContentPart(contentPartId: string): Observable<void> {
        return this.http.delete<void>(`/user/content-part/${contentPartId}`).pipe(
            tap(() => {
                // キャッシュから削除
                delete this.contentPartMas[contentPartId];
                this.contentPartList = this.contentPartList.filter(cp => cp.id !== contentPartId);
                this.notificationService.showSuccess('コンテンツを削除しました');
            })
        );
    }

    /**
     * メッセージグループを初期化
     * @param threadId スレッドID
     * @param previousMessageGroupId 前のメッセージグループID
     * @param role ロール
     * @param contentParts コンテンツパーツリスト
     * @returns 初期化されたメッセージグループ
     */
    initMessageGroup(
        threadId: string,
        previousMessageGroupId?: string,
        role: OpenAI.ChatCompletionRole = 'system',
        contentParts: ContentPart[] = []
    ): MessageGroupForView {
        const messageGroup: MessageGroupForView = {
            threadId,
            type: MessageGroupType.Single,
            role,
            seq: 0,
            previousMessageGroupId,
            selectedIndex: 0,
            messages: [],
            ...genInitialBaseEntity('message-group'),
        };

        const message = this.initMessage(messageGroup.id, contentParts);
        messageGroup.messages.push(message);

        return messageGroup;
    }

    /**
     * メッセージを初期化
     * @param messageGroupId メッセージグループID
     * @param contentParts コンテンツパーツリスト
     * @returns 初期化されたメッセージ
     */
    initMessage(messageGroupId: string, contentParts: ContentPart[] = []): MessageForView {
        const message: MessageForView = {
            messageGroupId,
            subSeq: 0,
            label: (contentParts[0]?.text || '').substring(0, 250),
            seq: 0,
            editing: 0,
            selected: false,
            status: MessageStatusType.Initial,
            contents: contentParts,
            ...genInitialBaseEntity('message'),
        };
        contentParts.forEach((contentPart, index) => {
            contentPart.messageId = message.id;
            contentPart.seq = index;
        });
        if (contentParts.length === 0) {
            // contentParts.push(this.initContentPart(message.id));
        }
        message.contents = contentParts;
        return message;
    }

    /**
     * キャッシュをクリア
     */
    clearCache(): void {
        this.messageGroupList = [];
        this.messageList = [];
        this.contentPartList = [];
        this.messageGroupMas = {};
        this.messageMas = {};
        this.contentPartMas = {};
        this.prevMessageGroupId = {};
        this.nextMessageGroupId = {};
        this.oldMessageId = {};
        this.newMessageId = {};
        this.idRemapTable = {};
    }

    /**
     * メッセージグループを複製
     * @param messageGroupId メッセージグループID
     * @returns 複製されたメッセージグループ
     */
    duplicateMessageGroup(messageGroupId: string): Observable<MessageGroupForView> {
        return this.http.post<MessageGroupForView>(`/user/message-group/${messageGroupId}/duplicate`, {}).pipe(
            tap(duplicatedMessageGroup => {
                // キャッシュに追加
                this.messageGroupList.push(duplicatedMessageGroup);
                this.messageGroupMas[duplicatedMessageGroup.id] = duplicatedMessageGroup;
                this.notificationService.showSuccess('メッセージグループを複製しました');
            })
        );
    }

    /**
     * メッセージを検索
     * @param query 検索クエリ
     * @param threadGroupId スレッドグループID
     * @returns 検索結果
     */
    searchMessages(query: string, threadGroupId?: string): Observable<MessageGroupForView[]> {
        const params: any = { q: query };
        if (threadGroupId) {
            params.threadGroupId = threadGroupId;
        }
        return this.http.get<MessageGroupForView[]>('/user/message-groups/search', { params });
    }

    /**
     * メッセージ統計を取得
     * @param threadGroupId スレッドグループID
     * @returns メッセージ統計
     */
    getMessageStats(threadGroupId: string): Observable<{
        totalMessages: number;
        userMessages: number;
        assistantMessages: number;
        systemMessages: number;
        totalTokens: number;
    }> {
        return this.http.get<any>(`/user/thread/${threadGroupId}/message-stats`);
    }
}