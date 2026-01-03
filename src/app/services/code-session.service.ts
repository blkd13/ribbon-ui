import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
    AssistantMessage,
    CodeProject,
    CodeSession,
    CodeSessionMessage,
    FileHistorySnapshot,
    FileModification,
    MessageTreeNode,
    SearchResult,
    SessionFilter,
    SessionStatistics,
    SummaryMessage,
    SystemMessage,
    TimelineEvent,
    ToolCallPair,
    ToolUseContent,
    UserMessage,
} from '../models/code-session-models';
import { safeForkJoin } from '../utils/dom-utils';

/**
 * Code Session Service
 * JSONLファイルからセッションデータを読み込み、解析する
 */
@Injectable({
    providedIn: 'root'
})
export class CodeSessionService {
    private readonly BASE_PATH = '/cc-session-sample/projects';
    private projectsCache: Map<string, CodeProject> = new Map();
    private http = inject(HttpClient);

    /**
     * 全プロジェクトを取得
     */
    getProjects(): Observable<CodeProject[]> {
        // cc-session-sample/projects ディレクトリから全プロジェクトを取得
        // 実際のプロジェクトリストは固定（サンプルデータの構造から）
        const projectNames = [
            '-mnt-c-Users-blkd1-Music-chako',
            '-mnt-c-Users-blkd1-workspace-ETC-kurihara-kenchiku-visualizer-backend',
            '-mnt-c-Users-blkd1-workspace-ETC-kurihara-kenchiku-visualizer-frontend',
            '-mnt-c-Users-blkd1-workspace-ETC-kurihara-kenchiku-wagshi-scrape',
            '-mnt-c-Users-blkd1-workspace-ETC-photobuket',
            '-mnt-c-Users-blkd1-workspace-GPT-reddit-topic-finder',
            '-mnt-c-Users-blkd1-workspace-js',
        ];

        // 各プロジェクトのセッションファイルリストを取得してプロジェクト情報を構築
        const projectRequests = projectNames.map(name =>
            this.getProjectInfo(name).pipe(
                catchError(err => {
                    console.error(`Failed to load project ${name}:`, err);
                    return of(null);
                })
            )
        );

        return forkJoin(projectRequests).pipe(
            map(projects => projects.filter(p => p !== null) as CodeProject[])
        );
    }

    /**
     * プロジェクト情報を取得
     */
    private getProjectInfo(projectName: string): Observable<CodeProject> {
        // プロジェクトディレクトリ内のJSONLファイル一覧を取得
        // ここではサンプルとして決め打ち（実際は動的に取得すべき）
        return this.getProjectSessionIds(projectName).pipe(
            map(sessionIds => {
                const displayName = this.getDisplayName(projectName);
                const path = projectName.replace('-mnt-c-Users-blkd1-', '/Users/blkd1/');

                return {
                    name: projectName,
                    displayName,
                    path,
                    sessions: [],
                    lastActivity: new Date().toISOString(),
                    totalMessages: 0,
                    sessionCount: sessionIds.length,
                };
            })
        );
    }

