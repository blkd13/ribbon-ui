import { CommonModule } from '@angular/common';
import { Component, EventEmitter, inject, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { forkJoin, tap } from 'rxjs';
import { AppMenuComponent } from '../../../../parts/app-menu/app-menu.component';
import { CodeProjectResponse, CodeSessionListItem } from '../../../../models/code-session-models';
import { Project, Team, TeamForView, TeamType } from '../../../../models/project-models';
import { CodeSessionService } from '../../../../services/code-session.service';
import { ProjectService, TeamService } from '../../../../services/project.service';

export interface SessionSelectEvent {
    project: CodeProjectResponse;
    session: CodeSessionListItem;
}

interface ProjectNode {
    project: CodeProjectResponse;
    sessions: CodeSessionListItem[];
    expanded: boolean;
    loading: boolean;
}

@Component({
    selector: 'app-session-sidebar',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        FormsModule,
        MatIconModule,
        MatButtonModule,
        MatDividerModule,
        MatInputModule,
        MatFormFieldModule,
        MatMenuModule,
        MatTooltipModule,
        MatProgressSpinnerModule,
        AppMenuComponent,
    ],
    templateUrl: './session-sidebar.component.html',
    styleUrls: ['./session-sidebar.component.scss']
})
export class SessionSidebarComponent implements OnInit, OnChanges {
    @Input() projectId: string | null = null;  // コンテナプロジェクトID（フィルター用）
    @Input() selectedProjectName: string | null = null;
    @Input() selectedProjectDisplayName: string | null = null;
    @Input() selectedSessionId: string | null = null;
    @Input() collapsed = false;

    @Output() projectSelect = new EventEmitter<CodeProjectResponse>();
    @Output() sessionSelect = new EventEmitter<SessionSelectEvent>();
    @Output() newSession = new EventEmitter<CodeProjectResponse>();
    @Output() toggleCollapse = new EventEmitter<void>();

    projectNodes: ProjectNode[] = [];
    filteredNodes: ProjectNode[] = [];
    isLoading = false;
    searchQuery = '';

    // Ribbon Project model
    private projectService = inject(ProjectService);
    private teamService = inject(TeamService);
    currentProject: Project | null = null;
    teamForViewList: TeamForView[] = [];
    private teamMap: { [key: string]: Team } = {};

    @ViewChild('projectMenuTrigger') projectMenuTrigger!: MatMenuTrigger;

    constructor(private codeSessionService: CodeSessionService) {}

    openProjectMenu(): void {
        this.projectMenuTrigger?.openMenu();
    }

    onProjectMenuSelect(project: CodeProjectResponse): void {
        this.projectSelect.emit(project);
    }

    ngOnInit(): void {
        this.loadProjects();
        this.loadRibbonTeamsAndProjects();
    }

