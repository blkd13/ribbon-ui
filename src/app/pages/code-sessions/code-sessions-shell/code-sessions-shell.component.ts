import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MarkdownModule } from 'ngx-markdown';
import { Subscription } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
    CodeProjectResponse,
    CodeSession,
    CodeSessionListItem,
    SessionStatistics,
    TimelineEvent,
    ToolCallPair
} from '../../../models/code-session-models';
import { ClaudeCodeExecService, ClaudeCodeOutput } from '../../../services/claude-code-exec.service';
import { CodeSessionService } from '../../../services/code-session.service';
import { UserService } from '../../../services/user.service';
import { SessionSidebarComponent, SessionSelectEvent } from '../parts/session-sidebar/session-sidebar.component';
import { SessionTimelineComponent } from '../parts/session-timeline/session-timeline.component';
import { ToolPermissionDialogComponent, PendingToolUse, ToolPermissionResponse } from '../parts/tool-permission-dialog/tool-permission-dialog.component';
import { SessionInputAreaComponent, ExecutionMode } from '../parts/session-input-area/session-input-area.component';
import { SessionDetailModalComponent } from '../parts/session-detail-modal/session-detail-modal.component';
import { MatTooltipModule } from '@angular/material/tooltip';

type ViewMode = 'empty' | 'session';

@Component({
    selector: 'app-code-sessions-shell',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        FormsModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        MarkdownModule,
        SessionSidebarComponent,
        SessionTimelineComponent,
        ToolPermissionDialogComponent,
        SessionInputAreaComponent,
        SessionDetailModalComponent,
        MatTooltipModule,
    ],
    templateUrl: './code-sessions-shell.component.html',
    styleUrls: ['./code-sessions-shell.component.scss']
})
export class CodeSessionsShellComponent implements OnInit, OnDestroy {
    // Route params
    projectId: string | null = null;
    selectedProjectName: string | null = null;
    selectedSessionId: string | null = null;

    // Selected items
    selectedProject: CodeProjectResponse | null = null;
    selectedSession: CodeSession | null = null;

    // View state
    viewMode: ViewMode = 'empty';
    sidebarCollapsed = false;
    isLoading = false;
    isDetailModalOpen = false;

    // Session data
    timeline: TimelineEvent[] = [];
    statistics: SessionStatistics | null = null;
    toolCallPairs: ToolCallPair[] = [];

