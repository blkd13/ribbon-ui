import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, of, switchMap, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { BaseEntity, ContentPart, ContentPartType, MessageClusterType, Message, MessageForView, MessageGroup, MessageGroupForView, MessageGroupType, Project, ProjectCreateDto, ProjectUpdateDto, Team, TeamCreateDto, TeamMember, TeamMemberAddDto, TeamMemberUpdateDto, TeamUpdateDto, Thread, ThreadGroup, ThreadGroupUpsertDto, ThreadGroupVisibility, UUID, MessageStatusType, ThreadGroupType } from '../models/project-models';
import JSZip from 'jszip'; // JSZipのインポート
import { Utils } from '../utils';
import { safeForkJoin } from '../utils/dom-utils';
import { ChatCompletionCreateParamsBase, ChatCompletionCreateParamsWithoutMessages, ChatCompletionRole, ChatCompletionStreamInDto } from '../models/models';
import e from 'express';

@Injectable({ providedIn: 'root' })
export class TeamService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);
    private teamList: Team[] = [];

    createTeam(team: TeamCreateDto): Observable<Team> {
        return this.http.post<Team>('/user/team', team).pipe(tap(team => this.teamList.push(team)));
    }

    getTeamList(force: boolean = false): Observable<Team[]> {
        return (this.teamList.length > 0 && !force)
            ? of(this.teamList)
            : this.http.get<Team[]>('/user/team');
    }

    getTeam(teamId: string): Observable<Team> {
        return this.http.get<Team>(`/user/team/${teamId}`);
    }

    updateTeam(teamId: string, team: TeamUpdateDto): Observable<Team> {
        return this.http.patch<Team>(`/user/team/${teamId}`, team);
    }

    deleteTeam(teamId: string): Observable<void> {
        return this.http.delete<void>(`/user/team/${teamId}`);
    }

    addTeamMember(teamId: string, member: TeamMemberAddDto): Observable<TeamMember> {
        return this.http.post<TeamMember>(`/user/team/${teamId}/member`, member);
    }

    getTeamMembers(teamId: string): Observable<TeamMember[]> {
        return this.http.get<TeamMember[]>(`/user/team/${teamId}/members`);
    }

    updateTeamMember(teamId: string, memberId: string, member: TeamMemberUpdateDto): Observable<TeamMember> {
        return this.http.put<TeamMember>(`/user/team/${teamId}/member/${memberId}`, member);
    }

    removeTeamMember(teamId: string, memberId: string): Observable<void> {
        return this.http.delete<void>(`/user/team/${teamId}/member/${memberId}`);
    }
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);
    private projectList: Project[] = [];

    createProject(project: ProjectCreateDto): Observable<Project> {
        return this.http.post<Project>('/user/project', project).pipe(tap(project => this.projectList.push(project)));
    }

    getProjectList(force: boolean = false): Observable<Project[]> {
        return (this.projectList.length > 0 && !force)
            ? of(this.projectList) // ストックがあればストックを返す。
            : this.http.get<Project[]>('/user/project').pipe(tap(projectList => this.projectList = projectList));
    }

    getProject(projectId: string): Observable<Project> {
        return this.http.get<Project>(`/user/project/${projectId}`);
    }

    updateProject(projectId: string, project: ProjectUpdateDto): Observable<Project> {
        return this.http.put<Project>(`/user/project/${projectId}`, project);
    }

    deleteProject(projectId: string): Observable<void> {
        return this.http.delete<void>(`/user/project/${projectId}`);
    }
}

// Date.nowだけだと同じミリ秒で生成されることがあるので、カウンターを使ってユニークなIDを生成する。
let counter = 0;
export function genDummyId(dummyIdPrefix: string = ''): string {
    return `dummy-${dummyIdPrefix}-${counter++}-${Date.now()}`;
}
export function genInitialBaseEntity(dummyIdPrefix: string = '') {
    return {
        id: genDummyId(dummyIdPrefix),
        createdAt: new Date(), updatedAt: new Date(),
        createdBy: '', updatedBy: '',
        createdIp: '', updatedIp: '',
    };
}


function baseEntityFormat(base: BaseEntity): BaseEntity {
    base.createdAt = new Date(base.createdAt);
    base.updatedAt = new Date(base.updatedAt);
    return base;
}

function threadFormat(thread: Thread): Thread {
    thread.inDto = JSON.parse((thread as any).inDtoJson);
    delete (thread as any).inDtoJson;
    return thread;
}

