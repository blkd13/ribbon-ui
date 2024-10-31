import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, of, switchMap, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { BaseEntity, ContentPart, ContentPartType, MessageClusterType, MessageForView, MessageGroup, MessageGroupListResponseDto, MessageGroupResponseDto, MessageGroupType, MessageUpsertDto, MessageUpsertResponseDto, Project, ProjectCreateDto, ProjectUpdateDto, Team, TeamCreateDto, TeamMember, TeamMemberAddDto, TeamMemberUpdateDto, TeamUpdateDto, Thread, ThreadCreateDto, ThreadUpdateDto, UUID } from '../models/project-models';
import JSZip from 'jszip'; // JSZipのインポート
import { Utils } from '../utils';
import { safeForkJoin } from '../utils/dom-utils';

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

@Injectable({ providedIn: 'root' })
export class ThreadService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    createThread(projectId: string, thread: ThreadCreateDto): Observable<Thread> {
        return this.http.post<Thread>(`/user/project/${projectId}/threads`, thread).pipe(map(threadFormat));
    }

    getThreadList(projectId: string): Observable<Thread[]> {
        return this.http.get<Thread[]>(`/user/project/${projectId}/threads`).pipe(tap(threadList => threadList.forEach(threadFormat)));
    }

    getThread(threadId: string): Observable<Thread> {
        return this.http.get<Thread>(`/user/thread/${threadId}`).pipe(map(threadFormat));
    }

    updateThread(threadId: string, thread: ThreadUpdateDto): Observable<Thread> {
        return this.http.patch<Thread>(`/user/thread/${threadId}`, thread).pipe(map(threadFormat));
    }

    moveThread(threadId: string, projectId: string): Observable<Thread> {
        return this.http.put<Thread>(`/user/thread/${threadId}`, { projectId }).pipe(map(threadFormat));
    }

    deleteThread(threadId: string): Observable<void> {
        return this.http.delete<void>(`/user/thread/${threadId}`);
    }
}

@Injectable({ providedIn: 'root' })
export class MessageService {
    private readonly authService: AuthService = inject(AuthService);
    private readonly http: HttpClient = inject(HttpClient);

    genDummyId(): string {
        return `dummy-${Date.now()}`;
    }

    generateInitialBaseEntity() {
        return {
            createdAt: new Date(), updatedAt: new Date(),
            createdBy: '', updatedBy: '',
        };
    }

    initMessageUpsertDto(threadId: string, args: any = {}): MessageGroupResponseDto {
        const messageUpsertDto = {
            id: this.genDummyId(), messageClusterId: this.genDummyId(), selectedIndex: 0, label: '',
            lastUpdate: new Date(), messages: [], role: 'user', seq: 0, threadId, type: MessageGroupType.Single,
            messageClusterType: MessageClusterType.Single, messageGroupType: MessageGroupType.Single,
            createdAt: new Date(), updatedAt: new Date(), previousMessageId: undefined,
        } as MessageGroupResponseDto;
        return Object.assign(messageUpsertDto, args);
    }

    initMessage(messageGroupId: string): MessageForView {
        return {
            id: this.genDummyId(),
            messageGroupId: messageGroupId,
            seq: 0,
            lastUpdate: new Date(),
            label: '',
            cacheId: undefined,
            contents: [],
            editing: 0,
            selected: false,
            status: 0,
            ...this.generateInitialBaseEntity(),
        };
    }

    initContentPart(messageId: string): ContentPart {
        return {
            id: this.genDummyId(),
            type: ContentPartType.Text,
            seq: 0,
            text: '',
            messageId,
            ...this.generateInitialBaseEntity(),
        };
    }