    // Execution state
    claudeSessionId: string | null = null;
    isExecuting = false;
    currentOutput = '';
    executionMode: ExecutionMode = 'interactive';
    pendingToolUse: PendingToolUse | null = null;
    isForkMode = false;
    private isNewSession = false;
    private forkFromSessionId: string | null = null;
    private currentStreamId: string | null = null;
    private execSubscription?: Subscription;
    private routeSubscription?: Subscription;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private codeSessionService: CodeSessionService,
        private claudeCodeExec: ClaudeCodeExecService,
        public userService: UserService
    ) {}

    ngOnInit(): void {
        this.routeSubscription = this.route.params.subscribe(params => {
            this.projectId = params['projectId'] || null;
            this.selectedProjectName = params['projectName'] || null;
            this.selectedSessionId = params['sessionId'] || null;

            if (this.selectedSessionId === 'new') {
                this.initNewSession();
            } else if (this.selectedSessionId && this.selectedProjectName) {
                this.loadSession(this.selectedProjectName, this.selectedSessionId);
            } else {
                this.viewMode = 'empty';
                this.selectedSession = null;
            }
        });
    }

    ngOnDestroy(): void {
        this.execSubscription?.unsubscribe();
        this.routeSubscription?.unsubscribe();
    }

    // =========================================================================
    // Navigation
    // =========================================================================

    onProjectSelect(project: CodeProjectResponse): void {
        this.selectedProject = project;
        this.navigateTo(project.name);
    }

    onSessionSelect(event: SessionSelectEvent): void {
        this.selectedProject = event.project;
        this.navigateTo(event.project.name, event.session.sessionId);
    }

    onNewSession(project: CodeProjectResponse): void {
        this.selectedProject = project;
        this.navigateTo(project.name, 'new');
    }

    private navigateTo(projectName: string, sessionId?: string): void {
        const base = this.projectId ? ['/code-sessions', this.projectId] : ['/code-sessions'];
        const path = sessionId
            ? [...base, projectName, sessionId]
            : [...base, projectName];
        this.router.navigate(path);
    }

    toggleSidebar(): void {
        this.sidebarCollapsed = !this.sidebarCollapsed;
    }

    openDetailModal(): void {
        if (this.selectedSession) {
            this.isDetailModalOpen = true;
        }
    }

    closeDetailModal(): void {
        this.isDetailModalOpen = false;
    }

    // =========================================================================
    // Session Loading
    // =========================================================================

    private initNewSession(): void {
        this.viewMode = 'session';
        this.selectedSession = null;
        this.timeline = [];
        this.statistics = null;
        this.claudeSessionId = uuidv4();
        this.isNewSession = true;
        this.isLoading = false;
    }

    private loadSession(projectName: string, sessionId: string): void {
        this.viewMode = 'session';
        this.isLoading = true;
        this.claudeSessionId = sessionId;
        this.isNewSession = false;

        this.codeSessionService.getSession(projectName, sessionId).subscribe({
            next: (session) => {
                this.selectedSession = session;
                if (session) {
                    this.timeline = this.codeSessionService.generateTimeline(session.messages);
                    this.statistics = this.codeSessionService.calculateStatistics(session);
                    this.toolCallPairs = this.codeSessionService.extractToolCallPairs(session.messages);
                }
                this.isLoading = false;
            },
            error: () => {
                this.isLoading = false;
            }
        });
    }

    // =========================================================================
    // Execution
    // =========================================================================

    onExecute(prompt: string): void {
        if (!prompt || this.isExecuting || !this.projectId) return;

        this.isExecuting = true;
        this.currentOutput = '';
        this.pendingToolUse = null;

        const shouldResume = !this.isNewSession && !this.forkFromSessionId;

        if (this.executionMode === 'interactive') {
            this.executeInteractive(prompt, shouldResume);
        } else {
            this.executePrint(prompt, shouldResume);
        }
    }

    private executeInteractive(prompt: string, shouldResume: boolean): void {
        this.execSubscription?.unsubscribe();

        this.claudeCodeExec.executeInteractive(
            this.projectId!,
            prompt,
            this.claudeSessionId || undefined,
            shouldResume
        ).subscribe({
            next: ({ output$, streamId }) => {
                this.currentStreamId = streamId;
                if (this.isNewSession) this.isNewSession = false;

                this.execSubscription = output$.subscribe({
                    next: (output: ClaudeCodeOutput) => this.handleOutput(output),
                    complete: () => this.onExecutionComplete(),
                    error: (err) => this.onExecutionError(err)
                });
            },
            error: (err) => this.onExecutionError(err)
        });
    }

    private executePrint(prompt: string, shouldResume: boolean): void {
        this.execSubscription?.unsubscribe();

        this.claudeCodeExec.execute(
            this.projectId!,
            prompt,
            this.claudeSessionId || undefined,
            shouldResume,
            this.forkFromSessionId || undefined
        ).subscribe({
            next: ({ output$, streamId }) => {
                this.currentStreamId = streamId;
                if (this.isNewSession) this.isNewSession = false;
                if (this.forkFromSessionId) {
                    this.forkFromSessionId = null;
                    this.isForkMode = false;
                }

                this.execSubscription = output$.subscribe({
                    next: (output: ClaudeCodeOutput) => this.handleOutput(output),
                    complete: () => this.onExecutionComplete(),
                    error: (err) => this.onExecutionError(err)
                });
            },
            error: (err) => this.onExecutionError(err)
        });
    }

    private handleOutput(output: ClaudeCodeOutput): void {
        if (output.type === 'jsonl') {
            this.addToTimeline(output.content);

            // Detect tool_use
            if (this.executionMode === 'interactive' && output.content.type === 'assistant') {
                const content = output.content.message?.content;
                if (Array.isArray(content)) {
                    const toolUse = content.find((c: any) => c.type === 'tool_use');
                    if (toolUse) {
                        this.pendingToolUse = {
                            id: toolUse.id,
                            name: toolUse.name,
                            input: toolUse.input
                        };
                    }
                }
            }

            // Detect tool_result
            if (output.content.type === 'user') {
                const content = output.content.message?.content;
                if (Array.isArray(content)) {
                    const toolResult = content.find((c: any) => c.type === 'tool_result');
                    if (toolResult) {
                        this.pendingToolUse = null;
                    }
                }
            }
        } else if (output.type === 'error') {
            this.currentOutput += `\n[Error: ${output.content}]`;
        } else if (output.type === 'ready') {
            this.isExecuting = false;
        }
    }

    private addToTimeline(message: any): void {
        const type = message.type || 'system';
        const timestamp = message.timestamp || new Date().toISOString();

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
            message,
            icon,
        };
        this.timeline = [...this.timeline, event];
    }

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

    private onExecutionComplete(): void {
        this.isExecuting = false;
        this.currentOutput = '';
        this.currentStreamId = null;
        this.pendingToolUse = null;
    }

    private onExecutionError(err: any): void {
        console.error('Execution error:', err);
        this.isExecuting = false;
        this.currentOutput += `\n[Error: ${err}]`;
        this.currentStreamId = null;
    }

    respondToToolUse(response: ToolPermissionResponse): void {
        if (!this.currentStreamId || !this.pendingToolUse) return;

        this.claudeCodeExec.respond(this.currentStreamId, response).subscribe({
            error: (err) => console.error('Failed to respond:', err)
        });
    }

    cancelExecution(): void {
        this.execSubscription?.unsubscribe();
        this.isExecuting = false;
    }

    // =========================================================================
    // Fork Mode
    // =========================================================================

    startForkMode(): void {
        if (!this.claudeSessionId) return;
        this.forkFromSessionId = this.claudeSessionId;
        this.claudeSessionId = uuidv4();
        this.isForkMode = true;
        this.isNewSession = true;
    }

    cancelForkMode(): void {
        if (!this.isForkMode || !this.forkFromSessionId) return;
        this.claudeSessionId = this.forkFromSessionId;
        this.forkFromSessionId = null;
        this.isForkMode = false;
        this.isNewSession = false;
    }

    // =========================================================================
    // Breadcrumb
    // =========================================================================

    get breadcrumbItems(): { label: string; link?: string[] }[] {
        const items: { label: string; link?: string[] }[] = [
            { label: 'Code Sessions', link: this.projectId ? ['/code-sessions', this.projectId] : ['/code-sessions'] }
        ];

        if (this.selectedProjectName) {
            items.push({
                label: this.getDisplayName(this.selectedProjectName),
                link: this.projectId
                    ? ['/code-sessions', this.projectId, this.selectedProjectName]
                    : ['/code-sessions', '_', this.selectedProjectName]
            });
        }

        if (this.selectedSessionId) {
            const label = this.selectedSessionId === 'new' ? '新規セッション' : this.selectedSessionId.substring(0, 8);
            items.push({ label });
        }

        return items;
    }

    private getDisplayName(projectName: string): string {
        return projectName
            .replace(/^-mnt-c-Users-[^-]+-/, '')
            .replace(/-/g, '/')
            .split('/').pop() || projectName;
    }
}