function threadGroupResponseHandler(threadGroup: ThreadGroup): ThreadGroup {
    threadGroup.threadList.forEach(thread => threadFormat(thread));
    return threadGroup;
}

@Injectable({ providedIn: 'root' })
export class ThreadService {

    private readonly http: HttpClient = inject(HttpClient);
    private threadListMas: { [threadGroupId: string]: ThreadGroup[] } = {};

    genInitialThreadGroupEntity(projectId: string): ThreadGroup {
        const deafultThreadGroup = Object.keys(this.threadListMas).map(key => this.threadListMas[key].find(threadGroup => threadGroup.type === ThreadGroupType.Default)).filter(threadGroup => threadGroup)[0];
        if (deafultThreadGroup) {
            const threadGroup = Utils.clone(deafultThreadGroup);
            // デフォルトスレッドグループがあればそれをひな型として返す
            // ひな型なので要らない項目は消しておかないといけない。
            Object.assign(threadGroup, genInitialBaseEntity('thread-group'));
            threadGroup.title = '';
            (threadGroup.lastUpdate as any) = undefined;
            threadGroup.type = ThreadGroupType.Normal;
            threadGroup.description = '';
            threadGroup.visibility = ThreadGroupVisibility.Team;
            threadGroup.threadList.forEach(thread => Object.assign(thread, genInitialBaseEntity('thread')));
            return threadGroup;
        } else {
            // デフォルトスレッドグループがなければ新規作成
            const threadGroup = {
                projectId,
                description: '',
                title: '',
                type: ThreadGroupType.Normal,
                lastUpdate: new Date(),
                visibility: ThreadGroupVisibility.Team,
                threadList: [],
                ...genInitialBaseEntity('thread-group'),
            } as ThreadGroup;
            threadGroup.threadList.push(this.genInitialThreadEntity(threadGroup.id));
            return threadGroup;
        }
    }

    genInitialThreadEntity(threadGroupId: string): Thread {
        return {
            threadGroupId,
            inDto: {
                args: this.getInitialArgs() as ChatCompletionCreateParamsBase,
            },
            status: 'Normal',
            ...genInitialBaseEntity('thread'),
        };
    }

    getInitialArgs(): ChatCompletionCreateParamsWithoutMessages {
        return {
            model: 'gemini-1.5-pro-002',
            temperature: 0.7,
            max_tokens: 0,
            stream: true,
        };
    }

    // saveSettingsAsDefault(threadGroup: ThreadGroup): void {
    //     localStorage.setItem('settings-v2.0', JSON.stringify(threadGroup));
    // }

    upsertThreadGroup(projectId: string, threadGroup: ThreadGroupUpsertDto): Observable<ThreadGroup> {
        const inDto = Utils.clone(threadGroup);
        if (inDto.id?.startsWith('dummy-')) {
            inDto.id = undefined;
        }
        inDto.threadList.forEach(thread => {
            if (thread.id?.startsWith('dummy-')) {
                thread.id = undefined;
            }
            (thread as any).inDtoJson = JSON.stringify(thread.inDto);
        });
        return this.http.post<ThreadGroup>(`/user/project/${projectId}/thread-group`, inDto).pipe(tap(obj => {
            threadGroup.id = obj.id;
            obj.threadList.forEach((thread, index) => {
                threadGroup.threadList[index].id = thread.id;
                threadFormat(thread);
            });
        }));
    }


    getThreadGroupList(projectId: string, force: boolean = false): Observable<ThreadGroup[]> {
        if (force || !this.threadListMas[projectId]) {
            return this.http.get<ThreadGroup[]>(`/user/project/${projectId}/thread-group`).pipe(tap(), tap(objList => {
                // キャッシュ（threadListMas）に格納
                this.threadListMas[projectId] = objList;
                // threadListを整形
                objList.forEach(threadGroupResponseHandler);
            }));
        } else {
            // キャッシュ（threadListMas）から取得
            return of(this.threadListMas[projectId]);
        }
    }

    getThreadGroup(threadGroupId: string): Observable<ThreadGroup> {
        return this.http.get<ThreadGroup>(`/user/thread-group/${threadGroupId}`).pipe(tap(threadGroupResponseHandler));
    }

    moveThreadGroup(threadGroupId: string, projectId: string): Observable<ThreadGroup> {
        return this.http.put<ThreadGroup>(`/user/thread-group/${threadGroupId}`, { projectId }).pipe(tap(threadGroupResponseHandler));;
    }

    cloneThreadGroup(threadGroupId: string): Observable<ThreadGroup> {
        return this.http.post<ThreadGroup>(`/user/thread-group/clone/${threadGroupId}`, {}).pipe(tap(threadGroupResponseHandler));
    }

