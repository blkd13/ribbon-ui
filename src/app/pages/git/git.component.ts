import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute } from '@angular/router';
import { MatTreeModule } from '@angular/material/tree';
import { MatTabsModule } from '@angular/material/tabs';
import { catchError, map, Observable, of, tap } from 'rxjs';

import { ApiGitlabService, GitlabBranch, GitLabProject, GitlabTag, GitLabUser } from '../../services/api-gitlab.service';
import { GitSelectorDialogComponent } from '../../parts/git-selector-dialog/git-selector-dialog.component';
import { ApiGiteaService, GiteaRepository, GiteaUser } from '../../services/api-gitea.service';
import { AppMenuComponent } from "../../parts/app-menu/app-menu.component";
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { OAuth2Provider } from '../../services/auth.service';
import { safeForkJoin } from '../../utils/dom-utils';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** ツリーに表示するノードの型 */
export interface GitNode {
  name: string;
  id: number;
  children?: GitNode[];    // 子ノード
  isLoading?: boolean;     // 子ノードをロード中かどうか
  isExpandable?: boolean;  // 「さらに下がありそうかどうか」示したい場合
  isExpanded?: boolean;    // 展開状態
  username?: string;        // 組織名
  web_url: string;
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

@Component({
  selector: 'app-git',
  imports: [
    CommonModule, FormsModule,
    MatIconModule, MatButtonModule, MatTreeModule, MatTabsModule, MatProgressSpinnerModule,
    AppMenuComponent, UserMarkComponent,
  ],
  templateUrl: './git.component.html',
  styleUrl: './git.component.scss'
})
export class GitComponent implements OnInit {

  readonly apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  readonly apiGiteaService: ApiGiteaService = inject(ApiGiteaService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly route: ActivatedRoute = inject(ActivatedRoute);

  // 子ノードの取得
  readonly database: { [provider: string]: { [key: string]: (provider: OAuth2Provider, node?: GitNode) => Observable<GitNode[]> } } = {
    gitlab: {
      groups: (provider: OAuth2Provider, node?: GitNode): Observable<GitNode[]> => {
        return this.apiGitlabService.groupChildren(provider, node?.id).pipe(
          map(groups => (groups as GitLabProject[]).map(item => <GitNode>{ ...item, isExpandable: !item.path_with_namespace })),
        )
      },
      users: (provider: OAuth2Provider, node?: GitNode): Observable<GitNode[]> => {
        return this.apiGitlabService.usersChildren(provider, node?.id, this.searchKeyword[this.selectedTabIndex]).pipe(
          map(groups => (groups as (GitLabUser | GitLabProject)[]).map(item => <GitNode>{ ...item, isExpandable: !(item as GitLabProject).path_with_namespace, web_url: item.web_url })),
        );
      },
    },
    gitea: {
      groups: (provider: OAuth2Provider, node?: GitNode): Observable<GitNode[]> => {
        return this.apiGiteaService.groupChildren(provider, (node as any)?.key).pipe(
          map(groups => (groups as GiteaRepository[]).map(item => <GitNode>{ ...item, isExpandable: !item.clone_url, web_url: item.html_url })),
        )
      },
      users: (provider: OAuth2Provider, node?: GitNode): Observable<GitNode[]> => {
        return this.apiGiteaService.userChildren(provider, (node as any)?.key).pipe(
          map(users => (users as (GiteaUser | GiteaRepository)[]).map(item => <GitNode>{ ...item, isExpandable: !(item as GiteaRepository).clone_url, web_url: (item as GiteaRepository).html_url || `` })),
        );
      },
    },
  };

  listTypes: ('groups' | 'users')[] = ['groups', 'users'];
  gitType!: 'gitlab' | 'gitea'; //
  provider!: OAuth2Provider;

  /**
   * ツリー用のデータ。
   * `[dataSource]` にあたるものを単なる配列で持つ。
   */
  treeData = {
    groups: [] as GitNode[],
    users: [] as GitNode[],
  };

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
  isLoading: boolean = false;
  hasMore: boolean = true;

  projects: GitProject[] = [];

  selectedTabIndex = 0;
  searchKeyword: [string, string, string] = ['', '', ''];

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
          if (node && !node.isExpandable) {
            return of([]);
          } else {
            return this.database[this.gitType][this.listTypes[this.selectedTabIndex]](this.provider, node).pipe(tap(
              children => node.children = children
            ));
          }
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
        this.provider = url[0].path as OAuth2Provider;
        this.gitType = this.provider.split('-')[0] as 'gitlab' | 'gitea';
        document.title = `${this.provider}`;

        // Object.keys(this.database)
        safeForkJoin((this.listTypes)
          .map(listType => this.database[this.gitType][listType](this.provider).pipe(
            tap(children => {
              this.treeData[listType] = children;
            })
          ))
        ).subscribe({
          next: children => {
            // console.log(children);
            // this.treeData = children;
          },
          error: err => {
            console.error(err);
          }
        })

        // もし「最初にトップレベルのノードを取得してツリーに出したい」なら
        // ここで database.getChildren(..., 0) 相当を呼んでもOK。
        // いったん何もない状態で初期化しておく。
        this.treeData = { groups: [], users: [] };

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
    const listType = this.listTypes[this.selectedTabIndex];
    if (listType) {
      this.database[this.gitType][listType](this.provider).pipe(
        tap(children => {
          this.treeData[listType] = children;
        })
      ).subscribe();
    } else {
      this.projects = [];
      this.page = 1;
      this.load(1).subscribe({
        next: next => {
          this.loadMore();
        }
      });
    }
  }

  load(page: number = 0): Observable<GitProject[]> {
    this.isLoading = true;
    return (() => {
      if (this.gitType === 'gitlab') {

        return this.apiGitlabService.projects(this.provider, undefined, { page, per_page: this.perPage, search: this.searchKeyword[this.selectedTabIndex] || undefined }).pipe(map(projects => {
          return projects.map(_project => {
            const project: GitProject = _project as any as GitProject;
            project.url = _project.web_url;
            return project;
          });
        }));
      } else if (this.gitType === 'gitea') {
        return this.apiGiteaService.projects(this.provider, undefined, { page, limit: this.perPage, q: this.searchKeyword[this.selectedTabIndex] || undefined }).pipe(map(projects => {
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
          this.isLoading = false;
        });
      }),
      catchError(error => {
        this.isLoading = false;
        console.error(error);
        throw error;
      }),
    );
  }

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
      !this.isLoading &&
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