    private loadRibbonTeamsAndProjects(): void {
        forkJoin([
            this.teamService.getTeamList().pipe(
                tap(teamList => {
                    this.teamMap = Object.fromEntries(teamList.map(team => [team.id, team]));
                })
            ),
            this.projectService.getProjectList()
        ]).subscribe(([_, projectList]) => {
            // Build teamForViewList
            const tmpTeamMap: { [teamId: string]: TeamForView } = {};
            this.teamForViewList = [];

            projectList.forEach(project => {
                const team = tmpTeamMap[project.teamId];
                if (team) {
                    team.projects.push(project);
                } else if (this.teamMap[project.teamId]) {
                    tmpTeamMap[project.teamId] = { ...this.teamMap[project.teamId], projects: [project] } as TeamForView;
                    this.teamForViewList.push(tmpTeamMap[project.teamId]);
                }
            });

            // Set current project if projectId is provided
            if (this.projectId) {
                this.currentProject = projectList.find(p => p.id === this.projectId) || null;
            }
        });
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['projectId'] && !changes['projectId'].firstChange) {
            this.loadProjects();
            // Update current project when projectId changes
            if (this.projectId && this.teamForViewList.length > 0) {
                for (const team of this.teamForViewList) {
                    const project = team.projects.find(p => p.id === this.projectId);
                    if (project) {
                        this.currentProject = project;
                        break;
                    }
                }
            }
        }
        // 選択されたプロジェクトが変わったら自動展開
        if (changes['selectedProjectName'] && this.selectedProjectName) {
            this.expandProjectByName(this.selectedProjectName);
        }
    }

    private loadProjects(): void {
        this.isLoading = true;

        const observable = this.projectId
            ? this.codeSessionService.getProjectsByProjectId(this.projectId)
            : this.codeSessionService.getProjects();

        observable.subscribe({
            next: (projects) => {
                this.projectNodes = projects.map(p => ({
                    project: p,
                    sessions: [],
                    expanded: p.name === this.selectedProjectName,
                    loading: false
                }));
                this.applyFilter();
                this.isLoading = false;

                // 選択されたプロジェクトのセッションをロード
                if (this.selectedProjectName) {
                    this.expandProjectByName(this.selectedProjectName);
                }
            },
            error: () => {
                this.isLoading = false;
            }
        });
    }

    private expandProjectByName(projectName: string): void {
        const node = this.projectNodes.find(n => n.project.name === projectName);
        if (node) {
            if (!node.expanded) {
                this.toggleProject(node);
            } else if (node.sessions.length === 0 && !node.loading) {
                // 既に展開されているが、セッションが未ロードの場合
                this.loadSessions(node);
            }
        }
    }

    toggleProject(node: ProjectNode): void {
        node.expanded = !node.expanded;

        // 展開時にセッションをロード（まだロードしていない場合）
        if (node.expanded && node.sessions.length === 0 && !node.loading) {
            this.loadSessions(node);
        }
    }

    private loadSessions(node: ProjectNode): void {
        node.loading = true;
        this.codeSessionService.getSessions(node.project.name).subscribe({
            next: (sessions) => {
                node.sessions = sessions;
                // フィルター後のセッション数で更新
                node.project.sessionCount = sessions.length;
                node.loading = false;
            },
            error: () => {
                node.loading = false;
            }
        });
    }

    onProjectClick(node: ProjectNode): void {
        this.projectSelect.emit(node.project);
        if (!node.expanded) {
            this.toggleProject(node);
        } else if (node.sessions.length === 0 && !node.loading) {
            // 既に展開されているが、セッションが未ロードの場合
            this.loadSessions(node);
        }
    }

    onSessionClick(node: ProjectNode, session: CodeSessionListItem): void {
        this.sessionSelect.emit({ project: node.project, session });
    }

    onNewSessionClick(node: ProjectNode, event: Event): void {
        event.stopPropagation();
        this.newSession.emit(node.project);
    }

    onSearchChange(): void {
        this.applyFilter();
    }

    private applyFilter(): void {
        if (!this.searchQuery.trim()) {
            this.filteredNodes = this.projectNodes;
            return;
        }

        const query = this.searchQuery.toLowerCase();
        this.filteredNodes = this.projectNodes.filter(node =>
            node.project.name.toLowerCase().includes(query) ||
            node.project.displayName?.toLowerCase().includes(query) ||
            node.project.path?.toLowerCase().includes(query)
        );
    }

    getDisplayName(project: CodeProjectResponse): string {
        if (project.displayName) {
            return project.displayName;
        }
        // パスから読みやすい名前を生成
        const name = project.name || project.path || '';
        return name
            .replace(/^-mnt-c-Users-[^-]+-/, '')
            .replace(/-/g, '/');
    }

    getProjectIcon(project: CodeProjectResponse): string {
        const name = project.name.toLowerCase();
        if (name.includes('frontend') || name.includes('ui')) return 'web';
        if (name.includes('backend') || name.includes('api')) return 'dns';
        if (name.includes('mobile')) return 'phone_android';
        if (name.includes('test')) return 'science';
        return 'folder';
    }

    getSessionDisplayId(session: CodeSessionListItem): string {
        return session.sessionId.substring(0, 6);
    }

    getSessionPreview(session: CodeSessionListItem): string {
        if (session.firstMessage) {
            return session.firstMessage.length > 20
                ? session.firstMessage.substring(0, 20) + '...'
                : session.firstMessage;
        }
        return session.sessionId.substring(0, 8);
    }

    formatRelativeTime(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return '今';
        if (diffMins < 60) return `${diffMins}分前`;
        if (diffHours < 24) return `${diffHours}時間前`;
        if (diffDays < 7) return `${diffDays}日前`;
        return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
    }

    isProjectSelected(node: ProjectNode): boolean {
        return node.project.name === this.selectedProjectName;
    }

    isSessionSelected(session: CodeSessionListItem): boolean {
        return session.sessionId === this.selectedSessionId;
    }
}