    /**
     * プロジェクトのセッションIDリストを取得
     */
    private getProjectSessionIds(projectName: string): Observable<string[]> {
        // 実際のファイルシステム構造に基づいて返す
        // ここではサンプルデータの実際のファイル名を返す
        const sessionIdMap: { [key: string]: string[] } = {
            '-mnt-c-Users-blkd1-Music-chako': [
                '086b0e40-7781-49d4-a9ca-bfec68e0b546',
                '5576cf68-1dff-439b-a31a-e5f44e2b0f41',
                '904cc05c-ac71-4150-8ad9-504c32377c7a',
                'b373a5f8-0826-4ec6-a5c7-271367f1e805',
                'd479971c-b7e0-4671-89a8-a4c001243e39',
            ],
            '-mnt-c-Users-blkd1-workspace-ETC-kurihara-kenchiku-visualizer-backend': [
                '521a2f40-cb0d-4759-a16b-020fce544064',
                '6deba95b-d571-4df4-a6eb-b74262ffe1d4',
                '7d7e9440-fd7a-41f4-8136-1a6309b9bebd',
                'db2e0a93-9971-4a59-84c4-b2c515b6d9ce',
            ],
            '-mnt-c-Users-blkd1-workspace-ETC-kurihara-kenchiku-visualizer-frontend': [
                '20290269-b4d4-4525-97fb-8551eaa13f1d',
                '561d0525-ac1a-4fc0-a67e-fc41f1e4ff73',
                'd10e5e56-0877-43ee-b487-271fd4a85b7e',
            ],
            '-mnt-c-Users-blkd1-workspace-ETC-kurihara-kenchiku-wagshi-scrape': [
                '9a39b6ef-fa84-4422-93e6-0819b33ff7f9',
                'b941c180-9f7e-418c-a83c-45ca888d70fe',
                'd9b84717-0786-4576-83c8-8ba7e6a19132',
            ],
            '-mnt-c-Users-blkd1-workspace-ETC-photobuket': [
                '028ea61c-40e5-4558-a617-2ebae4f3cd2b',
                '3cb5108c-8a1e-402a-a91e-d0e27a858289',
                'db5c0cb1-e70a-4924-a77a-546682fee4bc',
            ],
            '-mnt-c-Users-blkd1-workspace-GPT-reddit-topic-finder': [
                'f52e7624-34d3-4e6d-a8fc-c64c0127fc4e',
            ],
            '-mnt-c-Users-blkd1-workspace-js': [
                '55c61184-3651-4113-a12b-f0f2f112eb64',
                '8e86ed1d-6723-420c-9354-695699b5c8b5',
            ],
            // 他のプロジェクトも同様に追加
        };

        return of(sessionIdMap[projectName] || []);
    }

    private getDisplayName(projectName: string): string {
        return projectName
            .replace('-mnt-c-Users-blkd1-', '')
            .replace(/-/g, '/')
            .replace('workspace/', '')
            .replace('Music/', '🎵 ');
    }

    /**
     * プロジェクト内の全セッションを取得
     */
    getSessions(projectName: string): Observable<(CodeSession | null)[]> {
        return this.getProjectSessionIds(projectName).pipe(
            switchMap(sessionIds => {
                if (sessionIds.length === 0) return of([]);

                const requests = sessionIds.map(sessionId =>
                    this.http
                        .get(`${this.BASE_PATH}/${projectName}/${sessionId}.jsonl`, { responseType: 'text' })
                        .pipe(
                            map(text => this.parseJsonl(text, projectName, sessionId)),
                            catchError(err => {
                                console.error(`Failed to load session ${sessionId}:`, err);
                                return of(null);
                            })
                        )
                );

                // safeForkJoin は Observable<(CodeSession|null)[]> を返す想定
                return safeForkJoin(requests);
            }),
        );
    }

    /**
     * JSONLファイルをパース
     */
    private parseJsonl(text: string, projectName: string, sessionId: string): CodeSession {
        const lines = text.split('\n').filter(line => line.trim());
        const messages: CodeSessionMessage[] = [];

        for (const line of lines) {
            try {
                const json = JSON.parse(line);
                messages.push(json);
            } catch (err) {
                console.error('Failed to parse JSON line:', err);
            }
        }

        // セッション情報を構築
        const firstMessage = messages[0];
        const lastMessage = messages[messages.length - 1];

        let startTime = new Date().toISOString();
        let endTime: string | undefined;

        if (firstMessage && 'timestamp' in firstMessage && firstMessage.timestamp) {
            startTime = firstMessage.timestamp;
        }
        if (lastMessage && 'timestamp' in lastMessage && lastMessage.timestamp) {
            endTime = lastMessage.timestamp;
        }

        return {
            sessionId,
            projectName,
            projectPath: projectName.replace('-mnt-c-Users-blkd1-', '/Users/blkd1/'),
            startTime,
            endTime,
            messageCount: messages.length,
            messages,
        };
    }

    /**
     * 特定のセッションを取得
     */
    getSession(projectName: string, sessionId: string): Observable<CodeSession | null> {
        return this.getSessions(projectName).pipe(
            map(sessions => sessions.find(s => s && s.sessionId === sessionId) || null)
        );
    }

