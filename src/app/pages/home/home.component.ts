import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FullPathFile, FileUploadContent, FileManagerService } from './../../services/file-manager.service';
import { MessageService, ProjectService, TeamService, ThreadService } from './../../services/project.service';
import { forkJoin, from, map, mergeMap, of, switchMap } from 'rxjs';
import { Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { ChatPanelComponent } from '../../parts/chat-panel/chat-panel.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatDividerModule } from '@angular/material/divider';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';

import { ChatInputArea, ChatService, CountTokensResponse } from '../../services/chat.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, tap, toArray } from 'rxjs';
import { DomUtils, safeForkJoin } from '../../utils/dom-utils';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { ThreadDetailComponent } from '../../parts/thread-detail/thread-detail.component';
import { AuthService } from '../../services/auth.service';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { Project, ProjectVisibility, Team, TeamForView, TeamType, Thread, ThreadVisibility, UUID } from '../../models/project-models';
import { NewlineToBrPipe } from '../../pipe/newline-to-br.pipe';
import { RelativeTimePipe } from '../../pipe/relative-time.pipe';
import { Utils } from '../../utils';
import { GService } from '../../services/g.service';
import { CreateProjectDialogComponent } from '../../parts/create-project-dialog/create-project-dialog.component';
import { ApiGitlabService, GitLabProject } from '../../services/api-gitlab.service';
import { ApiMattermostService, MattermostChannel, MattermostTeam, MattermostTeamForView, MattermostTeamUnread, MattermostThread } from '../../services/api-mattermost.service';
import { ApiBoxService } from '../../services/api-box.service';
import { ApiGiteaService } from '../../services/api-gitea.service';
import { MarkdownModule } from 'ngx-markdown';
import { UserMarkComponent } from '../../parts/user-mark/user-mark.component.js';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, ChatPanelComponent, FileDropDirective, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatSliderModule, MatMenuModule, MatDialogModule, MatRadioModule, MatGridListModule,
    MatDividerModule, MatSnackBarModule, MatCardModule, MatBadgeModule,
    MarkdownModule,
    DialogComponent, NewlineToBrPipe, RelativeTimePipe,
    UserMarkComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent implements OnInit {

  readonly authService: AuthService = inject(AuthService);
  readonly chatServce: ChatService = inject(ChatService);
  readonly projectService: ProjectService = inject(ProjectService);
  readonly teamService: TeamService = inject(TeamService);
  readonly threadService: ThreadService = inject(ThreadService);
  readonly messageService: MessageService = inject(MessageService);
  readonly fileManagerService: FileManagerService = inject(FileManagerService);
  readonly dbService: NgxIndexedDBService = inject(NgxIndexedDBService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  readonly apiGitlabService: ApiGitlabService = inject(ApiGitlabService);
  readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);
  readonly apiBoxService: ApiBoxService = inject(ApiBoxService);
  readonly apiGiteaService: ApiGiteaService = inject(ApiGiteaService);
  environment: any;
  aloneTeam!: Team;
  teamList: TeamForView[] = [];
  teamWithoutAloneList: TeamForView[] = [];
  teamMap: { [key: string]: TeamForView } = {};

  defaultProject!: Project;
  projectList: Project[] = [];
  projectWithoutDefaultList: Project[] = [];

  model: string = 'gemini-1.5-pro';

  placeholder: string = '';
  inputText: string = '';
  systemPrompt: string = '';
  staticMessageList = [{
    label: '普通のAIチャット',
    systemPrompt: 'アシスタントAI',
    // placeholder: 'メッセージを入力...。\nShift+Enterで改行。\nCtrl+Enterで送信。\nDrag＆Drop、ファイル貼り付け。',
    placeholder: 'メッセージを入力...。\nShift+Enterで改行。\nCtrl+Enterで送信。\nDrag＆Drop、ファイル貼り付け。',
  }, {
    label: '音声 → 議事録',
    systemPrompt: Utils.trimLines(`
      あなたは音声議事録作成支援AIです。ユーザーが提供する音声ファイルから議事録を作成する役割を担っています。以下の要件に従って、正確かつ簡潔に議事録を作成してください：

      1. 音声ファイルの文字起こしを行い、話者ごとに発言内容を記録する。
      2. 重要な議題、決定事項、次回のアクションアイテムを明確にする。
      3. 議事録には日時と参加者の名前を含める。

      ユーザーが音声ファイルを提供した際には、その内容に基づいて適切な議事録を作成してください。
    `),
    placeholder: `音声ファイルをここにドラッグ＆ドロップしてください`,
  }, {
    label: '英語メール → 日本語',
    systemPrompt: Utils.trimLines(`
      あなたは英文メール翻訳と解析支援AIです。ユーザーが提供する英文メールを以下の手順で処理します：

      1. 英文メールを日本語に翻訳する際、メールの構造（挨拶、本文、締めの言葉など）を明確にする。
      2. 翻訳と共にメールの要約を提供する。
      3. メール内容に基づいた適切な返信内容のアドバイスを提供する。

      ユーザーが英文メールを提供した際には、これらの手順に従って対応してください。
    `),
    placeholder: `英文メールをここに貼り付けてください`,
  }, {
    label: '日本語メール → 英語',
    systemPrompt: Utils.trimLines(`
      あなたは日本語ビジネスメールの英訳支援AIです。ユーザーが提供する日本語のビジネスメールを以下の要件に従って翻訳してください：

      1. 敬語表現や礼儀正しい表現を用いて、日本語のメールをビジネスに適した英語のメールに翻訳する。
      2. メールの構造（挨拶、本文、締めの言葉など）をビジネスメールとして適切に整える。

      ユーザーが日本語メールを提供した際には、この要件に従って翻訳してください。
    `),
    placeholder: `日本語メールをここに貼り付けてください`,
  }];

  // スレッドリスト
  threadList: Thread[] = [];

  sortType: number = 1;

  bannerList: { title: string, body: string }[] = [];

  showRecentChats = false;
  maxDisplay = 6; // 例：3件以上で隠す

  toggleRecentChats() {
    this.showRecentChats = !this.showRecentChats;
  }

  ngOnInit(): void {
    document.title = `Ribbon UI`;

    if (JSON.parse(localStorage.getItem('settings-v1.0') || '{}')['model']) {
      this.model = JSON.parse(localStorage.getItem('settings-v1.0') || '{}')['model'];
    } else { }

    // 定型文無しを選択
    this.placeholder = this.staticMessageList[0].placeholder;
    this.systemPrompt = this.staticMessageList[0].systemPrompt;
    this.g.share['home->chat'] = {};

    this.loadModels().subscribe({
      next: next => {
        // デフォルト系のロード完了
        this.teamList.forEach(_team => {
          const team = _team as TeamForView;
          team.projects = this.projectWithoutDefaultList.filter(project => project.teamId === team.id);
        });
      },
      error: err => {
        // エラーハンドリング
        console.error(err);
      }
    })
  }

  sortThread(threadList: Thread[]): void {
    if (this.sortType === 1) {
      // 時刻順（新しい方が上に来る）
      threadList.sort((a, b) => b.updatedAt < a.updatedAt ? -1 : 1);
    } else {
      // 名前順（Aが上に来る）
      threadList.sort((a, b) => b.title < a.title ? 1 : -1);
    }
  }

  loadThreads(project: Project): Observable<Thread[]> {
    return this.threadService.getThreadList(project.id).pipe(tap(threadList => {
      this.sortThread(threadList);
      // 
      this.threadList = threadList;
      if (threadList.length) {
        // 本来はlastUpdateでソートしたかったが、何故か時刻が更新されていないので。
      } else {
      }
    }));
  }

  loadProjects(): Observable<Project[]> {
    return this.projectService.getProjectList().pipe(
      switchMap(projectList => {
        // デフォルトプロジェクト有無をチェック
        const defaultProject = projectList.find(project => this.teamMap[project.teamId].teamType === TeamType.Alone && this.teamMap[project.teamId].createdBy === this.authService.getUserInfo().id && project.visibility === ProjectVisibility.Default);
        return defaultProject ?
          // defaultProjectがあればそのまま使う。プロジェクトリストもそのままのものを返す。
          (this.defaultProject = defaultProject, of(projectList)) :
          // 無ければデフォルトプロジェクトを作ってからthisに設定する。プロジェクトリストも取り直す。
          this.projectService.createProject({
            teamId: this.aloneTeam.id, label: '個人用デフォルト', name: 'default', visibility: ProjectVisibility.Default
          }).pipe(
            tap(project => this.defaultProject = project),
            switchMap(project => this.projectService.getProjectList()),
          );
        // // デフォルトプロジェクトのスレッド一覧を取得する。
        // defaultProject$.pipe(switchMap(project => this.loadThreads(project)));
      }),
      tap(projectList => {
        this.projectList = projectList;
        // 個人用デフォルトプロジェクト以外のプロジェクトに絞る。
        this.projectWithoutDefaultList = projectList.filter(project => !(this.teamMap[project.teamId].teamType === TeamType.Alone && this.teamMap[project.teamId].createdBy === this.authService.getUserInfo().id && project.visibility === ProjectVisibility.Default));
      }),
    );
  }

  loadTeams(): Observable<Team[]> {
    return this.teamService.getTeamList().pipe(
      switchMap(teamList => {
        // 自分専用チーム有無をチェック
        const aloneTeam = teamList.find(team => team.teamType === TeamType.Alone && team.createdBy === this.authService.getUserInfo().id);
        return aloneTeam ?
          // aloneTeamがあればそのまま使う。チームリストもそのままのものを返す。
          (this.aloneTeam = aloneTeam, of(teamList)) :
          // 無ければAloneのチームを作ってからthisに設定する。チームリストも取り直す。
          this.teamService.createTeam({
            name: 'Alone', label: 'Alone', teamType: TeamType.Alone, description: 'Alone'
          }).pipe(
            tap(team => this.aloneTeam = team),
            switchMap(team => this.teamService.getTeamList()),
          );
      }),
      tap(teamList => {
        this.teamList = teamList as TeamForView[];
        this.teamWithoutAloneList = teamList.filter(team => !(team.teamType === TeamType.Alone && team.createdBy === this.authService.getUserInfo().id)) as TeamForView[];
        this.teamMap = this.teamList.reduce((prev, curr) => {
          prev[curr.id] = curr;
          return prev;
        }, {} as { [key: string]: TeamForView });
      }),
    );
  }

  loadModels(): Observable<Thread[]> {
    // 必要モデルのロード
    return of(0).pipe( // 0のofはインデント揃えるためだけに入れてるだけで特に意味はない。
      switchMap(() => this.loadTeams()),
      switchMap(() => this.loadProjects()),
      switchMap(() => this.loadThreads(this.defaultProject))
    );
  }

  selectedTeamId!: string;
  createProject(): void {
    // this.dialog.open(CreateProjectDialogComponent, { height: 'calc(100vh - 200px)', width: 'calc(100vw - 200px)' });
    const { aloneTeam, teamWithoutAloneList } = this;
    this.dialog.open(CreateProjectDialogComponent, {
      height: '600px', width: '600px',
      data: { aloneTeam, teamWithoutAloneList }
    });
  }

  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ($event.shiftKey) {
        // this.onChange();
      } else if ($event.ctrlKey) {
        this.submit();
      } else {
        // this.onChange();
      }
    } else {
      // // 最後のキー入力から1000秒後にonChangeが動くようにする。1000秒経たずにここに来たら前回のタイマーをキャンセルする
      // clearTimeout(this.timeoutId);
      // this.timeoutId = setTimeout(() => this.onChange(), 1000);
    }
  }

  changeModel(): void {
    if (this.model) {
      if (this.model.startsWith('claude-')) {
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${this.model} は海外リージョン（us-east5）を利用します。\n個人情報は絶対に入力しないでください。`, options: ['Close'] } });
      } else if (this.model.startsWith('meta/')) {
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${this.model} は海外リージョン（us-central1）を利用します。\n個人情報は絶対に入力しないでください。`, options: ['Close'] } });
      } else if (this.model.endsWith('-experimental')) {
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${this.model} は海外リージョン（us-central1）を利用します。\n実験的なモデルのため結果が正確でない可能性があります。`, options: ['Close'] } });
      }
    } else { }
  }

  submit(): void {
    this.g.share['home->chat'] = { static: this.staticMessageList[0], userPrompt: this.inputText, model: this.model };
    this.router.navigate(['chat', this.defaultProject.id]);
  }

  setStatic(staticMessage: { label: string, systemPrompt: string, placeholder: string }): void {
    this.g.share['home->chat'] = { static: staticMessage, model: this.model };
    this.router.navigate(['chat', this.defaultProject.id]);
  }

  // ドラッグアンドドロップの部。
  // TODO ダサいのでdirectiveに統合したい。いやどうだろう。
  onFilesDropped(files: FullPathFile[]) {
    this.g.share['home->chat'] = { static: this.staticMessageList[0], userPrompt: this.inputText, files, model: this.model };
    this.router.navigate(['chat', this.defaultProject.id]);
  }

  // moveToExternal(provider: string): void {
  //   const me: Record<string, Observable<any>> = {
  //     mattermost: this.apiMattermostService.mattermostMe(),
  //     box: this.apiBoxService.boxMe(),
  //   };
  //   this.authService.getOAuthAccountList().subscribe({
  //     next: next => {
  //       if (next.oauthAccounts.find(acc => acc.provider === provider)) {
  //         me[provider].subscribe({
  //           next: next => {
  //             this.router.navigate(['/', provider]);
  //           },
  //           error: error => {
  //             location.href = `/api/oauth/${provider}/login/${provider}`;
  //           },
  //         });
  //       } else {
  //         location.href = `/api/oauth/${provider}/login/${provider}`;
  //       }
  //     }
  //   });
  // }
}
