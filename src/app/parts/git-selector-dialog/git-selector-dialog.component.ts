import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { genDummyId, MessageService, ProjectService, TeamService, ThreadService } from '../../services/project.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ContentPartType, Project, Team, ThreadGroup } from '../../models/project-models';
import { safeForkJoin } from '../../utils/dom-utils';
import { ApiGitlabService, GitlabBranch, GitlabCommit, GitlabTag } from '../../services/api-gitlab.service';
import { CommonModule } from '@angular/common';
import { switchMap } from 'rxjs';
import { ApiGiteaService, GiteaBranch, GiteaRepository, GiteaTag } from '../../services/api-gitea.service';
import { GitProject } from '../../pages/git/git.component';


export type GitlabRefType = 'branches' | 'tags' | 'commits';

@Component({
  selector: 'app-git-selector-dialog',
  imports: [
    CommonModule,
    FormsModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './git-selector-dialog.component.html',
  styleUrl: './git-selector-dialog.component.scss'
})
export class GitSelectorDialogComponent {

  readonly projectService: ProjectService = inject(ProjectService);
  readonly teamService: TeamService = inject(TeamService);
  readonly threadService: ThreadService = inject(ThreadService);
  readonly messageService: MessageService = inject(MessageService);

  readonly apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  readonly apiGiteaService: ApiGiteaService = inject(ApiGiteaService);
  readonly dialogRef: MatDialogRef<GitSelectorDialogComponent> = inject(MatDialogRef);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly data = inject<{ provider: string, gitProject: GitProject, refType: GitlabRefType, refId: string, }>(MAT_DIALOG_DATA);

  isLoading = false;
  systemPrompt: string = `プログラマー。`;
  userPrompt: string = `プログラムを理解してください。`;
  projectList: Project[] = [];
  projectId: string = '';

  selectedIndex: number = 0;

  branches: GitlabBranch[] = [];
  tags: GitlabTag[] = [];
  commits: GitlabCommit[] = [];

  ref = '';

  change(a: any): void {
    console.log(a);
  }

  constructor() {
    this.isLoading = true;

    this.ref = this.data.refType + ':' + this.data.refId;
    const provider = this.data.provider;
    const tagBranchObservable = [];
    if (provider.startsWith('gitlab')) {
      const gitProjectId = this.data.gitProject.id;
      tagBranchObservable.push(this.apiGitlabService.branches(provider, gitProjectId));
      tagBranchObservable.push(this.apiGitlabService.tags(provider, gitProjectId));
    } else if (provider.startsWith('gitea')) {
      const owner = (this.data.gitProject as any as GiteaRepository).owner.login;
      const projectName = this.data.gitProject.name;
      tagBranchObservable.push(this.apiGiteaService.branches(provider, owner, projectName));
      tagBranchObservable.push(this.apiGiteaService.tags(provider, owner, projectName));
    }

    safeForkJoin<Team[] | Project[] | GitlabBranch[] | GitlabTag[] | GiteaBranch[] | GiteaTag[]>([
      this.teamService.getTeamList(),
      this.projectService.getProjectList(),
      ...tagBranchObservable,
    ]).subscribe({
      next: next => {
        this.isLoading = false;
        const teamList = next[0] as Team[];
        const aloneTeamIdList = teamList.filter(t => t.teamType === 'Alone').map(t => t.id);
        if (aloneTeamIdList.length > 0) {
          this.projectList = next[1] as Project[];
          const defaultProject = this.projectList.find(p => aloneTeamIdList.includes(p.teamId) && p.visibility === 'Default');
          if (defaultProject) {
            this.projectId = defaultProject.id;
          } else {
            this.projectId = this.projectList[0].id;
          }
        } else {
          this.projectId = this.projectList[0].id;
        }

        this.branches = next[2] as GitlabBranch[] || [];
        this.tags = next[3] as GitlabTag[] || [];
      },
    });

  }

  onSelect(): void {
    this.isLoading = true;
    // gitlabのプロジェクトを取得
    const gitProject = this.data.gitProject;
    const [refType, refId] = this.ref.split(':') as [GitlabRefType, string];

    const service = this.data.provider.startsWith('gitlab')
      ? this.apiGitlabService.fetchCommit(this.data.provider, gitProject.id, { projectId: this.projectId, }, refType, refId)
      : this.apiGiteaService.fetchCommit(this.data.provider, (this.data.gitProject as any as GiteaRepository).owner.login, gitProject.name, { projectId: this.projectId, }, refType, refId);
    service.subscribe({
      next: project => {
        console.log(project);

        const threadGroup = this.threadService.genInitialThreadGroupEntity(this.projectId);
        threadGroup.title = this.data.gitProject.name;
        threadGroup.description = this.data.gitProject.description || '';
        let newThreadGroup!: ThreadGroup;
        this.threadService.upsertThreadGroup(this.projectId, threadGroup).pipe(
          switchMap(_threadGroup => {
            newThreadGroup = _threadGroup;
            return safeForkJoin(newThreadGroup.threadList.map(thread => {
              const contentPartPrompt = this.messageService.initContentPart(genDummyId(), this.systemPrompt);
              const messageGroup = this.messageService.initMessageGroup(thread.id, undefined, 'system', [contentPartPrompt],);
              return this.messageService.upsertSingleMessageGroup(messageGroup);
            }));
          }),
          switchMap(systemPromptMessageGroup => {
            return safeForkJoin(newThreadGroup.threadList.map((thread, index) => {
              const contentPartPrompt = this.messageService.initContentPart(genDummyId(), this.userPrompt);
              const contentPartFile = this.messageService.initContentPart(genDummyId(), project.fileGroup.label);
              contentPartFile.type = ContentPartType.FILE;
              contentPartFile.linkId = project.fileGroup.id;
              const messageGroup = this.messageService.initMessageGroup(thread.id, systemPromptMessageGroup[index].id, 'user', [contentPartPrompt, contentPartFile],);
              return this.messageService.upsertSingleMessageGroup(messageGroup);
            }));
          }),
        ).subscribe({
          next: next => {
            this.isLoading = false;
            // console.log(next);
            // console.log(newThreadGroup);
            // this.snackBar.open('プロジェクトを取得しました。', 'OK', { duration: 3000 });
            window.open(`./#/chat/${newThreadGroup.projectId}/${newThreadGroup.id}`, '_blank');
            this.dialogRef.close();
          },
          error: error => {
            this.isLoading = false;
            console.error(error);
            this.snackBar.open('プロジェクトを取得できませんでした。', 'OK', { duration: 3000 });
          }
        });
      },
      error: error => {
        this.isLoading = false;
        console.error(error);
        this.snackBar.open('プロジェクトを取得できませんでした。', 'OK', { duration: 3000 });
      },
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}
