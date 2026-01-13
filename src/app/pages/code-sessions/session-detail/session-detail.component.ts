import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeModule } from '@angular/material/tree';
import { ActivatedRoute, Router } from '@angular/router';
import { MarkdownModule } from "ngx-markdown";
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
    CodeSession,
    MessageTreeNode,
    SessionStatistics,
    TimelineEvent,
    ToolCallPair
} from '../../../models/code-session-models';
import { ContentPart } from '../../../models/project-models';
import { ClaudeCodeExecService, ClaudeCodeOutput } from '../../../services/claude-code-exec.service';
import { CodeSessionService } from '../../../services/code-session.service';
import { UserService } from '../../../services/user.service';
import { SessionTimelineComponent } from '../parts/session-timeline/session-timeline.component';
import { ToolPermissionDialogComponent, PendingToolUse, ToolPermissionResponse } from '../parts/tool-permission-dialog/tool-permission-dialog.component';
import { SessionInputAreaComponent, ExecutionMode } from '../parts/session-input-area/session-input-area.component';
import { SessionStatisticsComponent } from '../parts/session-statistics/session-statistics.component';

interface FlatNode {
    expandable: boolean;
    name: string;
    level: number;
    data: MessageTreeNode;
}

@Component({
    selector: 'app-session-detail',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatChipsModule,
        MatExpansionModule,
        MatFormFieldModule,
        MatInputModule,
        MatProgressSpinnerModule,
        MatTreeModule,
        MatBadgeModule,
        MatTooltipModule,
        MarkdownModule,
        // 抽出したパーツ
        SessionTimelineComponent,
        ToolPermissionDialogComponent,
        SessionInputAreaComponent,
        SessionStatisticsComponent,
    ],
    templateUrl: './session-detail.component.html',
    styleUrls: ['./session-detail.component.scss']
})
export class SessionDetailComponent implements OnInit, OnDestroy {
    projectName = '';
    sessionId = '';
    session: CodeSession | null = null;
    messageTree: MessageTreeNode[] = [];
    toolCallPairs: ToolCallPair[] = [];
    timeline: TimelineEvent[] = [];
    statistics: SessionStatistics | null = null;
    loading = true;

    // 新しく追加：メッセージタイプ別に分類
    conversationMessages: any[] = [];
    fileSnapshots: any[] = [];
    systemEvents: any[] = [];

    // ClaudeCode実行関連
    projectId: string | null = null;  // コンテナのプロジェクトID
    claudeSessionId: string | null = null;  // ClaudeCodeのセッションID
    promptInput = '';
    isExecuting = false;
    currentOutput = '';
    private execSubscription?: Subscription;
    private routeSubscription?: Subscription;  // ルートパラメータ購読
    private queryParamsSubscription?: Subscription;  // クエリパラメータ購読
    private isNewSession = false;  // 新規セッションかどうか（最初の実行は--session-id、以降は--resume）
    private forkFromSessionId: string | null = null;  // 分岐元セッションID（分岐モード時に使用）
    isForkMode = false;  // 分岐モードかどうか（UIで表示用）