    cloneThread(threadId: string): Observable<Thread> {
        return this.http.post<Thread>(`/user/thread/clone/${threadId}`, {}).pipe(tap(thread => threadFormat(thread)));
    }

    deleteThreadGroup(threadGroupId: string): Observable<void> {
        return this.http.delete<void>(`/user/thread-group/${threadGroupId}`);
    }
}

@Injectable({ providedIn: 'root' })
export class MessageService {
    // private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    showMessageGroupIdListMas: { [threadId: string]: string[] } = {};

    messageGroupList: MessageGroupForView[] = [];
    messageList: MessageForView[] = [];

    messageGroupMas: { [messageGroupId: string]: MessageGroupForView } = {};
    messageMas: { [messageId: string]: MessageForView } = {};

    prevMessageGroupId: { [messageGroupId: string]: string } = {};
    nextMessageGroupId: { [messageGroupId: string]: string[] } = {};

    oldMessageId: { [messageId: string]: string } = {};
    newMessageId: { [messageId: string]: string[] } = {};

    /** メッセージのタイムスタンプを更新するだけ。 */
    updateTimestamp(type: 'message-group' | 'message', id: string): Observable<Message | MessageGroup> {
        return this.http.patch<MessageForView>(`/user/thread/${type}/${id}`, id);
    }

    getMessageGroupList(threadGroupId: string, page: number = 1, limit: number = 1000): Observable<{ messageGroups: MessageGroupForView[] }> {
        return this.http.get<{ messageGroups: MessageGroupForView[] }>(`/user/thread/${threadGroupId}/message-groups`, {
            params: { page: page.toString(), limit: limit.toString() },
        });
    }

    getMessageContentParts(message: MessageForView): Observable<ContentPart[]> {
        return this.http.get<ContentPart[]>(`/user/message/${message.id}/content-parts`).pipe(tap(list => {
            message.contents = list;
        }));
    }

    deleteMessageGroup(messageGroupId: string): Observable<{ message: string, target: MessageGroup }> {
        return this.http.delete<{ message: string, target: MessageGroup }>(`/user/message-group/${messageGroupId}`);
    }

    deleteContentPart(contentPartId: string): Observable<void> {
        return this.http.delete<void>(`/user/content-part/${contentPartId}`);
    }

    initMessageGroup(threadId: string, previousMessageGroupId?: string, role: ChatCompletionRole = 'system', contentParts: ContentPart[] = []): MessageGroupForView {
        const messageGroup: MessageGroupForView = {
            threadId,
            type: MessageGroupType.Single,
            role,
            seq: 0,
            previousMessageGroupId,
            lastUpdate: new Date(),
            selectedIndex: 0,
            messages: [],
            ...genInitialBaseEntity('message-group'),
        };
        const message = this.initMessage(messageGroup.id, contentParts);
        messageGroup.messages.push(message);
        return messageGroup;
    }

    initMessage(messageGroupId: string, contentParts: ContentPart[] = []): MessageForView {
        const message: MessageForView = {
            messageGroupId,
            subSeq: 0,
            label: (contentParts[0]?.text || '').substring(0, 250),
            lastUpdate: new Date(),
            seq: 0,
            contents: [],
            editing: 0, selected: false, status: MessageStatusType.Initial,
            ...genInitialBaseEntity('message'),
        };

        contentParts.forEach((contentPart, index) => {
            contentPart.messageId = message.id;
            contentPart.seq = index;
        });

        const contentPart = contentParts.length === 0 ? [this.initContentPart(message.id)] : contentParts;
        message.contents = contentPart;
        return message;
    }

    initContentPart(messageId: string, text: string = ''): ContentPart {
        const contentPart: ContentPart = {
            type: ContentPartType.Text,
            seq: 0,
            text,
            messageId,
            ...genInitialBaseEntity('content-part'),
        };

        return contentPart;
    }

    clear(): void {
        this.messageGroupList = [];
        this.messageList = [];
        this.messageGroupMas = {};
        this.messageMas = {};
        this.prevMessageGroupId = {};
        this.nextMessageGroupId = {};
        this.oldMessageId = {};
        this.newMessageId = {};
    }

