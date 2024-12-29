import { Component, inject } from '@angular/core';
import { ApiGitlabService, GitLabProject } from '../../services/api-gitlab.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-gitlab',
  imports: [CommonModule],
  templateUrl: './gitlab.component.html',
  styleUrl: './gitlab.component.scss'
})
export class GitlabComponent {

  readonly gitlabProvider = 'gitlab';
  readonly apiGitlabService = inject(ApiGitlabService);

  projects: GitLabProject[] = [];

  constructor() {
    this.apiGitlabService.projects(this.gitlabProvider).subscribe(projects => {
      this.projects = projects;
      console.log(projects);
    });
  }

  onSelect(projectId: number): void {
    this.apiGitlabService.projectClone(this.gitlabProvider, projectId).subscribe(project => {
      console.log(project);
    });
  }
}