    // 対話モード関連
    executionMode: ExecutionMode = 'interactive';  // 実行モード
    currentStreamId: string | null = null;  // 現在のストリームID（応答送信用）
    pendingToolUse: PendingToolUse | null = null;  // 許可待ちのtool_use

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private codeSessionService: CodeSessionService,
        private claudeCodeExec: ClaudeCodeExecService,
        public userService: UserService
    ) { }

    ngOnInit(): void {
        this.routeSubscription = this.route.params.subscribe(params => {
            this.projectName = params['projectName'];
            this.sessionId = params['sessionId'];
            // URLパスからprojectIdを取得
            this.projectId = params['projectId'] || null;

            // 新規セッションの場合はロードをスキップし、ClaudeCode用セッションIDを生成
            if (this.sessionId === 'new') {
                this.loading = false;
                this.session = null;
                this.timeline = [];
                // ClaudeCode用のセッションIDを生成
                this.claudeSessionId = uuidv4();
                this.isNewSession = true;  // 新規セッション（最初は--session-id）
                console.log(`[SessionDetail] New session created with claudeSessionId: ${this.claudeSessionId}`);
            } else {
                // 既存セッションの場合はURLのsessionIdを使用
                this.isNewSession = false;  // 既存セッション（常に--resume）
                this.claudeSessionId = this.sessionId;
                this.loadSessionDetail();
            }
        });

        // 互換性のためクエリパラメータも引き続きサポート
        this.queryParamsSubscription = this.route.queryParams.subscribe(params => {
            if (!this.projectId) {
                this.projectId = params['projectId'] || null;
            }
        });
    }

    ngOnDestroy(): void {
        this.execSubscription?.unsubscribe();
        this.routeSubscription?.unsubscribe();
        this.queryParamsSubscription?.unsubscribe();
    }

    loadSessionDetail(): void {
        this.loading = true;
        this.codeSessionService.getSession(this.projectName, this.sessionId).subscribe({
            next: (session) => {
                this.session = session;
                if (this.session) {
                    this.messageTree = this.codeSessionService.buildMessageTree(this.session.messages);
                    this.toolCallPairs = this.codeSessionService.extractToolCallPairs(this.session.messages);
                    this.timeline = this.codeSessionService.generateTimeline(this.session.messages);
                    this.statistics = this.codeSessionService.calculateStatistics(this.session);

                    // メッセージをタイプ別に分類
                    this.classifyMessages(this.session.messages);
                }
                this.loading = false;
            },
            error: (error) => {
                console.error('Failed to load session:', error);
                this.loading = false;
            }
        });
    }

    private classifyMessages(messages: any[]): void {
        this.conversationMessages = messages.filter(m =>
            (m.type === 'user' || m.type === 'assistant') && !m.toolUseResult
        );

        this.fileSnapshots = messages.filter(m =>
            m.type === 'file-history-snapshot'
        );

        this.systemEvents = messages.filter(m =>
            m.type === 'summary' || m.type === 'system'
        );
    }

    goBack(): void {
        if (this.projectId) {
            this.router.navigate(['/', 'code-sessions', this.projectId, this.projectName]);
        } else {
            this.router.navigate(['/user-code-sessions', this.projectName]);
        }
    }

    getMessageIcon(type: string): string {
        switch (type) {
            case 'user': return 'person';
            case 'assistant': return 'smart_toy';
            case 'file-history-snapshot': return 'history';
            case 'summary': return 'summarize';
            case 'system': return 'settings';
            default: return 'message';
        }
    }

    getToolIcon(toolName: string): string {
        switch (toolName) {
            case 'Bash': return 'terminal';
            case 'Edit': return 'edit';
            case 'Read': return 'visibility';
            case 'Write': return 'create';
            case 'Glob': return 'search';
            case 'Grep': return 'manage_search';
            case 'TodoWrite': return 'checklist';
            case 'WebFetch': return 'language';
            default: return 'build';
        }
    }

    getMessageContent(node: MessageTreeNode): string {
        const msg = node.message;
        if ('message' in msg && msg.message?.content) {
            const content = msg.message.content;
            if (typeof content === 'string') {
                return content.length > 200 ? content.substring(0, 200) + '...' : content;
            }
        }
        return '';
    }

    formatTokens(count: number): string {
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    }

    getFileExtension(filename: string): string {
        const ext = filename.split('.').pop() || '';
        return ext;
    }

    getLanguageColor(ext: string): string {
        const colorMap: { [key: string]: string } = {
            'ts': '#3178c6',
            'js': '#f7df1e',
            'py': '#3776ab',
            'html': '#e34c26',
            'css': '#264de4',
            'scss': '#cc6699',
            'json': '#000000',
            'md': '#083fa1',
        };
        return colorMap[ext] || '#666666';
    }

    getTextContent(content: ContentPart): string {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');
        }
        return '';
    }

    getSnapshotFileCount(snapshot: any): number {
        if (!snapshot.snapshot?.trackedFileBackups) {
            return 0;
        }
        return Object.keys(snapshot.snapshot.trackedFileBackups).length;
    }

    getSnapshotFiles(snapshot: any): Array<{ path: string }> {
        if (!snapshot.snapshot?.trackedFileBackups) {
            return [];
        }
        return Object.keys(snapshot.snapshot.trackedFileBackups).map(path => ({ path }));
    }

    getEventTypeLabel(type: string): string {
        const labelMap: { [key: string]: string } = {
            'user': 'ユーザーメッセージ',
            'assistant': 'アシスタント応答',
            'tool-call': 'ツール呼び出し',
            'tool-execution': 'ツール実行',
            'file-history-snapshot': 'ファイルスナップショット',
            'summary': 'サマリー',
            'system': 'システムイベント',
        };
        return labelMap[type] || type;
    }

    // ============================================================================
    // ClaudeCode Execution
    // ============================================================================

    /**
     * 入力エリアコンポーネントからの実行リクエスト
     */
    onExecuteFromInput(prompt: string): void {
        this.promptInput = prompt;
        this.executeClaudeCode();
    }

    /**
     * ClaudeCodeを実行
     */
    executeClaudeCode(): void {
        console.log(`[SessionDetail] executeClaudeCode called`);
        console.log(`[SessionDetail] projectId: ${this.projectId}`);
        console.log(`[SessionDetail] claudeSessionId: ${this.claudeSessionId}`);
        console.log(`[SessionDetail] isNewSession: ${this.isNewSession}`);
        console.log(`[SessionDetail] executionMode: ${this.executionMode}`);
        console.log(`[SessionDetail] promptInput: ${this.promptInput?.substring(0, 100)}...`);
        console.log(`[SessionDetail] isExecuting: ${this.isExecuting}`);

        if (!this.promptInput || this.isExecuting || !this.projectId) {
            console.log(`[SessionDetail] Aborting: promptInput=${!!this.promptInput}, isExecuting=${this.isExecuting}, projectId=${!!this.projectId}`);
            return;
        }

        this.isExecuting = true;
        this.currentOutput = '';
        this.pendingToolUse = null;
        const sentPrompt = this.promptInput;
        this.promptInput = '';

        // 新規セッションの場合は resume=false（--session-id）、継続の場合は resume=true（--resume）
        const shouldResume = !this.isNewSession && !this.forkFromSessionId;

        // 対話モードか従来のprintモードかで分岐
        if (this.executionMode === 'interactive') {
            this.executeInteractiveMode(sentPrompt, shouldResume);
        } else {
            this.executePrintMode(sentPrompt, shouldResume);
        }
    }

    /**
     * 対話モードで実行
     */
    private executeInteractiveMode(prompt: string, shouldResume: boolean): void {
        console.log(`[SessionDetail] Calling claudeCodeExec.executeInteractive... (resume=${shouldResume})`);

        // 前の購読を解除
        this.execSubscription?.unsubscribe();

        this.claudeCodeExec.executeInteractive(
            this.projectId!,
            prompt,
            this.claudeSessionId || undefined,
            shouldResume
        ).subscribe({
            next: ({ output$, streamId }) => {
                console.log(`[SessionDetail] executeInteractive() returned, streamId: ${streamId}`);
                this.currentStreamId = streamId;

                if (this.isNewSession) {
                    this.isNewSession = false;
                }

                this.execSubscription = output$.subscribe({
                    next: (output: ClaudeCodeOutput) => this.handleOutput(output),
                    complete: () => {
                        console.log(`[SessionDetail] output$ completed`);
                        this.isExecuting = false;
                        this.currentOutput = '';
                        this.currentStreamId = null;
                        this.pendingToolUse = null;
                    },
                    error: (err) => {
                        console.error(`[SessionDetail] output$ error:`, err);
                        this.isExecuting = false;
                        this.currentOutput += `\n[Error: ${err}]`;
                        this.currentStreamId = null;
                    }
                });
            },
            error: (err) => {
                console.error(`[SessionDetail] executeInteractive() error:`, err);
                this.isExecuting = false;
            }
        });
    }

    /**
     * 従来のprintモードで実行
     */
    private executePrintMode(prompt: string, shouldResume: boolean): void {
        console.log(`[SessionDetail] Calling claudeCodeExec.execute... (resume=${shouldResume}, forkFromSessionId=${this.forkFromSessionId})`);

        // 前の購読を解除
        this.execSubscription?.unsubscribe();

        this.claudeCodeExec.execute(
            this.projectId!,
            prompt,
            this.claudeSessionId || undefined,
            shouldResume,
            this.forkFromSessionId || undefined
        ).subscribe({
            next: ({ output$, streamId }) => {
                console.log(`[SessionDetail] execute() returned, streamId: ${streamId}`);
                this.currentStreamId = streamId;

                if (this.isNewSession) {
                    this.isNewSession = false;
                }

                if (this.forkFromSessionId) {
                    console.log(`[SessionDetail] Fork completed from ${this.forkFromSessionId} to ${this.claudeSessionId}`);
                    this.forkFromSessionId = null;
                    this.isForkMode = false;
                }

                this.execSubscription = output$.subscribe({
                    next: (output: ClaudeCodeOutput) => this.handleOutput(output),
                    complete: () => {
                        console.log(`[SessionDetail] output$ completed`);
                        this.isExecuting = false;
                        this.currentOutput = '';
                        this.currentStreamId = null;
                    },
                    error: (err) => {
                        console.error(`[SessionDetail] output$ error:`, err);
                        this.isExecuting = false;
                        this.currentOutput += `\n[Error: ${err}]`;
                        this.currentStreamId = null;
                    }
                });
            },
            error: (err) => {
                console.error(`[SessionDetail] execute() error:`, err);
                this.isExecuting = false;
            }
        });
    }

    /**
     * 出力を処理
     */
    private handleOutput(output: ClaudeCodeOutput): void {
        console.log(`[SessionDetail] output$ received:`, output);
        if (output.type === 'jsonl') {
            console.log(`[SessionDetail] Adding to timeline...`);
            this.addJsonlMessageToTimeline(output.content);
            console.log(`[SessionDetail] Timeline length now:`, this.timeline.length);

            // tool_use検出（対話モード時）
            if (this.executionMode === 'interactive' && output.content.type === 'assistant') {
                const content = output.content.message?.content;
                if (Array.isArray(content)) {
                    const toolUse = content.find((c: any) => c.type === 'tool_use');
                    if (toolUse) {
                        console.log(`[SessionDetail] tool_use detected:`, toolUse);
                        this.pendingToolUse = {
                            id: toolUse.id,
                            name: toolUse.name,
                            input: toolUse.input
                        };
                    }
                }
            }

            // tool_result検出 → 許可待ち解除
            if (output.content.type === 'user') {
                const content = output.content.message?.content;
                if (Array.isArray(content)) {
                    const toolResult = content.find((c: any) => c.type === 'tool_result');
                    if (toolResult) {
                        console.log(`[SessionDetail] tool_result detected, clearing pendingToolUse`);
                        this.pendingToolUse = null;
                    }
                }
            }
        } else if (output.type === 'error') {
            this.currentOutput += `\n[Error: ${output.content}]`;
        } else if (output.type === 'ready') {
            // Claude CLIが次の入力を待っている状態
            console.log(`[SessionDetail] Ready signal received, enabling input`);
            this.isExecuting = false;
        } else if (output.type === 'pty') {
            // PTY出力（デバッグ用、UIには表示しない）
            // console.log(`[SessionDetail] PTY output:`, output.content);
        } else {
            console.log(`[SessionDetail] Unknown type:`, output.type);
        }
    }

    /**
     * ツール使用に対してユーザー応答を送信
     */
    respondToToolUse(response: ToolPermissionResponse): void {
        if (!this.currentStreamId || !this.pendingToolUse) {
            console.warn(`[SessionDetail] Cannot respond: streamId=${this.currentStreamId}, pendingToolUse=${!!this.pendingToolUse}`);
            return;
        }

        console.log(`[SessionDetail] Sending response: ${response} for tool: ${this.pendingToolUse.name}`);
        this.claudeCodeExec.respond(this.currentStreamId, response).subscribe({
            next: (result) => {
                console.log(`[SessionDetail] Response sent:`, result);
                // pendingToolUseはtool_resultがJSONLに来たらクリアされる
            },
            error: (err) => {
                console.error(`[SessionDetail] Failed to send response:`, err);
            }
        });
    }

    /**
     * jsonlメッセージをタイムラインに追加
     */
    private addJsonlMessageToTimeline(message: any): void {
        const type = message.type || 'system';
        const timestamp = message.timestamp || new Date().toISOString();

        // メッセージタイプに応じた処理
        let description = '';
        let icon = 'message';

        if (type === 'user') {
            icon = 'person';
            description = this.extractTextContent(message.message?.content);
        } else if (type === 'assistant') {
            icon = 'smart_toy';
            description = this.extractTextContent(message.message?.content);
        } else if (type === 'summary') {
            icon = 'summarize';
            description = message.summary || '';
        } else if (type === 'system') {
            icon = 'settings';
            description = message.content || '';
        }

        const event: TimelineEvent = {
            type: type as any,
            timestamp,
            description,
            message: message,
            icon,
        };
        // 新しい配列を作成してAngularの変更検出をトリガー
        this.timeline = [...this.timeline, event];
    }

    /**
     * contentからテキストを抽出
     */
    private extractTextContent(content: any): string {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join('\n');
        }
        return '';
    }

    /**
     * 実行をキャンセル
     */
    cancelExecution(): void {
        if (!this.isExecuting) return;
        // TODO: バックエンドにキャンセルリクエストを送信
        this.execSubscription?.unsubscribe();
        this.isExecuting = false;
    }

    /**
     * 分岐モードを開始
     * 現在のセッションから新しいセッションを分岐する
     */
    startForkMode(): void {
        if (!this.claudeSessionId) return;

        this.forkFromSessionId = this.claudeSessionId;
        this.claudeSessionId = uuidv4();  // 新しいセッションIDを生成
        this.isForkMode = true;
        this.isNewSession = true;  // 分岐後は新規セッション扱い

        console.log(`[SessionDetail] Fork mode started: from ${this.forkFromSessionId} to ${this.claudeSessionId}`);
    }

    /**
     * 分岐モードをキャンセル
     */
    cancelForkMode(): void {
        if (!this.isForkMode || !this.forkFromSessionId) return;

        this.claudeSessionId = this.forkFromSessionId;
        this.forkFromSessionId = null;
        this.isForkMode = false;
        this.isNewSession = false;  // 元のセッションに戻る

        console.log(`[SessionDetail] Fork mode cancelled, back to session: ${this.claudeSessionId}`);
    }
}