    initThreadGroup(threadGroupId: string, page: number = 1, limit: number = 1000): Observable<{ messageGroups: MessageGroupForView[] }> {
        this.clear();
        return this.getMessageGroupList(threadGroupId, page, limit).pipe(tap(res => {
            this.messageGroupList = res.messageGroups;
            this.messageGroupList.sort((a, b) => a.seq - b.seq);
            this.messageGroupMas = this.messageGroupList.reduce((acc, messageGroup) => {
                //// 新規で増えたのでマスターを更新
                // 並び替え用
                if (messageGroup.previousMessageGroupId) {
                    this.prevMessageGroupId[messageGroup.id] = messageGroup.previousMessageGroupId;
                    this.nextMessageGroupId[messageGroup.previousMessageGroupId] = this.nextMessageGroupId[messageGroup.previousMessageGroupId] || [];
                    this.nextMessageGroupId[messageGroup.previousMessageGroupId].push(messageGroup.id);
                } else { /** 登録済みなので何もしない */ }

                acc[messageGroup.id] = messageGroup;
                messageGroup.messages.forEach(message => {
                    this.messageList.push(message);
                    this.messageList.sort((a, b) => a.seq - b.seq);
                    this.messageMas[message.id] = message;
                    message.contents = message.contents || [];

                    //// 新規で増えたのでマスターを更新
                    // 編集判定用
                    if (message.editedRootMessageId) {
                        this.oldMessageId[message.editedRootMessageId] = message.id;
                        this.newMessageId[message.id] = this.newMessageId[message.id] || [];
                        this.newMessageId[message.id].push(message.editedRootMessageId);
                    } else { /** 登録済みなので何もしない */ }

                });
                return acc;
            }, this.messageGroupMas);

            // messageGroupのselectedIndexを設定
            Object.keys(this.nextMessageGroupId).forEach(previousMessageGroupId => this.resetSelectedIndex(previousMessageGroupId));
        }));
    }

    resetSelectedIndex(previousMessageGroupId: string): number {
        const nextMessageGroupId = this.nextMessageGroupId[previousMessageGroupId];
        const tail = nextMessageGroupId.sort((a, b) => {
            // ソート条件：lastUpdate降順、seq降順
            if (this.messageGroupMas[a].lastUpdate > this.messageGroupMas[b].lastUpdate) return -1;
            if (this.messageGroupMas[a].lastUpdate < this.messageGroupMas[b].lastUpdate) return 1;
            return this.messageGroupMas[b].seq - this.messageGroupMas[a].seq; // seq降順
        })[0];
        // seqで昇順ソートしてselectedIndexを設定
        this.messageGroupMas[previousMessageGroupId].selectedIndex = nextMessageGroupId.sort((a, b) => this.messageGroupMas[a].seq - this.messageGroupMas[b].seq).findIndex(messageGroupId => messageGroupId === tail);
        return this.messageGroupMas[previousMessageGroupId].selectedIndex;
    }

    /**
     * コンテンツダウンロードの時にも使いたいので、this以外でも使えるようにしておく。
     * @param messageGroupMas 
     * @param threadId 
     * @param targetMessageGroupId 
     * @returns 
     */
    static rebuildMessageGroup(messageGroupMas: { [messageGroupId: string]: MessageGroup }, threadId: string, targetMessageGroupId?: string): string[] {
        // build serial message structure
        if (targetMessageGroupId) {
        } else {
            targetMessageGroupId = Object.values(messageGroupMas).filter(messageGroup => messageGroup.threadId === threadId).sort((a, b) => {
                // ソート条件：lastUpdate降順、seq降順
                if (a.lastUpdate > b.lastUpdate) return -1;
                if (a.lastUpdate < b.lastUpdate) return 1;
                return b.seq - a.seq; // seq降順
            })[0].id;
        }

        const showMessageGroupIdList = [targetMessageGroupId];
        while (messageGroupMas[targetMessageGroupId]) {
            const targetMessageGroup = messageGroupMas[targetMessageGroupId];
            if (targetMessageGroup.previousMessageGroupId) {
                showMessageGroupIdList.unshift(targetMessageGroup.previousMessageGroupId);
            } else {
            }
            targetMessageGroupId = targetMessageGroup.previousMessageGroupId as string;
        }
        // console.log(`showMessageGroupIdList: ${showMessageGroupIdList}`);
        return showMessageGroupIdList;
    }

