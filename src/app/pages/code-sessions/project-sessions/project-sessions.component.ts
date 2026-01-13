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
import { CodeSessionListItem } from '../../../models/code-session-models';
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
    projectId: string | null = null;
    sessions: CodeSessionListItem[] = [];
    loading = true;
    displayedColumns: string[] = ['sessionId', 'startTime', 'messageCount', 'duration', 'actions'];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private codeSessionService: CodeSessionService
    ) { }

    ngOnInit(): void {
        this.route.params.subscribe(params => {
            this.projectName = params['projectName'];
            this.projectId = params['projectId'] || null;
            this.loadSessions();
        });
    }

    loadSessions(): void {
        this.loading = true;
        this.codeSessionService.getSessions(this.projectName).subscribe({
            next: (sessions) => {
                this.sessions = sessions.sort((a, b) =>
                    new Date(b.startTime || 0).getTime() - new Date(a.startTime || 0).getTime()
                );
                this.loading = false;
            },
            error: (error) => {
                console.error('Failed to load sessions:', error);
                this.loading = false;
            }
        });
    }

    navigateToSession(session: CodeSessionListItem): void {
        if (this.projectId) {
            this.router.navigate(['/', 'code-sessions', this.projectId, this.projectName, session.sessionId]);
        } else {
            this.router.navigate(['/', 'user-code-sessions', this.projectName, session.sessionId]);
        }
    }

    goBack(): void {
        if (this.projectId) {
            this.router.navigate(['/', 'code-sessions', this.projectId]);
        } else {
            this.router.navigate(['/', 'user-code-sessions']);
        }
    }

    getDisplayName(projectName: string): string {
        // -mnt-c-Users-... を見やすく変換
        return projectName
            .replace('-mnt-c-Users-blkd1-', '')
            .replace(/-/g, '/')
            .replace('workspace/', '')
            .replace('Music/', '🎵 ');
    }

    getDuration(session: CodeSessionListItem): string {
        if (!session.endTime || !session.startTime) return '進行中';

        const start = new Date(session.startTime).getTime();
        const end = new Date(session.endTime).getTime();
        const duration = end - start;

        const minutes = Math.floor(duration / 60000);
        if (minutes < 60) return `${minutes}分`;

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}時間${remainingMinutes}分`;
    }

    formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    getTotalMessageCount(): number {
        return this.sessions.reduce((sum, s) => sum + (s?.messageCount || 0), 0);
    }
}