    /**
     * セッションの統計情報を計算
     */
    calculateStatistics(session: CodeSession): SessionStatistics {
        const stats: SessionStatistics = {
            totalMessages: session.messages.length,
            userMessages: 0,
            assistantMessages: 0,
            snapshotMessages: 0,
            systemMessages: 0,
            summaryMessages: 0,
            toolCalls: 0,
            toolsByName: new Map(),
            filesModified: 0,
            modifiedFiles: 0, // エイリアス
            filesByExtension: new Map(),
            duration: 0,
            startTime: session.startTime,
            endTime: session.endTime || new Date().toISOString(),
            tokenUsage: {
                totalInputTokens: 0,
                totalOutputTokens: 0,
                cacheHitTokens: 0,
                cacheCreationTokens: 0,
            },
            totalTokens: 0,
            modelUsage: new Map(),
        };

        // メッセージを解析
        session.messages.forEach(msg => {
            switch (msg.type) {
                case 'user':
                    stats.userMessages++;
                    break;
                case 'assistant':
                    stats.assistantMessages++;
                    const assistantMsg = msg as AssistantMessage;

                    // トークン使用量を集計
                    if (assistantMsg.message.usage) {
                        const usage = assistantMsg.message.usage;
                        stats.tokenUsage!.totalInputTokens += usage.input_tokens || 0;
                        stats.tokenUsage!.totalOutputTokens += usage.output_tokens || 0;
                        stats.tokenUsage!.cacheHitTokens += usage.cache_read_input_tokens || 0;
                        stats.tokenUsage!.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
                    }

                    // モデル使用回数を集計
                    if (assistantMsg.message.model) {
                        const count = stats.modelUsage!.get(assistantMsg.message.model) || 0;
                        stats.modelUsage!.set(assistantMsg.message.model, count + 1);
                    }

                    // ツール呼び出しを集計
                    if (Array.isArray(assistantMsg.message.content)) {
                        assistantMsg.message.content.forEach(content => {
                            if (content.type === 'tool_use') {
                                stats.toolCalls++;
                                const toolCount = stats.toolsByName.get(content.name) || 0;
                                stats.toolsByName.set(content.name, toolCount + 1);
                            }
                        });
                    }
                    break;
                case 'file-history-snapshot':
                    stats.snapshotMessages++;
                    const snapshot = msg as FileHistorySnapshot;
                    const fileCount = Object.keys(snapshot.snapshot.trackedFileBackups).length;
                    stats.filesModified += fileCount;

                    // ファイル拡張子を集計
                    Object.keys(snapshot.snapshot.trackedFileBackups).forEach(filePath => {
                        const ext = this.getFileExtension(filePath);
                        if (ext) {
                            const count = stats.filesByExtension.get(ext) || 0;
                            stats.filesByExtension.set(ext, count + 1);
                        }
                    });
                    break;
                case 'summary':
                    stats.summaryMessages++;
                    break;
                case 'system':
                    stats.systemMessages++;
                    break;
            }
        });

        // 期間を計算
        const start = new Date(stats.startTime).getTime();
        const end = new Date(stats.endTime).getTime();
        stats.duration = end - start;

        // 総トークン数を計算
        if (stats.tokenUsage) {
            stats.totalTokens = stats.tokenUsage.totalInputTokens + stats.tokenUsage.totalOutputTokens;
        }

        // modifiedFilesをfilesModifiedと同期
        stats.modifiedFiles = stats.filesModified;

        return stats;
    }

    /**
     * メッセージツリーを構築
     */
    buildMessageTree(messages: CodeSessionMessage[]): MessageTreeNode[] {
        const nodeMap = new Map<string, MessageTreeNode>();
        const roots: MessageTreeNode[] = [];

        // 全メッセージをノード化
        messages.forEach((msg, index) => {
            if ('uuid' in msg && msg.uuid) {
                nodeMap.set(msg.uuid, {
                    message: msg,
                    children: [],
                    depth: 0,
                    isExpanded: true,
                    index,
                });
            }
        });

        // 親子関係を構築
        messages.forEach(msg => {
            if ('uuid' in msg && msg.uuid) {
                const node = nodeMap.get(msg.uuid)!;
                if ('parentUuid' in msg && msg.parentUuid && nodeMap.has(msg.parentUuid)) {
                    const parent = nodeMap.get(msg.parentUuid)!;
                    node.depth = parent.depth + 1;
                    parent.children.push(node);
                } else {
                    roots.push(node);
                }
            }
        });

        return roots;
    }