    upsertMessageWithContents(threadId: string, _message: MessageUpsertDto): Observable<MessageUpsertResponseDto> {
        // 中身書き換えるのでディープコピーしてから。
        const message = JSON.parse(JSON.stringify(_message)) as MessageUpsertDto;
        // ダミーだったら消しておく
        message.messageClusterId = ((message.messageClusterId && message.messageClusterId.startsWith('dummy-')) ? undefined : message.messageClusterId) || undefined;
        message.messageGroupId = ((message.messageGroupId && message.messageGroupId.startsWith('dummy-')) ? undefined : message.messageGroupId) || undefined;
        message.messageId = ((message.messageId && message.messageId.startsWith('dummy-')) ? undefined : message.messageId) || undefined;
        message.previousMessageId = message.previousMessageId || undefined;
        message.contents.forEach(_content => {
            const content = _content as any;
            ['id', 'messageId'].forEach(key => {
                // dummy-から始まるIDはダミーなので消しておく。
                if (content[key] && content[key].startsWith('dummy-')) { content[key] = undefined; }
            });
        })
        return this.http.post<MessageUpsertResponseDto>(`/user/thread/${threadId}/messages`, message).pipe(tap(res => {
            // ここの組み立てが雑。
            res.messageGroup.messages = [res.message];
            res.message.contents = res.contentParts as any;
        }));
    }

    /** メッセージのタイムスタンプを更新するだけ。 */
    updateTimestamp(threadId: string, _message: MessageForView): Observable<MessageForView> {
        return this.http.patch<MessageForView>(`/user/thread/${threadId}/messages`, _message);
    }

    getMessageGroupList(threadId: string, page: number = 1, limit: number = 1000): Observable<MessageGroupListResponseDto> {
        return this.http.get<MessageGroupListResponseDto>(`/user/thread/${threadId}/message-groups`, {
            params: { page: page.toString(), limit: limit.toString() },
            // headers: this.authService.getHeaders()
        }).pipe(tap(res => res.messageGroups.forEach(messageGroup => {
            messageGroup.messages.forEach(message => message.contents = []);
            messageGroup.messageGroupType = (messageGroup as any).type;
            messageGroup.messageClusterType = MessageClusterType.Single;
            messageGroup.messageClusterId = messageGroup.messageClusterId || 'dummy';
        })));
    }

    // getMessageGroupDetails(messageGroupId: string): Observable<MessageGroupDetailsResponseDto> {
    //     return this.http.get<MessageGroupDetailsResponseDto>(`/user/message-group/${messageGroupId}`);
    // }

    getMessageContentParts(message: MessageForView): Observable<ContentPart[]> {
        return this.http.get<ContentPart[]>(`/user/message/${message.id}/content-parts`).pipe(tap(list => {
            message.contents = list;
        }));
    }

    deleteMessageGroup(messageGroupId: string): Observable<{ message: string, target: MessageGroup }> {
        return this.http.delete<{ message: string, target: MessageGroup }>(`/user/message-group/${messageGroupId}`);
    }

    deleteMessage(messageId: string): Observable<void> {
        return this.http.delete<void>(`/user/message/${messageId}`);
    }

