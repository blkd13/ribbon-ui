import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTreeModule } from '@angular/material/tree';
import { ActivatedRoute, Router } from '@angular/router';
import { MarkdownModule } from "ngx-markdown";
import {
    CodeSession,
    MessageTreeNode,
    SessionStatistics,
    TimelineEvent,
    ToolCallPair
} from '../../../models/code-session-models';
import { ContentPart } from '../../../models/project-models';
import { CodeSessionService } from '../../../services/code-session.service';

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
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatChipsModule,
        MatExpansionModule,
        MatProgressSpinnerModule,
        MatTreeModule,
        MatBadgeModule,
        MarkdownModule,
    ],
    templateUrl: './session-detail.component.html',
    styleUrls: ['./session-detail.component.scss']
})
export class SessionDetailComponent implements OnInit {
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

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private codeSessionService: CodeSessionService
    ) { }

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.projectName = params['projectName'];
            this.sessionId = params['sessionId'];
            this.loadSessionDetail();
        });
    }

    loadSessionDetail(): void {
        this.loading = true;
        this.codeSessionService.getSessions(this.projectName).subscribe({
            next: (sessions) => {
                this.session = sessions.find(s => s && s.sessionId === this.sessionId) || null;
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
        this.router.navigate(['/code-sessions', this.projectName]);
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
}