    /**
     * 指定されたmessageGroupの後ろに来るmessageGroupのIDリストを取得する。
     * lastUpdateが古いものは取得しない。
     * @param messageGroup 
     * @returns 
     */
    getTailMessageGroupIds(messageGroup: MessageGroupForView): string[] {
        let targetMessageGroupId = messageGroup.id;
        const showMessageGroupIdList = [targetMessageGroupId];
        while (this.nextMessageGroupId[targetMessageGroupId]) {
            targetMessageGroupId = this.nextMessageGroupId[targetMessageGroupId].slice().sort((a, b) => {
                // ソート条件：lastUpdate降順、seq降順
                if (this.messageGroupMas[a].lastUpdate > this.messageGroupMas[b].lastUpdate) return -1;
                if (this.messageGroupMas[a].lastUpdate < this.messageGroupMas[b].lastUpdate) return 1;
                return this.messageGroupMas[b].seq - this.messageGroupMas[a].seq; // seq降順
            })[0];
            // 新しいものじゃなければselectedIndexをoutboundsさせて抜ける
            if (this.messageGroupMas[targetMessageGroupId].lastUpdate < messageGroup.lastUpdate) {
                messageGroup.selectedIndex = this.nextMessageGroupId[messageGroup.id].length;
                break;
            } else { }
            showMessageGroupIdList.push(targetMessageGroupId);
        }
        return showMessageGroupIdList;
    }

    rebuildThreadGroup(messageGroupMas: { [messageGroupId: string]: MessageGroup }): { [threadId: string]: string[] } {
        return Object.fromEntries(
            [...new Set(Object.values(messageGroupMas).map(group => group.threadId))]
                .map(threadId => {
                    const showMessageGroupIdList = MessageService.rebuildMessageGroup(messageGroupMas, threadId);
                    // selectedIndexをセットするために呼ぶ
                    this.getTailMessageGroupIds(messageGroupMas[showMessageGroupIdList[showMessageGroupIdList.length - 1]] as MessageGroupForView);
                    return [threadId, showMessageGroupIdList];
                })
        );
    }

    upsertSingleMessageGroup(orgMessageGroup: MessageGroupForView): Observable<MessageGroupForView> {
        const messageGroup = Utils.clone(orgMessageGroup);

        if (messageGroup.id.startsWith('dummy-')) {
            (messageGroup.id as any) = undefined;
        } else { }
        if (messageGroup.previousMessageGroupId === null) { // nullだとチェックに掛かるけどundefinedは掛からないのでnullをundefinedに変換
            messageGroup.previousMessageGroupId = undefined;
        } else { }
        messageGroup.messages.map((message, index) => {
            if (message.id.startsWith('dummy-')) {
                (message.id as any) = undefined;
            } else { }
            if (message.messageGroupId.startsWith('dummy-')) {
                (message.messageGroupId as any) = undefined;
            } else { }
            message.contents.map((content, index) => {
                if (content.id.startsWith('dummy-')) {
                    (content.id as any) = undefined;
                } else { }
                if (content.messageId.startsWith('dummy-')) {
                    (content.messageId as any) = undefined;
                } else { }
            });
        });
        return this.http.post<MessageGroupForView>(`/user/thread/${messageGroup.threadId}/message-group`, messageGroup).pipe(
            tap(savedMessageGroup => {
                // 要らないものを消す
                if (orgMessageGroup.id.startsWith('dummy-')) {
                    this.messageGroupList.splice(this.messageGroupList.indexOf(orgMessageGroup), 1);
                    delete this.messageGroupMas[orgMessageGroup.id];
                } else { }
                if (savedMessageGroup.previousMessageGroupId) {
                    this.prevMessageGroupId[orgMessageGroup.id] = savedMessageGroup.previousMessageGroupId;
                } else { }
                if (this.nextMessageGroupId[orgMessageGroup.id]) {
                    this.nextMessageGroupId[orgMessageGroup.id].forEach(nextMessageGroupId => {
                        this.messageGroupMas[nextMessageGroupId].previousMessageGroupId = savedMessageGroup.id;
                    });
                }
                orgMessageGroup.messages.map((message, index) => {
                    if (message.id.startsWith('dummy-')) {
                        this.messageList.splice(this.messageList.indexOf(orgMessageGroup.messages[index]), 1);
                        delete this.messageMas[orgMessageGroup.messages[index].id];
                    } else { }
                });
                this.applyMessageGroup(savedMessageGroup);
                // console.log(`this.applyMessageGroup`);
            }),
        );
    }

    addSingleMessageGroupDry(threadId: string, previousMessageGroupId: string | undefined, role: ChatCompletionRole, contents: ContentPart[], vars: any = {}): MessageGroupForView {
        const messageGroup = this.initMessageGroup(threadId, previousMessageGroupId, role, contents);
        messageGroup.previousMessageGroupId = previousMessageGroupId;
        return this.applyMessageGroup(messageGroup);
    }

