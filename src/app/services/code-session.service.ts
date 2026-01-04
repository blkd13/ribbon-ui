import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
    AssistantMessage,
    CodeProjectResponse,
    CodeSession,
    CodeSessionDataSource,
    CodeSessionListItem,
    CodeSessionMessage,
    FileHistorySnapshot,
    FileModification,
    MessageTreeNode,
    PathValidationResult,
    SearchResult,
    SessionFilter,
    SessionStatistics,
    SummaryMessage,
    TimelineEvent,
    ToolCallPair,
    ToolUseContent,
    UserMessage,
} from '../models/code-session-models';

/**
 * Code Session Service
 * バックエンドAPIを通じてセッションデータを取得・管理する
 */
@Injectable({
    providedIn: 'root'
})
export class CodeSessionService {
    private readonly API_BASE = '/user/code-sessions';
    private http = inject(HttpClient);

    // ========================================================================
    // Data Source Management API
    // ========================================================================

    /**
     * データソース一覧を取得
     */
    getDataSources(): Observable<CodeSessionDataSource[]> {
        return this.http.get<CodeSessionDataSource[]>(`${this.API_BASE}/data-sources`);
    }

    /**
     * データソースを作成/更新
     */
    upsertDataSource(dataSource: Partial<CodeSessionDataSource>): Observable<CodeSessionDataSource> {
        if (dataSource.id) {
            return this.http.put<CodeSessionDataSource>(
                `${this.API_BASE}/data-source/${dataSource.id}`,
                dataSource
            );
        }
        return this.http.post<CodeSessionDataSource>(
            `${this.API_BASE}/data-source`,
            dataSource
        );
    }

