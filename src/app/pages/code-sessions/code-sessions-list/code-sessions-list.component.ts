import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { CodeProjectResponse } from '../../../models/code-session-models';
import { RelativeTimePipe } from '../../../pipe/relative-time.pipe';
import { CodeSessionService } from '../../../services/code-session.service';

@Component({
  selector: 'app-code-sessions-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    FormsModule,
    RelativeTimePipe,
  ],
  templateUrl: './code-sessions-list.component.html',
  styleUrls: ['./code-sessions-list.component.scss']
})
export class CodeSessionsListComponent implements OnInit {
  projects: CodeProjectResponse[] = [];
  filteredProjects: CodeProjectResponse[] = [];
  loading = true;
  searchQuery = '';

  // モード分岐用
  mode: 'all' | 'project' = 'all';
  projectId: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private codeSessionService: CodeSessionService,
    private http: HttpClient,
    private snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    // ルートからprojectIdを取得してモード判定
    this.route.params.subscribe(params => {
      this.projectId = params['projectId'] || null;
      this.mode = this.projectId ? 'project' : 'all';
      this.loadProjects();
    });
  }

  loadProjects(): void {
    this.loading = true;

    const projects$ = this.mode === 'project' && this.projectId
      ? this.codeSessionService.getProjectsByProjectId(this.projectId)
      : this.codeSessionService.getProjects();

    projects$.subscribe({
      next: (projects) => {
        this.projects = projects.sort((a, b) =>
          new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()
        );
        this.filteredProjects = this.projects;
        this.loading = false;
      },
      error: (error) => {
        console.error('Failed to load projects:', error);
        this.loading = false;
      }
    });
  }

  onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredProjects = this.projects;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredProjects = this.projects.filter(project =>
      project.displayName.toLowerCase().includes(query) ||
      project.name.toLowerCase().includes(query) ||
      project.path.toLowerCase().includes(query)
    );
  }

  navigateToProject(project: CodeProjectResponse): void {
    if (this.mode === 'project' && this.projectId) {
      this.router.navigate(['/', 'code-sessions', this.projectId, project.name]);
    } else {
      this.router.navigate(['/', 'user-code-sessions', project.name]);
    }
  }

  navigateToSettings(): void {
    this.router.navigate(['/user-code-sessions/settings']);
  }

  startNewSession(): void {
    if (!this.projectId) return;

    this.snackBar.open('コンテナを起動中...', '', { duration: 0 });

    // コンテナを起動（既存エンドポイント）
    this.http.get(`/user/auth/project-permission/${this.projectId}/`).subscribe({
      next: () => {
        this.snackBar.dismiss();
        // session-detail画面に遷移（新規セッション用）
        this.router.navigate(['/', 'code-sessions', this.projectId, '_new', 'new']);
      },
      error: (err) => {
        console.error('Container startup failed:', err);
        this.snackBar.open('コンテナ起動に失敗しました', '閉じる', { duration: 5000 });
      }
    });
  }

  getProjectIcon(projectName: string): string {
    if (projectName.includes('frontend') || projectName.includes('visualizer')) return 'web';
    if (projectName.includes('backend') || projectName.includes('api')) return 'dns';
    if (projectName.includes('scrape')) return 'cloud_download';
    if (projectName.includes('music')) return 'music_note';
    return 'folder';
  }
}