    /**
     * ThreadEntityをコピーして新しいThreadEntityを生成する。
     * Message系のマスタに反映するのでMessageServiceで実装してしまった。
     * @param thread 
     * @returns 
     */
    cloneThreadDry(thread: Thread, newThreadId?: string): Observable<Thread> {
        const newThread = Utils.clone(thread);
        newThread.id = newThreadId ? newThreadId : genDummyId('thread');
        newThread.status = 'Normal';
        type IdRemap = { [oldId: string]: string };
        const idRemapTable: { messageGroup: IdRemap, message: IdRemap, contentPart: IdRemap, file: IdRemap } = { messageGroup: {}, message: {}, contentPart: {}, file: {} };
        // 対象スレッドのメッセージグループをコピー
        const messageGroupListObservable = safeForkJoin(
            this.messageGroupList
                .filter(messageGroup => messageGroup.threadId === thread.id)
                .map(messageGroup => {
                    const newMessageGroup = Utils.clone(messageGroup);
                    newMessageGroup.id = genDummyId('message-group');
                    idRemapTable.messageGroup[messageGroup.id] = newMessageGroup.id;
                    newMessageGroup.threadId = newThread.id;
                    newMessageGroup.previousMessageGroupId = messageGroup.previousMessageGroupId;
                    return safeForkJoin(
                        messageGroup.messages.map(message => {
                            // メッセージをコピー
                            const newMessage = Utils.clone(message);
                            newMessage.id = genDummyId('message');
                            idRemapTable.message[message.id] = newMessage.id;
                            newMessage.messageGroupId = newMessageGroup.id;
                            // コンテンツの有無を確認し、無ければ取得する
                            return (message.contents.length === 0 ? this.getMessageContentParts(message) : of(message.contents)).pipe(
                                tap(contents => {
                                    // console.log(`contents: ${JSON.stringify(contents)}`);
                                    newMessage.contents = contents.map(content => {
                                        // コンテンツをコピー
                                        const newContent = Utils.clone(content);
                                        newContent.id = genDummyId('content-part');
                                        idRemapTable.contentPart[content.id] = newContent.id;
                                        newContent.messageId = newMessage.id;
                                        // TODO fileIdがある場合はファイルをコピーする処理を入れ他方がいいかもしれないけど、一旦除外。ツリーモードを作った時に考える。
                                        return newContent;
                                    })
                                    // message.contents = [];
                                    // newMessage.contents = [];
                                    // console.log(`newMessage.contents: ${JSON.stringify(newMessage.contents)}`);
                                }),
                                map(() => newMessage), // コンテンツが取得できたらメッセージを返す
                            );
                        })
                    ).pipe(
                        tap(messages => newMessageGroup.messages = messages),
                        map(() => newMessageGroup), // メッセージが取得できたらメッセージグループを返す
                    );
                })
        );

        // 関連付けをリマップ
        return messageGroupListObservable.pipe(
            map(messageGroupList =>
                messageGroupList.map(messageGroup => {
                    if (messageGroup.previousMessageGroupId) {
                        messageGroup.previousMessageGroupId = idRemapTable.messageGroup[messageGroup.previousMessageGroupId] || messageGroup.previousMessageGroupId;
                    } else { }
                    if (messageGroup.editedRootMessageGroupId) {
                        messageGroup.editedRootMessageGroupId = idRemapTable.messageGroup[messageGroup.editedRootMessageGroupId] || messageGroup.editedRootMessageGroupId;
                    } else { }
                    messageGroup.messages.forEach(message => {
                        message.messageGroupId = idRemapTable.messageGroup[message.messageGroupId] || message.messageGroupId;
                        if (message.editedRootMessageId) {
                            message.editedRootMessageId = idRemapTable.message[message.editedRootMessageId] || message.editedRootMessageId;
                        } else { }
                        message.contents.forEach(content => {
                            content.messageId = idRemapTable.message[content.messageId] || content.messageId;
                        });
                    });
                    return messageGroup;
                })
            ),
            tap(messageGroupList =>
                messageGroupList.forEach(messageGroup => this.applyMessageGroup(messageGroup))
            ),
            map(() => newThread),
        );
    }

    // getLastTouchedMessageGroupIds(messageGroupList: MessageGroup[], threadId?: string): { [threadId: string]: string } {
    //     // TODO このメソッドは失敗しているかもしれない。そもそもこんなの要らなかったような気もする。previousMessageGroupIdでサマってソートすればいいだけな気がする。
    //     const groupedThreads = messageGroupList.filter(mg => !threadId || mg.threadId === threadId).reduce((acc, messageGroup) => {
    //         // threadIdごとにグループ化
    //         acc[messageGroup.threadId] = acc[messageGroup.threadId] || [];
    //         acc[messageGroup.threadId].push(messageGroup);
    //         return acc;
    //     }, {} as { [threadId: string]: MessageGroup[] });

