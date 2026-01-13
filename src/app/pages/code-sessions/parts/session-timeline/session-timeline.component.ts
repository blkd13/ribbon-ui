import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MarkdownModule } from 'ngx-markdown';
import { TimelineEvent } from '../../../../models/code-session-models';

@Component({
    selector: 'app-session-timeline',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
        MatChipsModule,
        MatExpansionModule,
        MatProgressSpinnerModule,
        MarkdownModule,
    ],
    templateUrl: './session-timeline.component.html',
    styleUrls: ['./session-timeline.component.scss']
})
export class SessionTimelineComponent implements OnChanges {
    @Input() events: TimelineEvent[] = [];
    @Input() isExecuting = false;
    @Input() currentOutput = '';
    @Input() autoScroll = true;
    @Input() showCard = true;  // カードで囲むかどうか

    @Output() eventClick = new EventEmitter<TimelineEvent>();

    @ViewChild('timelineContainer') timelineContainer?: ElementRef<HTMLDivElement>;

    ngOnChanges(changes: SimpleChanges): void {
        // イベントが追加されたときに自動スクロール
        if (changes['events'] && this.autoScroll && this.timelineContainer) {
            setTimeout(() => {
                this.scrollToBottom();
            }, 100);
        }
    }

    private scrollToBottom(): void {
        if (this.timelineContainer) {
            const el = this.timelineContainer.nativeElement;
            el.scrollTop = el.scrollHeight;
        }
    }

    getMessageIcon(type: string): string {
        switch (type) {
            case 'user': return 'person';
            case 'assistant': return 'smart_toy';
            case 'file-history-snapshot': return 'history';
            case 'summary': return 'summarize';
            case 'system': return 'settings';
            case 'tool-pair': return 'build';
            default: return 'message';
        }
    }

    getEventTypeLabel(type: string): string {
        const labelMap: { [key: string]: string } = {
            'user': 'ユーザーメッセージ',
            'assistant': 'アシスタント応答',
            'tool-call': 'ツール呼び出し',
            'tool-execution': 'ツール実行',
            'tool-pair': 'ツール実行',
            'file-history-snapshot': 'ファイルスナップショット',
            'summary': 'サマリー',
            'system': 'システムイベント',
        };
        return labelMap[type] || type;
    }

    onEventClick(event: TimelineEvent): void {
        this.eventClick.emit(event);
    }
}
