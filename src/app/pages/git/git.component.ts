import { Component, inject, Injectable, OnInit } from '@angular/core';
import { ApiGitlabService, GitlabBranch, GitLabProject, GitlabTag } from '../../services/api-gitlab.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { GitSelectorDialogComponent } from '../../parts/git-selector-dialog/git-selector-dialog.component';
import { ApiGiteaService, GiteaRepository } from '../../services/api-gitea.service';
import { Router, ActivatedRoute } from '@angular/router';
import { AppMenuComponent } from "../../parts/app-menu/app-menu.component";
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { catchError, map, Observable, of, tap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { MatTreeModule } from '@angular/material/tree';
import { MatTabsModule } from '@angular/material/tabs';

/** ツリーに表示するノードの型 */
export interface GitNode {
  name: string;
  id: number;
  children?: GitNode[];    // 子ノード
  isLoading?: boolean;     // 子ノードをロード中かどうか
  isExpandable?: boolean;  // 「さらに下がありそうかどうか」示したい場合
  isExpanded?: boolean;    // 展開状態
  username?: string;        // 組織名
}

export type GitProject = {
  default_branch: string;
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  updated_at: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class GitDynamicDatabase {
  apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  apiGiteaService: ApiGiteaService = inject(ApiGiteaService);
  http: HttpClient = inject(HttpClient);

  // 子ノードの取得
  getChildren(provider: string, node?: GitNode): Observable<GitNode[]> {
    // path_with_namespace がある場合はプロジェクトなので子ノードは取得しない
    if (node && !node.isExpandable) {
      return of([]);
    } else {
      if (provider.startsWith('gitlab')) {
        return this.apiGitlabService.groupChildren(provider, node?.id).pipe(
          map(groups => groups.map(item => <GitNode>{ ...item, isExpandable: !(item as GitLabProject).path_with_namespace })),
        );
      } else if (provider.startsWith('gitea')) {
        return this.apiGiteaService.groupChildren(provider, (node as any)?.key).pipe(
          map(groups => groups.map(item => <any>{ ...item, isExpandable: !((item as GiteaRepository).clone_url), project_url: (item as GiteaRepository).html_url })),
        );
      } else {
        throw Error(`unknown provider ${provider}`);
      }
    }
  }

  // ダウンロードメソッドはそのままでOK
  downloadFile(fileId: string, fileName: string): Observable<void> {
    return this.http.get(`/user/oauth/api/proxy/box/2.0/files/${fileId}/content`,
      { responseType: 'blob' }
    ).pipe(
      map(blob => {
        // blobからファイルを作成してダウンロード
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        window.URL.revokeObjectURL(url);
      })
    );
  }
}

@Component({
  selector: 'app-git',
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTreeModule, MatTabsModule, AppMenuComponent, UserMarkComponent],
  templateUrl: './git.component.html',
  styleUrl: './git.component.scss'
})
export class GitComponent implements OnInit {

  readonly apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  readonly apiGiteaService: ApiGiteaService = inject(ApiGiteaService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly route: ActivatedRoute = inject(ActivatedRoute);
  readonly database: GitDynamicDatabase = inject(GitDynamicDatabase);

  gitType: 'gitlab' | 'gitea' = 'gitlab'; //
  provider: string = '';
  projectMap: Record<number, {
    branches: GitlabBranch[];
    tags: GitlabTag[];
    project: GitProject;
    selectedTagId?: string; //
    selectedBranchId?: string; //
  }> = {};

  searchKeyword = '';
  // 既存のプロパティに追加
  page: number = 1;
  perPage: number = 20;
  loading: boolean = false;
  hasMore: boolean = true;

  projects: GitProject[] = [];

  /**
   * ツリー用のデータ。
   * `[dataSource]` にあたるものを単なる配列で持つ。
   */
  treeData: GitNode[] = [];

  /**
   * `[children]` 用のアクセッサ。
   * ノードの `children` プロパティを返す。
   */
  childrenAccessor: (node: GitNode) => GitNode[] | Observable<GitNode[]> = (node: GitNode) => {
    // console.log('childrenAccessor', node);
    if (node.isExpanded) {
      if (node.isExpandable) {
        if (node.children) {
          return of(node.children);
        } else {
          return this.database.getChildren(this.provider, node).pipe(tap(
            children => node.children = children
          ));
        }
      } else {
        return of([]);
      }
    } else {
      return of([]);
    }
  };

  /**
   * 展開のある/なしアイコン制御などで使う判定関数。
   * node.children があればとりあえず「子がある」とみなす。
   */
  hasChild = (_: number, node: GitNode) => node.isExpandable;
  // !!node.children && node.children.length > 0;

  ngOnInit(): void {
    this.route.url.subscribe({
      next: url => {
        this.provider = url[0].path;
        this.gitType = this.provider.split('-')[0] as 'gitlab' | 'gitea';
        document.title = `${this.provider}`;

        this.database.getChildren(this.provider).subscribe({
          next: children => {
            // console.log(children);
            this.treeData = children;
          },
          error: err => {
            console.error(err);
          }
        });

        // もし「最初にトップレベルのノードを取得してツリーに出したい」なら
        // ここで database.getChildren(..., 0) 相当を呼んでもOK。
        // いったん何もない状態で初期化しておく。
        this.treeData = [];

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

  onSearch(): void {

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
          // console.log(project);
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

  onSelectProject(project: GitProject): void {
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