    /**
     * ツール呼び出しペアを抽出
     */
    extractToolCallPairs(messages: CodeSessionMessage[]): ToolCallPair[] {
        const pairs: ToolCallPair[] = [];
        const toolUseMap = new Map<string, { message: AssistantMessage; tool: ToolUseContent }>();

        messages.forEach(msg => {
            if (msg.type === 'assistant') {
                const assistantMsg = msg as AssistantMessage;
                if (Array.isArray(assistantMsg.message.content)) {
                    assistantMsg.message.content.forEach(content => {
                        if (content.type === 'tool_use') {
                            toolUseMap.set(content.id, {
                                message: assistantMsg,
                                tool: content as ToolUseContent,
                            });
                        }
                    });
                }
            } else if (msg.type === 'user') {
                const userMsg = msg as UserMessage;
                if (userMsg.toolUseResult && Array.isArray(userMsg.message.content)) {
                    userMsg.message.content.forEach(content => {
                        if (content.type === 'tool_result') {
                            const toolUseId = content.tool_use_id;
                            if (toolUseMap.has(toolUseId)) {
                                const { message, tool } = toolUseMap.get(toolUseId)!;

                                const duration = this.calculateDuration(
                                    message.timestamp || '',
                                    userMsg.timestamp || ''
                                );

                                pairs.push({
                                    toolUse: {
                                        id: tool.id,
                                        name: tool.name,
                                        input: tool.input,
                                        message,
                                        timestamp: message.timestamp || '',
                                    },
                                    call: { // エイリアス（テンプレート互換性）
                                        id: tool.id,
                                        toolName: tool.name,
                                        parameters: tool.input,
                                        timestamp: message.timestamp || '',
                                    },
                                    toolResult: {
                                        content: content.content,
                                        result: userMsg.toolUseResult || {},
                                        message: userMsg,
                                        timestamp: userMsg.timestamp || '',
                                        duration,
                                    },
                                    result: { // エイリアス（テンプレート互換性）
                                        success: !userMsg.toolUseResult?.['error'],
                                        output: typeof content.content === 'string' ? content.content : JSON.stringify(content.content),
                                        error: userMsg.toolUseResult?.['error'],
                                    },
                                });

                                toolUseMap.delete(toolUseId);
                            }
                        }
                    });
                }
            }
        });

        // 結果が見つからなかったツール呼び出し
        toolUseMap.forEach(({ message, tool }) => {
            pairs.push({
                toolUse: {
                    id: tool.id,
                    name: tool.name,
                    input: tool.input,
                    message,
                    timestamp: message.timestamp || '',
                },
                call: { // エイリアス（テンプレート互換性）
                    id: tool.id,
                    toolName: tool.name,
                    parameters: tool.input,
                    timestamp: message.timestamp || '',
                },
            });
        });

        return pairs;
    }

    /**
     * ファイル変更履歴を抽出
     */
    extractFileModifications(messages: CodeSessionMessage[]): FileModification[] {
        const modifications: FileModification[] = [];

        messages.forEach(msg => {
            if (msg.type === 'file-history-snapshot') {
                const snapshot = msg as FileHistorySnapshot;
                Object.entries(snapshot.snapshot.trackedFileBackups).forEach(([filePath, backup]) => {
                    modifications.push({
                        filePath,
                        version: backup.version,
                        backupFileName: backup.backupFileName,
                        backupTime: backup.backupTime,
                        messageId: snapshot.messageId,
                        message: snapshot,
                    });
                });
            }
        });

        return modifications;
    }

