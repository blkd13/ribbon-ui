import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { SessionStatistics } from '../../../../models/code-session-models';

interface StatCard {
    icon: string;
    value: string | number;
    label: string;
    show: boolean;
}

@Component({
    selector: 'app-session-statistics',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatIconModule,
    ],
    templateUrl: './session-statistics.component.html',
    styleUrls: ['./session-statistics.component.scss']
})
export class SessionStatisticsComponent {
    @Input() statistics: SessionStatistics | null = null;

    get statCards(): StatCard[] {
        if (!this.statistics) return [];

        return [
            {
                icon: 'chat',
                value: this.statistics.totalMessages,
                label: '総メッセージ数',
                show: true
            },
            {
                icon: 'person',
                value: this.statistics.userMessages,
                label: 'ユーザー',
                show: true
            },
            {
                icon: 'smart_toy',
                value: this.statistics.assistantMessages,
                label: 'アシスタント',
                show: true
            },
            {
                icon: 'build',
                value: this.statistics.toolCalls,
                label: 'ツール呼び出し',
                show: true
            },
            {
                icon: 'description',
                value: this.statistics.modifiedFiles,
                label: '変更ファイル',
                show: true
            },
            {
                icon: 'paid',
                value: this.formatTokens(this.statistics.totalTokens || 0),
                label: 'トークン数',
                show: !!this.statistics.totalTokens && this.statistics.totalTokens > 0
            }
        ].filter(card => card.show);
    }

    formatTokens(count: number): string {
        if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return count.toString();
    }
}