    deleteContentPart(contentPartId: string): Observable<void> {
        return this.http.delete<void>(`/user/content-part/${contentPartId}`);
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

    downloadContent(threadId: string): Observable<JSZip> {
        let counter = 0;
        return this.loadContentAll(threadId).pipe(map(contents => {
            const zip = new JSZip();
            contents.forEach((contentList, index) => {
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
                            zip.file(filename, codeLineList.join('\n'));
                            counter++;
                        });
                    } else {
                        // text以外のコンテンツは無視
                        // TODO 本来はファイルとしてダウンロードさせるべきかも・・？
                    }
                });
            });
            if (counter) {
                return zip;
            } else {
                throw new Error('コードブロックが含まれていないので何もしません。');
            }
        }));
    }

    loadContentAll(threadId: string): Observable<ContentPart[][]> {
        return this.getMessageGroupList(threadId).pipe(switchMap(messageGroup => {
            const threadMessageObject = this.initializeThread(messageGroup.messageGroups);
            const messageList = this.rebuildMessageList(threadMessageObject.messageGroupListAll, threadMessageObject.previousMessageIdMap);
            const contents = messageList.map(message => this.getMessageContentParts(message));
            return safeForkJoin(contents);
        }));
    }

    initializeThread(messageGroups: MessageGroupResponseDto[]): {
        messageGroupListAll: MessageGroupResponseDto[],
        messageMap: Record<UUID, MessageForView>,
        messageGroupMap: Record<UUID, MessageGroupResponseDto>,
        previousMessageIdMap: Record<UUID, MessageGroupResponseDto>,
        rootMessageGroup: MessageGroupResponseDto,
    } {
        const messageGroupListAll = messageGroups;

        // MessageGroupResponseDto の selectedIndex を設定する
        messageGroups.forEach(this.selectLatest);

        // previoudMessageId（一個前のメッセージID）が無いもをRootとして取り出しておく。
        let rootMessageGroup = messageGroups.find(messageGroup => !messageGroup.previousMessageId);
        if (rootMessageGroup) {
        } else {
            throw new Error('Root not found');
        }

        // ID, MessageForView のモデル化
        const messageMap = messageGroups.reduce((prev, curr) => {
            curr.messages.forEach(message => prev[message.id] = message);
            return prev;
        }, {} as Record<UUID, MessageForView>);

        // ID, MessageGroupResponseDto のモデル化
        const messageGroupMap = messageGroups.reduce((prev, curr) => {
            prev[curr.id] = curr;
            return prev;
        }, {} as Record<UUID, MessageGroupResponseDto>);

        // ツリーを作る
        const previousMessageIdMap = messageGroups.reduce((prev, curr) => {
            if (curr.previousMessageId) {
                if (prev[curr.previousMessageId]) {
                    // ツリー構造としてmessagePreviousIDが被るのはおかしい。分岐はmessageGroupで行われるべきであって。
                    // throw Error('Model error');
                    // おかしいけどなってしまったものは仕方ないのでそのまま動かす。
                    // TODO 後でモデル側も更新するようにする。
                    curr.messages.unshift(...prev[curr.previousMessageId].messages);
                    curr.selectedIndex = curr.messages.length - 1;
                    console.log(`curr.selectedIndex=${curr.selectedIndex}`);
                    prev[curr.previousMessageId] = curr;
                } else {
                    prev[curr.previousMessageId] = curr;
                }
            } else { /** rootは無視 */ }
            return prev;
        }, {} as Record<UUID, MessageGroupResponseDto>);

        const mas = {
            messageGroupListAll,
            messageMap,
            messageGroupMap,
            previousMessageIdMap,
            rootMessageGroup,
        }
        return mas;
    }
    rebuildMessageList(
        messageGroups: MessageGroupResponseDto[],
        previousMessageIdMap: Record<UUID, MessageGroupResponseDto>,
    ): MessageForView[] {
        // MessageGroupResponseDto の selectedIndex を設定する
        messageGroups.forEach(this.selectLatest);

        // previoudMessageId（一個前のメッセージID）が無いもをRootとして取り出しておく。
        const rootMessageGroup = messageGroups.find(messageGroup => !messageGroup.previousMessageId);
        if (rootMessageGroup) {
        } else {
            throw new Error('Root not found');
        }

        // 表示するメッセージ一覧
        const messageList: MessageForView[] = [];
        if (rootMessageGroup.messages[rootMessageGroup.selectedIndex]) {
            // 先頭にルートを設定
            messageList.push(rootMessageGroup.messages[rootMessageGroup.selectedIndex]);
        } else {
            return [];
        }
        while (true) {
            const message = messageList[messageList.length - 1];
            // 先行後続マップ
            const messageGroup = previousMessageIdMap[message.id];
            if (messageGroup) {
                // inputAreaに相当する場合はselectedIndexがOutOfBoundしてるのでselectedMessageがnullになるはず。
                const selectedMessage = messageGroup.messages[messageGroup.selectedIndex];
                if (selectedMessage) {
                    // 選択メッセージリスト
                    messageList.push(selectedMessage);
                } else {
                    // 選択メッセージが無い = inputAreaなので打ち止め
                    break;
                }
            } else {
                break;
            }
        }
        return messageList;
    }

    selectLatest(messageGroup: MessageGroupResponseDto): number {
        const ary = messageGroup.messages;
        if (ary.length === 0) {
            // throw new Error("Array is empty");
            messageGroup.selectedIndex = 0;
            return 0;
        }
        let latestIndex = 0;
        // updateだと途中でキャッシュ作ると逆転するのでcreateを使う。
        let latestDate = ary[0].createdAt;
        for (let i = 1; i < ary.length; i++) {
            if (ary[i].createdAt > latestDate) {
                latestDate = ary[i].createdAt;
                latestIndex = i;
            }
        }
        messageGroup.selectedIndex = latestIndex;
        return latestIndex;
    }
}