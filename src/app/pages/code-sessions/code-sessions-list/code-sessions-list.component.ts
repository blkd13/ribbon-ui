import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { CodeProject } from '../../../models/code-session-models';
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
    FormsModule,
    RelativeTimePipe,
  ],
  templateUrl: './code-sessions-list.component.html',
  styleUrls: ['./code-sessions-list.component.scss']
})
export class CodeSessionsListComponent implements OnInit {
  projects: CodeProject[] = [];
  filteredProjects: CodeProject[] = [];
  loading = true;
  searchQuery = '';

  constructor(
    private router: Router,
    private codeSessionService: CodeSessionService
  ) { }

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.loading = true;
    this.codeSessionService.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects.sort((a, b) =>
          new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
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

  navigateToProject(project: CodeProject): void {
    this.router.navigate(['/', 'code-sessions', project.name]);
  }

  getProjectIcon(projectName: string): string {
    if (projectName.includes('frontend') || projectName.includes('visualizer')) return 'web';
    if (projectName.includes('backend') || projectName.includes('api')) return 'dns';
    if (projectName.includes('scrape')) return 'cloud_download';
    if (projectName.includes('music')) return 'music_note';
    return 'folder';
  }
}
