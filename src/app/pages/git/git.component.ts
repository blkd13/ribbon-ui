import { Component, inject, OnInit } from '@angular/core';
import { ApiGitlabService, GitlabBranch, GitlabTag } from '../../services/api-gitlab.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { GitSelectorDialogComponent } from '../../parts/git-selector-dialog/git-selector-dialog.component';
import { ApiGiteaService } from '../../services/api-gitea.service';
import { Router, ActivatedRoute } from '@angular/router';
import { AppMenuComponent } from "../../parts/app-menu/app-menu.component";
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { catchError, map, Observable, tap } from 'rxjs';

export type GitProject = {
  default_branch: string;
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  updated_at: string;
  url: string;
}

@Component({
  selector: 'app-git',
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, AppMenuComponent, UserMarkComponent],
  templateUrl: './git.component.html',
  styleUrl: './git.component.scss'
})
export class GitComponent implements OnInit {

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
    selectedTagId?: string; //
    selectedBranchId?: string; //
  }> = {};


  // 既存のプロパティに追加
  page: number = 1;
  perPage: number = 20;
  loading: boolean = false;
  hasMore: boolean = true;

  projects: GitProject[] = [];

  ngOnInit(): void {
    this.route.url.subscribe({
      next: url => {

        this.provider = url[0].path;
        this.gitType = this.provider.split('-')[0] as 'gitlab' | 'gitea';

        this.page = 1;
        this.load(1).subscribe({
          next: next => {
            this.loadMore();
          }
        });
        // this.route.paramMap.subscribe({
        //   next: paramMap => {
        //   },
        // });
      },
    });
  }

  load(page: number = 0): Observable<GitProject[]> {
    this.loading = true;
    return (() => {
      if (this.gitType === 'gitlab') {
        return this.apiGitlabService.projects(this.provider, undefined, { page, per_page: this.perPage }).pipe(map(projects => {
          return projects.map(_project => {
            const project: GitProject = _project as any as GitProject;
            project.url = _project.web_url;
            return project;
          });
        }));
      } else if (this.gitType === 'gitea') {
        return this.apiGiteaService.projects(this.provider, undefined, { page, limit: this.perPage }).pipe(map(projects => {
          return projects.map(_project => {
            const project: GitProject = _project as any as GitProject;
            project.path_with_namespace = _project.full_name;
            project.url = _project.html_url;
            return project;
          });
        }));
      } else {
        console.error('unknown git type');
        throw new Error('unknown git type');
      }
    })().pipe(
      tap(projects => {
        projects.forEach(project => {
          console.log(project);
          if (projects.length < this.perPage) {
            this.hasMore = false;
          }
          this.projects.push(project);
          this.projectMap[project.id] = {
            branches: [],
            tags: [],
            project: project,
            selectedBranchId: project.default_branch,
          };

          // this.page++;
          this.loading = false;
        });
      }),
      catchError(error => {
        this.loading = false;
        console.error(error);
        throw error;
      }),
    );
  }

  // onTags(projectId: number): void {
  //   this.apiGitlabService.tags(this.provider, projectId).subscribe({
  //     next: tags => {
  //       console.log(tags);
  //       this.projectMap[projectId].tags = tags;
  //       // this.projectMap[projectId].selectedTagId = tags[0].name;
  //     },
  //     error: error => {
  //       console.error(error);
  //     },
  //   });
  // }

  // onBranches(projectId: number): void {
  //   this.apiGitlabService.branches(this.provider, projectId).subscribe({
  //     next: branches => {
  //       console.log(branches);
  //       this.projectMap[projectId].branches = branches;
  //       this.projectMap[projectId].selectedBranchId = this.projectMap[projectId].project.default_branch;
  //     },
  //     error: error => {
  //       console.error(error);
  //     },
  //   });
  // }

  onSelect(projectId: number): void {
    const project = this.projectMap[projectId].project;
    console.log(this.projectMap[projectId].branches);

    this.dialog.open(GitSelectorDialogComponent, {
      data: {
        provider: this.provider,
        gitProject: project,
        refType: 'branches',
        refId: project.default_branch,
      },
    });
  }

  onScroll(event: any): void {
    const element = event.target;
    if (
      !this.loading &&
      this.hasMore &&
      element.scrollHeight - element.scrollTop <= element.clientHeight + 100
    ) {
      this.loadMore();
    }
  }

  loadMore(): void {
    this.page++;
    this.load(this.page).subscribe();
  }

  stopImmediatePropagation(event: Event): void {
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