    //     // 各スレッドで最後に編集されたIDを取得
    //     Object.values(groupedThreads).forEach(threadMessages => threadMessages.sort((a, b) => {
    //         // ソート条件：lastUpdate降順、seq降順
    //         if (a.lastUpdate > b.lastUpdate) return -1;
    //         if (a.lastUpdate < b.lastUpdate) return 1;
    //         return b.seq - a.seq; // seq降順
    //     }));

    //     return Object.keys(groupedThreads).reduce((acc, threadId) => {
    //         const lastMessageGroup = groupedThreads[threadId][0]; // ソート後の最初のIDを取得 
    //         const history = groupedThreads[threadId]
    //             .filter(mg => mg.previousMessageGroupId && mg.previousMessageGroupId === lastMessageGroup.previousMessageGroupId)
    //             .sort((a, b) => a.seq - b.seq); // seq昇順でソート
    //         const index = history.findIndex(mg => mg.id === lastMessageGroup.id);
    //         if (lastMessageGroup.previousMessageGroupId) {
    //             (messageGroupList.find(mg => mg.id === lastMessageGroup.previousMessageGroupId) as MessageGroupForView).selectedIndex = index;
    //         } else { }
    //         acc[threadId] = lastMessageGroup.id;
    //         return acc;
    //     }, {} as { [threadId: string]: string });
    // }


    // // メッセージグループの追加
    // addSingleMessageGroup(threadId: string, previousMessageGroupId: string | undefined, role: ChatCompletionRole, contents: ContentPart[], vars: any = {}): Observable<MessageGroupForView> {
    //     return this.upsertMessageWithContents(
    //         threadId, 'message-group',
    //         '', MessageGroupType.Single, role, previousMessageGroupId,
    //         '', 0, undefined, contents, vars
    //     );
    // }
    // upsertMessageWithContents(
    //     threadId: string,
    //     targetType: 'message' | 'message-group',

    //     messageGroupId: string,
    //     messageGroupType: MessageGroupType,
    //     role: ChatCompletionRole,
    //     previousMessageGroupId: string | undefined,

    //     messageId: string,
    //     messageSubSeq: number,
    //     cacheId: string | undefined,

    //     contents: ContentPart[],
    //     vars: any = {},
    // ): Observable<MessageGroupForView> {
    //     if (messageGroupId.startsWith('dummy-')) {
    //         (messageGroupId as any) = undefined;
    //     } else { }
    //     if (messageId?.startsWith('dummy-')) {
    //         (messageId as any) = undefined;
    //     } else { }
    //     const inDto = { messageGroupId, messageGroupType, role, previousMessageGroupId, messageId, messageSubSeq, cacheId, contents };
    //     return this.http.post<MessageUpsertResponseDto>(`/user/thread/${threadId}/${targetType}`, inDto).pipe(
    //         map(messageSet => this.applyMessageGroup(messageSet.messageGroup)),
    //     );
    // }

    applyMessageGroup(_messageGroup: MessageGroup): MessageGroupForView {
        const messageGroup = _messageGroup as MessageGroupForView;
        messageGroup.selectedIndex = 0;
        messageGroup.messages.sort((a, b) => a.seq - b.seq);

        if (this.messageGroupMas[messageGroup.id]) {
            // Object.assign(this.messageGroupMas[messageGroup.id], messageGroup);
            this.messageGroupMas[messageGroup.id] = messageGroup;
        } else {
            //// 新規で増えたのでマスターを更新
            // マスターに追加
            this.messageGroupList.push(messageGroup);
            this.messageGroupList.sort((a, b) => a.seq - b.seq);
            this.messageGroupMas[messageGroup.id] = messageGroup;

            // 並び替え用
            if (messageGroup.previousMessageGroupId) {
                this.prevMessageGroupId[messageGroup.id] = messageGroup.previousMessageGroupId;
                this.nextMessageGroupId[messageGroup.previousMessageGroupId] = this.nextMessageGroupId[messageGroup.previousMessageGroupId] || [];
                this.nextMessageGroupId[messageGroup.previousMessageGroupId].push(messageGroup.id);
                this.resetSelectedIndex(messageGroup.previousMessageGroupId);
            } else { /** 登録済みなので何もしない */ }
        }

        messageGroup.messages.map(message => {
            message.editing = 0;
            message.selected = false;
            message.status = MessageStatusType.Initial;

            if (this.messageMas[message.id]) {
                // Object.assign(this.messageMas[message.id], message);
                this.messageMas[message.id] = message;
            } else {
                //// 新規で増えたのでマスターを更新
                // マスターに追加
                this.messageList.push(message);
                this.messageList.sort((a, b) => a.seq - b.seq);
                this.messageMas[message.id] = message;

                // 編集判定用
                if (message.editedRootMessageId) {
                    this.oldMessageId[message.editedRootMessageId] = message.id;
                    this.newMessageId[message.id] = this.newMessageId[message.id] || [];
                    this.newMessageId[message.id].push(message.editedRootMessageId);
                } else { /** 登録済みなので何もしない */ }
            }
        });
        return messageGroup;
    }