    /**
     * タイムラインイベントを生成
     */
    generateTimeline(messages: CodeSessionMessage[]): TimelineEvent[] {
        const events: TimelineEvent[] = [];
        const toolCallMap = new Map<string, { call: any; callTimestamp: string; assistantMessage: CodeSessionMessage }>();

        messages.forEach((msg, index) => {
            // summaryメッセージにはtimestampがないため、leafUuidを使って対応するメッセージを探す
            let timestamp: string;

            if (msg.type === 'summary') {
                // サマリーメッセージの場合、leafUuidに対応するメッセージのタイムスタンプを使用
                const leafUuid = (msg as SummaryMessage).leafUuid;
                const leafMessage = messages.find(m => 'uuid' in m && m.uuid === leafUuid);
                timestamp = leafMessage && 'timestamp' in leafMessage ? leafMessage.timestamp! : new Date().toISOString();
            } else if (!('timestamp' in msg) || !msg.timestamp) {
                // タイムスタンプがない場合はスキップ
                return;
            } else {
                timestamp = msg.timestamp;
            }

            // メッセージタイプに応じたイベントを生成
            switch (msg.type) {
                case 'user':
                    // ツール実行結果を持つユーザーメッセージ
                    if ((msg as UserMessage).toolUseResult) {
                        const userMsg = msg as UserMessage;
                        const toolResult = userMsg.toolUseResult!;

                        // tool_use_idを探す
                        let toolUseId: string | undefined;
                        let toolName = 'Unknown Tool';

                        // message.contentからtool_use_idを取得
                        if (Array.isArray(userMsg.message.content)) {
                            const toolResultContent = userMsg.message.content.find((c: any) => c.type === 'tool_result') as any;
                            if (toolResultContent) {
                                toolUseId = toolResultContent.tool_use_id;
                            }
                        }

                        const success = !toolResult['error'];

                        if (toolUseId && toolCallMap.has(toolUseId)) {
                            // 対応するツール呼び出しが見つかった場合、ペアイベントを作成
                            const callInfo = toolCallMap.get(toolUseId)!;
                            toolName = callInfo.call.name;

                            events.push({
                                timestamp: callInfo.callTimestamp,
                                type: 'tool-pair',
                                message: callInfo.assistantMessage,
                                description: `🔧 ${toolName}`,
                                icon: this.getToolIcon(toolName),
                                color: success ? 'primary' : 'warn',
                                toolCall: {
                                    name: callInfo.call.name,
                                    input: callInfo.call.input,
                                    timestamp: callInfo.callTimestamp
                                },
                                toolResult: {
                                    success,
                                    output: toolResult['output'] || JSON.stringify(toolResult, null, 2),
                                    error: toolResult['error'],
                                    timestamp
                                }
                            });

                            // マップから削除
                            toolCallMap.delete(toolUseId);
                        } else {
                            // 対応するツール呼び出しが見つからない場合、単独で表示
                            // toolNameをtoolUseResultから推測
                            toolName = toolResult['toolName'] || 'Unknown Tool';

                            events.push({
                                timestamp,
                                type: 'tool-execution',
                                message: msg,
                                description: `🔧 ${toolName}を実行${success ? '成功' : '失敗'}`,
                                icon: this.getToolIcon(toolName),
                                color: success ? 'primary' : 'warn',
                                details: toolResult['error'] || JSON.stringify(toolResult, null, 2).substring(0, 200)
                            });
                        }
                    } else {
                        // 通常のユーザーメッセージ
                        const content = (msg as UserMessage).message.content;
                        const textContent = typeof content === 'string' ? content :
                            Array.isArray(content) ? this.extractTextFromContent(content) : '';

                        if (textContent) {
                            events.push({
                                timestamp,
                                type: 'user',
                                message: msg,
                                // description: `💬 ユーザー: ${this.truncate(textContent, 100)}`,
                                description: textContent,
                                icon: 'person',
                                color: 'primary',
                            });
                        }
                    }
                    break;

                case 'assistant':
                    const content = (msg as AssistantMessage).message.content;
                    const textContent = Array.isArray(content)
                        ? this.extractTextFromContent(content)
                        : content;

                    // アシスタントメッセージからツール使用を抽出
                    if (Array.isArray(content)) {
                        content.forEach((item: any) => {
                            if (item.type === 'tool_use') {
                                // ツール呼び出しを一時保存（後でツール実行結果とペアリング）
                                toolCallMap.set(item.id, {
                                    call: item,
                                    callTimestamp: timestamp,
                                    assistantMessage: msg
                                });
                            }
                        });
                    }

                    // アシスタントのテキスト応答
                    if (textContent) {
                        events.push({
                            timestamp,
                            type: 'assistant',
                            message: msg,
                            // description: `🤖 アシスタント: ${this.truncate(textContent, 100)}`,
                            description: textContent,
                            icon: 'smart_toy',
                            color: 'accent',
                        });
                    }
                    break;

                case 'file-history-snapshot':
                    const fileCount = Object.keys((msg as FileHistorySnapshot).snapshot.trackedFileBackups).length;
                    events.push({
                        timestamp,
                        type: 'file-history-snapshot',
                        message: msg,
                        description: `📁 ファイルスナップショット (${fileCount}ファイル)`,
                        icon: 'history',
                        color: 'warn',
                    });
                    break;

                case 'summary':
                    events.push({
                        timestamp,
                        type: 'summary',
                        message: msg,
                        // description: `📝 サマリー: ${this.truncate((msg as SummaryMessage).summary, 100)}`,
                        description: (msg as SummaryMessage).summary,
                        icon: 'summarize',
                        color: 'primary',
                    });
                    break;

                case 'system':
                    const systemContent = (msg as SystemMessage).content || 'System event';
                    const subtype = (msg as SystemMessage).subtype;
                    events.push({
                        timestamp,
                        type: 'system',
                        message: msg,
                        description: `⚙️ ${subtype ? `[${subtype}] ` : ''}${systemContent}`,
                        icon: 'settings',
                        color: '',
                    });
                    break;
            }
        });

        // ペアリングされなかったツール呼び出しを個別イベントとして追加
        toolCallMap.forEach((callInfo, toolUseId) => {
            events.push({
                timestamp: callInfo.callTimestamp,
                type: 'tool-call',
                message: callInfo.assistantMessage,
                description: `🛠️ ${callInfo.call.name}を呼び出し（結果なし）`,
                icon: this.getToolIcon(callInfo.call.name),
                color: 'accent',
                // details: JSON.stringify(callInfo.call.input, null, 2).substring(0, 200)
                details: JSON.stringify(callInfo.call.input, null, 2)
            });
        });

        // タイムスタンプでソート
        return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    private getToolIcon(toolName: string): string {
        const iconMap: { [key: string]: string } = {
            'Bash': 'terminal',
            'BashOutput': 'output',
            'Edit': 'edit',
            'Read': 'visibility',
            'Write': 'create',
            'Glob': 'search',
            'Grep': 'manage_search',
            'TodoWrite': 'checklist',
            'WebFetch': 'language',
        };
        return iconMap[toolName] || 'build';
    }

    /**
     * セッションを検索/フィルタ
     */
    searchSessions(sessions: CodeSession[], filter: SessionFilter): SearchResult[] {
        return sessions
            .filter(session => {
                // 日付フィルタ
                if (filter.dateFrom && session.startTime < filter.dateFrom) return false;
                if (filter.dateTo && session.startTime > filter.dateTo) return false;

                // メッセージ数フィルタ
                if (filter.minMessages && session.messageCount < filter.minMessages) return false;
                if (filter.maxMessages && session.messageCount > filter.maxMessages) return false;

                // ファイル変更フィルタ
                if (filter.hasFileChanges) {
                    const hasFileChanges = session.messages.some(m => m.type === 'file-history-snapshot');
                    if (!hasFileChanges) return false;
                }

                return true;
            })
            .map(session => {
                let matchedMessages: CodeSessionMessage[] = [];
                let relevanceScore = 0;

                // テキスト検索
                if (filter.searchQuery) {
                    matchedMessages = session.messages.filter(msg => {
                        const searchText = this.getMessageText(msg).toLowerCase();
                        return searchText.includes(filter.searchQuery!.toLowerCase());
                    });
                    relevanceScore = matchedMessages.length / session.messages.length;
                }

                return {
                    session,
                    matchedMessages: matchedMessages.length > 0 ? matchedMessages : session.messages,
                    relevanceScore,
                };
            })
            .filter(result => !filter.searchQuery || result.matchedMessages.length > 0)
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // ========================================================================
    // Private Helper Methods
    // ========================================================================

    private getFileExtension(filePath: string): string {
        const match = filePath.match(/\.([^.]+)$/);
        return match ? match[1] : '';
    }

    private calculateDuration(start: string, end: string): number {
        return new Date(end).getTime() - new Date(start).getTime();
    }

    private truncate(text: string, maxLength: number): string {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    private extractTextFromContent(content: any[]): string {
        const textParts = content
            .filter(c => c.type === 'text')
            .map(c => c.text);
        return textParts.join(' ');
    }

    private getMessageText(msg: CodeSessionMessage): string {
        switch (msg.type) {
            case 'user':
                return typeof (msg as UserMessage).message.content === 'string'
                    ? (msg as UserMessage).message.content as string
                    : '';
            case 'assistant':
                const content = (msg as AssistantMessage).message.content;
                return Array.isArray(content) ? this.extractTextFromContent(content) : content;
            case 'summary':
                return (msg as any).summary || '';
            case 'system':
                return (msg as any).content || '';
            default:
                return '';
        }
    }
}