    /**
     * データソースを削除
     */
    deleteDataSource(id: string): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.API_BASE}/data-source/${id}`);
    }

    /**
     * パスを検証
     */
    validatePath(basePath: string): Observable<PathValidationResult> {
        return this.http.post<PathValidationResult>(
            `${this.API_BASE}/data-source/validate`,
            { basePath }
        );
    }

    // ========================================================================
    // Session Data API
    // ========================================================================

    /**
     * プロジェクト一覧を取得
     */
    getProjects(dataSourceId?: string): Observable<CodeProjectResponse[]> {
        if (dataSourceId) {
            return this.http.get<CodeProjectResponse[]>(`${this.API_BASE}/projects`, { params: { dataSourceId } });
        }
        return this.http.get<CodeProjectResponse[]>(`${this.API_BASE}/projects`);
    }

    /**
     * プロジェクト内のセッション一覧を取得
     */
    getSessions(projectName: string): Observable<CodeSessionListItem[]> {
        return this.http.get<CodeSessionListItem[]>(
            `${this.API_BASE}/projects/${encodeURIComponent(projectName)}/sessions`
        );
    }

    /**
     * セッション詳細を取得
     */
    getSession(projectName: string, sessionId: string): Observable<CodeSession> {
        return this.http.get<CodeSession>(
            `${this.API_BASE}/projects/${encodeURIComponent(projectName)}/sessions/${sessionId}`
        );
    }

    // ========================================================================
    // Statistics & Analysis (Client-side processing)
    // ========================================================================

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
            modifiedFiles: 0,
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

        session.messages.forEach(msg => {
            switch (msg.type) {
                case 'user':
                    stats.userMessages++;
                    break;
                case 'assistant':
                    stats.assistantMessages++;
                    const assistantMsg = msg as AssistantMessage;

                    if (assistantMsg.message.usage) {
                        const usage = assistantMsg.message.usage;
                        stats.tokenUsage!.totalInputTokens += usage.input_tokens || 0;
                        stats.tokenUsage!.totalOutputTokens += usage.output_tokens || 0;
                        stats.tokenUsage!.cacheHitTokens += usage.cache_read_input_tokens || 0;
                        stats.tokenUsage!.cacheCreationTokens += usage.cache_creation_input_tokens || 0;
                    }

                    if (assistantMsg.message.model) {
                        const count = stats.modelUsage!.get(assistantMsg.message.model) || 0;
                        stats.modelUsage!.set(assistantMsg.message.model, count + 1);
                    }

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

        const start = new Date(stats.startTime).getTime();
        const end = new Date(stats.endTime).getTime();
        stats.duration = end - start;

        if (stats.tokenUsage) {
            stats.totalTokens = stats.tokenUsage.totalInputTokens + stats.tokenUsage.totalOutputTokens;
        }

        stats.modifiedFiles = stats.filesModified;

        return stats;
    }

    /**
     * メッセージツリーを構築
     */
    buildMessageTree(messages: CodeSessionMessage[]): MessageTreeNode[] {
        const nodeMap = new Map<string, MessageTreeNode>();
        const roots: MessageTreeNode[] = [];

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
                                    call: {
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
                                    result: {
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

        toolUseMap.forEach(({ message, tool }) => {
            pairs.push({
                toolUse: {
                    id: tool.id,
                    name: tool.name,
                    input: tool.input,
                    message,
                    timestamp: message.timestamp || '',
                },
                call: {
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

        messages.forEach((msg) => {
            let timestamp: string;

            if (msg.type === 'summary') {
                const leafUuid = (msg as SummaryMessage).leafUuid;
                const leafMessage = messages.find(m => 'uuid' in m && m.uuid === leafUuid);
                timestamp = leafMessage && 'timestamp' in leafMessage ? leafMessage.timestamp! : new Date().toISOString();
            } else if (!('timestamp' in msg) || !msg.timestamp) {
                return;
            } else {
                timestamp = msg.timestamp;
            }

            switch (msg.type) {
                case 'user':
                    if ((msg as UserMessage).toolUseResult) {
                        const userMsg = msg as UserMessage;
                        const toolResult = userMsg.toolUseResult!;

                        let toolUseId: string | undefined;
                        let toolName = 'Unknown Tool';

                        if (Array.isArray(userMsg.message.content)) {
                            const toolResultContent = userMsg.message.content.find((c: any) => c.type === 'tool_result') as any;
                            if (toolResultContent) {
                                toolUseId = toolResultContent.tool_use_id;
                            }
                        }

                        const success = !toolResult['error'];

                        if (toolUseId && toolCallMap.has(toolUseId)) {
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

                            toolCallMap.delete(toolUseId);
                        } else {
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
                        const content = (msg as UserMessage).message.content;
                        const textContent = typeof content === 'string' ? content :
                            Array.isArray(content) ? this.extractTextFromContent(content) : '';

                        if (textContent) {
                            events.push({
                                timestamp,
                                type: 'user',
                                message: msg,
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

                    if (Array.isArray(content)) {
                        content.forEach((item: any) => {
                            if (item.type === 'tool_use') {
                                toolCallMap.set(item.id, {
                                    call: item,
                                    callTimestamp: timestamp,
                                    assistantMessage: msg
                                });
                            }
                        });
                    }

                    if (textContent) {
                        events.push({
                            timestamp,
                            type: 'assistant',
                            message: msg,
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
                        description: (msg as SummaryMessage).summary,
                        icon: 'summarize',
                        color: 'primary',
                    });
                    break;

                case 'system':
                    const systemContent = (msg as any).content || 'System event';
                    const subtype = (msg as any).subtype;
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

        toolCallMap.forEach((callInfo) => {
            events.push({
                timestamp: callInfo.callTimestamp,
                type: 'tool-call',
                message: callInfo.assistantMessage,
                description: `🛠️ ${callInfo.call.name}を呼び出し（結果なし）`,
                icon: this.getToolIcon(callInfo.call.name),
                color: 'accent',
                details: JSON.stringify(callInfo.call.input, null, 2)
            });
        });

        return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    /**
     * セッションを検索/フィルタ
     */
    searchSessions(sessions: CodeSession[], filter: SessionFilter): SearchResult[] {
        return sessions
            .filter(session => {
                if (filter.dateFrom && session.startTime < filter.dateFrom) return false;
                if (filter.dateTo && session.startTime > filter.dateTo) return false;
                if (filter.minMessages && session.messageCount < filter.minMessages) return false;
                if (filter.maxMessages && session.messageCount > filter.maxMessages) return false;

                if (filter.hasFileChanges) {
                    const hasFileChanges = session.messages.some(m => m.type === 'file-history-snapshot');
                    if (!hasFileChanges) return false;
                }

                return true;
            })
            .map(session => {
                let matchedMessages: CodeSessionMessage[] = [];
                let relevanceScore = 0;

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

    private getFileExtension(filePath: string): string {
        const match = filePath.match(/\.([^.]+)$/);
        return match ? match[1] : '';
    }

    private calculateDuration(start: string, end: string): number {
        return new Date(end).getTime() - new Date(start).getTime();
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
