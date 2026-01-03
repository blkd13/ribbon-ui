import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { CodeSession } from '../../../models/code-session-models';
import { RelativeTimePipe } from '../../../pipe/relative-time.pipe';
import { CodeSessionService } from '../../../services/code-session.service';

@Component({
    selector: 'app-project-sessions',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
        MatChipsModule,
        MatProgressSpinnerModule,
        MatTableModule,
        MatTooltipModule,
        RelativeTimePipe,
    ],
    templateUrl: './project-sessions.component.html',
    styleUrls: ['./project-sessions.component.scss']
})
export class ProjectSessionsComponent implements OnInit {
    projectName = '';
    sessions: (CodeSession | null)[] = [];
    loading = true;
    displayedColumns: string[] = ['sessionId', 'startTime', 'messageCount', 'duration', 'gitBranch', 'actions'];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private codeSessionService: CodeSessionService
    ) { }

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.projectName = params['projectName'];
            this.loadSessions();
        });
    }

    loadSessions(): void {
        this.loading = true;
        this.codeSessionService.getSessions(this.projectName).subscribe({
            next: (sessions) => {
                this.sessions = sessions.sort((a, b) =>
                    (a ? new Date(a.startTime).getTime() : 0) - (b ? new Date(b.startTime).getTime() : 0)
                );
                this.loading = false;
            },
            error: (error) => {
                console.error('Failed to load sessions:', error);
                this.loading = false;
            }
        });
    }

    navigateToSession(session: CodeSession): void {
        this.router.navigate(['/', 'code-sessions', this.projectName, session.sessionId]);
    }

    goBack(): void {
        this.router.navigate(['/', 'code-sessions']);
    }

    getDisplayName(projectName: string): string {
        // -mnt-c-Users-... を見やすく変換
        return projectName
            .replace('-mnt-c-Users-blkd1-', '')
            .replace(/-/g, '/')
            .replace('workspace/', '')
            .replace('Music/', '🎵 ');
    }

    getDuration(session: CodeSession): string {
        if (!session.endTime) return '進行中';

        const start = new Date(session.startTime).getTime();
        const end = new Date(session.endTime).getTime();
        const duration = end - start;

        const minutes = Math.floor(duration / 60000);
        if (minutes < 60) return `${minutes}分`;

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}時間${remainingMinutes}分`;
    }

    getFirstUserMessage(session: CodeSession): string {
        const userMessage = session.messages.find(m => m.type === 'user');
        if (!userMessage || !('message' in userMessage)) return '';

        const content = userMessage.message.content;
        if (typeof content === 'string') {
            return content.substring(0, 100);
        }
        return '';
    }

    getTotalMessageCount(): number {
        return this.sessions.reduce((sum, s) => sum + (s?.messageCount || 0), 0);
    }
}