    languageExtensions = {
        "typescript": "ts",
        "typescriptx": "tsx", // TypeScript with JSX
        "javascript": "js",
        "python": "py",
        "csharp": "cs",
        "ruby": "rb",
        "kotlin": "kt",
        "bash": "sh",           // Bash scripts typically use .sh
        "shell": "sh",          // General shell scripts
        "perl": "pl",
        "haskell": "hs",
        "rust": "rs",
        "objective-c": "m",
        "matlab": "m",
        "fortran": "f90",
        "pascal": "pas",
        "visualbasic": "vb",
        "elixir": "ex",
        "clojure": "clj",
        "erlang": "erl",
        "fsharp": "fs",
        "yaml": "yml",
        "markdown": "md",
        "vhdl": "vhd",
        "verilog": "v",
        "julia": "jl",
        "prolog": "pl",
        "ocaml": "ml",
        "scheme": "scm",
        "rexx": "rex",
        "smalltalk": "st",
        "powershell": "ps1"     // PowerShell scripts
    };

    downloadContent(threadGroupId: string): Observable<JSZip> {
        let counter = 0;
        return this.loadContentAll(threadGroupId).pipe(map(treadGroupContents => {
            const zip = new JSZip();
            treadGroupContents.forEach((threadContents, index) => {
                // 複数スレッドの場合はディレクトリを分ける。
                const directory = treadGroupContents.length > 1 ? `line-${index}/` : '';
                threadContents.forEach((contentList, index) => {
                    contentList.forEach((content, index) => {
                        if (content.type === 'text') {
                            // 奇数インデックスがコードブロックなので、それだけ抜き出す。
                            Utils.splitCodeBlock(content.text || '').filter((b, index) => index % 2 === 1).forEach(codeBlock => {
                                const codeLineList = codeBlock.split('\n');
                                let filename = `content-${counter}.txt`;
                                const header = codeLineList.shift() || ''; // 先頭行を破壊的に抽出
                                if (header.trim()) {
                                    const headers = header.trim().split(' ');
                                    const ext = (this.languageExtensions as any)[headers[0]] || headers[0];
                                    filename = headers[1] || `content-${counter}.${ext}`;
                                } else {
                                    // plain block
                                }
                                // ZIPにファイルを追加
                                zip.file(`${directory}${filename}`, codeLineList.join('\n'));
                                counter++;
                            });
                        } else {
                            // text以外のコンテンツは無視
                            // TODO 本来はファイルとしてダウンロードさせるべきかも・・？
                        }
                    });
                });
            });
            if (counter) {
                return zip;
            } else {
                throw new Error('コードブロックが含まれていないので何もしません。');
            }
        }));
    }

    loadContentAll(threadGroupId: string): Observable<ContentPart[][][]> {
        return this.getMessageGroupList(threadGroupId).pipe(switchMap(res => {
            // thisのモデルに影響を出さないように構築する
            const threadIdSet = new Set<string>();
            const messageMas: { [messageId: string]: MessageForView } = {};
            const messageGroupMas = res.messageGroups.reduce((acc, messageGroup) => {
                acc[messageGroup.id] = messageGroup;
                threadIdSet.add(messageGroup.threadId);
                messageGroup.messages.forEach(message => {
                    messageMas[message.id] = message;
                    message.contents = message.contents || [];
                });
                return acc;
            }, {} as { [messageGroupId: string]: MessageGroupForView });
            return safeForkJoin(Array.from(threadIdSet).map(threadId => {
                const messageList = MessageService.rebuildMessageGroup(messageGroupMas, threadId);
                return safeForkJoin(messageList.map(messageId => this.getMessageContentParts(messageMas[messageId])));
            }));
        }));
    }
}