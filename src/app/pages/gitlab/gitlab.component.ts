import { Component, inject, OnInit } from '@angular/core';
import { ApiGitlabService, GitlabBranch, GitlabTag } from '../../services/api-gitlab.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { GitlabSelectorDialogComponent } from '../../parts/gitlab-selector-dialog/gitlab-selector-dialog.component';
import { ApiGiteaService } from '../../services/api-gitea.service';
import { Router, ActivatedRoute } from '@angular/router';

export type GitProject = {
  default_branch: string,
  id: number,
  name: string,
  path_with_namespace: string,
  description: string | null,
  updated_at: string,
}

@Component({
  selector: 'app-gitlab',
  imports: [CommonModule, FormsModule, MatButtonModule,],
  templateUrl: './gitlab.component.html',
  styleUrl: './gitlab.component.scss'
})
export class GitlabComponent implements OnInit {

  readonly apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  readonly apiGiteaService: ApiGiteaService = inject(ApiGiteaService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly route: ActivatedRoute = inject(ActivatedRoute);

  gitType: 'gitlab' | 'gitea' = 'gitlab'; //
  provider: string = '';
  projectMap: Record<number, {
    branches: GitlabBranch[];
    tags: GitlabTag[];
    project: GitProject;
    selectedTagId?: string; // この行を追加 
    selectedBranchId?: string; // この行を追加
  }> = {};

  projects: {
    default_branch: string,
    id: number,
    name: string,
    path_with_namespace: string,
    description: string | null,
    updated_at: string,
  }[] = [];

  ngOnInit(): void {
    this.route.url.subscribe({
      next: url => {

        this.gitType = url[0].path as 'gitlab' | 'gitea';
        this.provider = url[1].path;
        if (this.gitType === 'gitlab') {
          this.apiGitlabService.projects(this.provider).subscribe(projects => {
            projects.forEach(project => {
              console.log(project);
              this.projects.push(project);
              this.projectMap[project.id] = {
                branches: [],
                tags: [],
                project: project,
                selectedBranchId: project.default_branch,
              };
            });
          });
        } else if (this.gitType === 'gitea') {
          this.apiGiteaService.projects(this.provider).subscribe(projects => {
            projects.forEach(project => {
              console.log(project);
              this.projects.push({ ...project, path_with_namespace: project.full_name });
              this.projectMap[project.id] = {
                branches: [],
                tags: [],
                project: { ...project, path_with_namespace: project.full_name },
                selectedBranchId: project.default_branch,
              };
            });
          });
        } else {
          console.error('unknown git type');
        }
        // this.route.paramMap.subscribe({
        //   next: paramMap => {
        //   },
        // });
      },
    });
  }

  onTags(projectId: number): void {
    this.apiGitlabService.tags(this.provider, projectId).subscribe({
      next: tags => {
        console.log(tags);
        this.projectMap[projectId].tags = tags;
        // this.projectMap[projectId].selectedTagId = tags[0].name;
      },
      error: error => {
        console.error(error);
      },
    });
  }

  onBranches(projectId: number): void {
    this.apiGitlabService.branches(this.provider, projectId).subscribe({
      next: branches => {
        console.log(branches);
        this.projectMap[projectId].branches = branches;
        this.projectMap[projectId].selectedBranchId = this.projectMap[projectId].project.default_branch;
      },
      error: error => {
        console.error(error);
      },
    });
  }

  onSelect(projectId: number): void {
    const project = this.projectMap[projectId].project;
    console.log(this.projectMap[projectId].branches);

    this.dialog.open(GitlabSelectorDialogComponent, {
      data: {
        provider: this.provider,
        gitProject: project,
        refType: 'branches',
        refId: project.default_branch,
      },
    });
  }

  stopImmediatePropagation(event: Event): void {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

