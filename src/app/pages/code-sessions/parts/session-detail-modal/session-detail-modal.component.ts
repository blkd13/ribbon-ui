import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import {
    CodeSession,
    SessionStatistics,
    ToolCallPair
} from '../../../../models/code-session-models';
import { ContentPart } from '../../../../models/project-models';
import { CodeSessionService } from '../../../../services/code-session.service';
import { SessionStatisticsComponent } from '../session-statistics/session-statistics.component';

@Component({
    selector: 'app-session-detail-modal',
    standalone: true,
    imports: [
        CommonModule,
        MatButtonModule,
        MatIconModule,
        MatTabsModule,
        MatCardModule,
        MatChipsModule,
        MatExpansionModule,
        MatBadgeModule,
        SessionStatisticsComponent,
    ],
    templateUrl: './session-detail-modal.component.html',
    styleUrls: ['./session-detail-modal.component.scss']
})
export class SessionDetailModalComponent implements OnChanges {
    @Input() session: CodeSession | null = null;
    @Input() isOpen = false;
    @Output() close = new EventEmitter<void>();

    // 分類されたメッセージ
    conversationMessages: any[] = [];
    toolCallPairs: ToolCallPair[] = [];
    fileSnapshots: any[] = [];
    systemEvents: any[] = [];
    statistics: SessionStatistics | null = null;

    constructor(private codeSessionService: CodeSessionService) {}

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['session'] && this.session) {
            this.processSession();
        }
    }

    private processSession(): void {
        if (!this.session) return;

        // 統計を計算
        this.statistics = this.codeSessionService.calculateStatistics(this.session);

        // ツール呼び出しペアを抽出
        this.toolCallPairs = this.codeSessionService.extractToolCallPairs(this.session.messages);

        // メッセージをタイプ別に分類
        this.classifyMessages(this.session.messages);
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

    onOverlayClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
            this.close.emit();
        }
    }

    onCloseClick(): void {
        this.close.emit();
    }

    // ユーティリティメソッド
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

    formatTokens(count: number | undefined): string {
        if (count === undefined) return '-';
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
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
}
