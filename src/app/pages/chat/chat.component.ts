import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FileEntity, FileManagerService, FileUploadContent, FullPathFile } from './../../services/file-manager.service';
import { genDummyId, MessageService, ProjectService, TeamService, ThreadService } from './../../services/project.service';
import { concatMap, from, map, mergeMap, of, Subscription, switchMap, Observer, BehaviorSubject, filter } from 'rxjs';
import { ChangeDetectorRef, Component, ElementRef, NgZone, OnInit, QueryList, TemplateRef, ViewChild, ViewChildren, inject } from '@angular/core';
import { ChatPanelMessageComponent } from '../../parts/chat-panel-message/chat-panel-message.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { saveAs } from 'file-saver';

import { CachedContent, SafetyRating, safetyRatingLabelMap } from '../../models/models';
import { ChatContent, ChatInputArea, ChatService, CountTokensResponse } from '../../services/chat.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, tap, toArray } from 'rxjs';
import { DomUtils, safeForkJoin } from '../../utils/dom-utils';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { ThreadDetailComponent } from '../../parts/thread-detail/thread-detail.component';
import { AuthService } from '../../services/auth.service';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { BaseEntity, ContentPart, ContentPartType, Message, MessageClusterType, MessageForView, MessageGroup, MessageGroupForView, MessageGroupType, MessageStatusType, Project, ProjectVisibility, Team, TeamType, Thread, ThreadGroup, ThreadGroupType, ThreadGroupVisibility, UUID } from '../../models/project-models';
import { GService } from '../../services/g.service';
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { BulkRunSettingComponent } from '../../parts/bulk-run-setting/bulk-run-setting.component';
import { Utils } from '../../utils';
import { ParameterSettingDialogComponent } from '../../parts/parameter-setting-dialog/parameter-setting-dialog.component';
import { ChatPanelSystemComponent } from "../../parts/chat-panel-system/chat-panel-system.component";
import { ChatPanelBaseComponent } from '../../parts/chat-panel-base/chat-panel-base.component';


@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, FileDropDirective, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatSliderModule, MatMenuModule, MatDialogModule, MatRadioModule, MatSelectModule,
    MatSnackBarModule, MatDividerModule, MatCheckboxModule, MatProgressSpinnerModule,
    UserMarkComponent,
    ChatPanelMessageComponent, ChatPanelSystemComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent implements OnInit {

  // メッセージ表示ボックスのリスト
  @ViewChildren(ChatPanelMessageComponent)
  chatPanelList!: QueryList<ChatPanelMessageComponent>;

  // メッセージ表示ボックスのリスト
  @ViewChildren(ChatPanelSystemComponent)
  chatSystemPanelList!: QueryList<ChatPanelSystemComponent>;

  // チャット入力欄
  @ViewChild('textAreaElem', { static: false })
  textAreaElem!: ElementRef<HTMLTextAreaElement>;

  // チャット表示欄
  @ViewChild('textBodyElem', { static: false })
  textBodyElem!: ElementRef<HTMLDivElement>;

  @ViewChild(FileDropDirective, { static: false })
  appFileDrop?: FileDropDirective;

  // スレッドリスト
  threadGroupList: ThreadGroup[] = [];
  // 現在のスレッド
  selectedThreadGroup$: BehaviorSubject<ThreadGroup> = new BehaviorSubject<ThreadGroup>(null as any as ThreadGroup);
  // 現在のスレッド
  selectedThreadGroup!: ThreadGroup;
  // show
  messageGroupIdListMas: { [threadId: string]: string[] } = {};

  // メッセージ一覧のインデックス。メッセージグループの数が最大のスレッドのメッセージグループ数を取得して、その数だけインデックスを作る。
  indexList = Array.from({ length: 0 }, (_, i) => i);

  bitCounter = 0; // chatPanelにイベントを送るためだけのカウンタ

  // キャッシュ保持時間（1時間）
  cacheTtlInSeconds = 60 * 60;

  inputArea: ChatInputArea = this.generateInitalInputArea();

  selectedDanmen: string = '';

  aloneTeam!: Team;
  defaultProject!: Project;
  selectedProject!: Project;
  projectList: Project[] = [];
  teamMap: { [key: string]: Team } = {};

  placeholder = '';
  defaultPlaceholder = 'メッセージを入力...。Shift+Enterで改行。Ctrl+Enterで送信。Drag＆Drop、ファイル貼り付け。';
  chatStreamSubscriptionList: { [threadGroupId: string]: Subscription[] } = {};
  cacheMap: { [key: string]: CachedContent } = {};
  editNameThreadId: string = '';
  private timeoutId: any;
  bulkRunSetting: {
    mode: 'serial' | 'parallel',
    promptTemplate: string,
    contents: ({ type: 'text', text: string } | { type: 'file', text: string, fileId: string })[]
  } = {
      mode: 'serial',
      promptTemplate: `ありがとうございます。\nでは次は"\${value}"をお願いします。`,
      contents: [],
    };

  // 画面インタラクション系
  allExpandCollapseFlag = true; // メッセージの枠を全部一気に開くか閉じるかのフラグ
  isCost = true;
  showThreadList = true; // スレッドリスト表示フラグ
  showInfo = true;
  sortType: number = 1;
  isLock = false;
  isThreadGroupLoading = false;
  tailRole = 'system';
  cost: number = 0;
  charCount: number = 0;
  tokenObj: CountTokensResponse = { totalTokens: 0, totalBillableCharacters: 0, text: 0, image: 0, audio: 0, video: 0 };

  readonly authService: AuthService = inject(AuthService);
  readonly chatService: ChatService = inject(ChatService);
  readonly projectService: ProjectService = inject(ProjectService);
  readonly teamService: TeamService = inject(TeamService);
  readonly threadService: ThreadService = inject(ThreadService);
  readonly messageService: MessageService = inject(MessageService);
  readonly fileManagerService: FileManagerService = inject(FileManagerService);
  readonly dbService: NgxIndexedDBService = inject(NgxIndexedDBService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  readonly ngZone: NgZone = inject(NgZone);

  ngOnInit(): void {
    of(0).pipe(
      switchMap(() => this.loadTeams()),
      switchMap(() => this.loadProjects()),
    ).subscribe(ret => {
      this.routerChangeHandler();
    });

    setInterval(() => {
      if (this.textAreaElem && this.textAreaElem.nativeElement) {
        // とりあえず毎秒高さ調整をしとく。
        DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement);
      } else { }
    }, 1000);
  }

  changeModel(index: number): void { }
  // editChat(resDto: MessageGroup): void { }

  generateInitalInputArea(): ChatInputArea {
    return { role: 'user', content: [{ type: 'text', text: '' }], messageGroupId: '' };
  }

  openModelSetting() {
    // const settings = {
    //   model: this.selectedModel,
    //   temperature: this.temperature,
    //   maxTokens: this.maxTokens,
    //   topP: this.topP,
    //   frequencyPenalty: this.frequencyPenalty,
    //   presencePenalty: this.presencePenalty
    // };
    // console.log('モデル設定:', settings);
    // ここで、モデルを起動する処理を実行（APIコールなど）
    this.dialog.open(ParameterSettingDialogComponent, {
      data: {
        threadGroup: this.selectedThreadGroup,
      },
    }).afterClosed().subscribe((result: ThreadGroup) => {
      if (result) {
        this.selectedThreadGroup = result;
        // Object.assign(this.selectedThreadGroup, result);
        safeForkJoin(
          this.selectedThreadGroup.threadList
            // 既存スレッドの場合は何もしないので除外する
            .filter(thread => !this.messageService.messageGroupList.find(messageGroup => messageGroup.threadId === thread.id))
            // 新規スレッドの場合は元スレッドをコピー
            .map(thread => this.messageService.cloneThreadDry(this.selectedThreadGroup.threadList[0], thread.id))
        ).subscribe({
          next: resDto => {
            this.rebuildThreadGroup();
            this.onChange();
          },
          error: error => {
            console.error(error);
          }
        });
      } else {
        // キャンセルされた場合
      }
    });
  }

  routerChangeHandler(): void {
    this.activatedRoute.params.subscribe(params => {
      const { projectId, threadGroupId } = params as { projectId: string, threadGroupId: string };
      const project = this.projectList.find(project => project.id === projectId);

      if (this.selectedProject === project) {
        // プロジェクト変更なし
        if (this.selectedThreadGroup.id === threadGroupId) {
          // なんもしない。
        } else {
          this.threadGroupChangeHandler(project, this.threadGroupList, threadGroupId);
        }
      } else {
        // プロジェクト変更あり
        if (project) {
          this.selectedProject = project;
          // puroject指定がある場合、指定されたプロジェクトでスレッドリストを取得
          this.isThreadGroupLoading = true;
          this.loadThreadGroups(project).subscribe({
            next: threadGroupList => {
              this.isThreadGroupLoading = false;
              this.threadGroupChangeHandler(project, threadGroupList, threadGroupId);
            },
            error: error => {
              this.isThreadGroupLoading = false;
              console.error(error);
            },
          });
        } else {
          // guardが掛かってるのでnullになることはないはず。。
        }
      }
    });
  }

  threadGroupChangeHandler(project: Project, threadGroupList: ThreadGroup[], threadGroupId: string): void {
    let noSend = true;
    if (threadGroupId === 'new-thread') {
      this.messageService.clear(); // ストック情報を全消ししておく。
      // 新規スレッド作成
      this.selectedThreadGroup = this.threadService.genInitialThreadGroupEntity(this.selectedProject.id);
      this.selectedThreadGroup.threadList.forEach(thread => {
        const contentPart = this.messageService.initContentPart(genDummyId(), 'アシスタントAI');
        this.messageService.addSingleMessageGroupDry(thread.id, undefined, 'system', [contentPart]);
      });

      this.rebuildThreadGroup();

      this.inputArea = this.generateInitalInputArea();
      // this.inputArea.previousMessageGroupId = lastMessage.id;
      this.cdr.detectChanges();
      setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);

      // ホーム画面からの遷移の場合は初期値を入れる
      if (this.g.share['home->chat'] && this.g.share['home->chat'].static) {
        // ホーム画面から：home->chat経由で初期値指定されているときは初期値入れる。
        const args = this.g.share['home->chat'];
        // this.messageClusterList.forEach(cluster => cluster[0].contents[0].text = args.static.systemPrompt);
        // this.messageList[0].contents[0].text = args.static.systemPrompt;
        this.placeholder = args.static.placeholder;
        this.selectedThreadGroup.threadList[0].inDto.args.model = args.model || this.selectedThreadGroup.threadList[0].inDto.args.model;
        if (args.static.label === '普通のAIチャット') {
          // home画面はドラッグアンドドロップに対応してないのでプレースホルダが異なる。
          this.placeholder = this.defaultPlaceholder;
        }
        if (args.files) {
          this.onFilesDropped(args.files);
        }
        if (args.userPrompt) {
          // 上流からユーザープロンプトが来てたらそのまま投げる。
          this.inputArea.content[0].text = args.userPrompt;
          if (args.files) {
            // ファイル付きの場合はアップロードが終わっていない可能性があるのでsendまではしない。
            this.onChange();
          } else {
            this.send().subscribe();
          }
        } else {
          this.onChange();
        }
        this.g.share['home->chat'] = {}; // 消す
      } else {
        this.onChange();
      }
    } else {
      // 
      if (this.selectedThreadGroup && this.selectedThreadGroup.id === threadGroupId) {
        // 既に選択中のスレッドが選択された場合は何もしない。
      } else {
        // 選択中のスレッドではない既存スレッドを選択
        // デフォルト系のロード完了。スレッドがあればそれを選択
        const threadGroup = threadGroupList.find(threadGroup => threadGroup.id === threadGroupId);
        if (threadGroup) {
          // ココがスレッド選択時の初回処理になるので、ここで初期化処理を行う。復帰とか。
          this.selectedThreadGroup = threadGroup;
          this.cdr.detectChanges();
          this.isThreadGroupLoading = true;
          this.messageService.initThreadGroup(threadGroup.id).pipe(
            switchMap(() => safeForkJoin(
              this.selectedThreadGroup.threadList
                // 既存スレッドの場合は何もしないので除外する
                .filter(thread => !this.messageService.messageGroupList.find(messageGroup => messageGroup.threadId === thread.id))
                // 新規スレッドの場合は元スレッドをコピー
                .map(thread => this.messageService.cloneThreadDry(this.selectedThreadGroup.threadList[0], thread.id))
            )),
            tap(resDto => {
              // console.log(resDto);
              this.rebuildThreadGroup();

              // 5件以上だったら末尾2件を開く。5件未満だったら全部開く。
              // this.allExpandCollapseFlag = this.messageList.length < 5;
              this.allExpandCollapseFlag = this.messageGroupIdListMas[this.selectedThreadGroup.threadList[0].id].length < 5;

              // スレッドオブジェクトとメッセージグループオブジェクトの不整合（複数スレッドのはずなのにメッセージグループが無いとか）が起きていても大丈夫なようにする。
            }),
            switchMap(resDto => safeForkJoin(
              this.selectedThreadGroup.threadList.map(thread => this.messageGroupIdListMas[thread.id]
                .slice().reverse().filter((messageGroupId, index) => index < 5)
                .map((messageGroupId, index) => this.messageService.messageGroupMas[messageGroupId].messages)
              ).flat().flat().map(message => this.messageService.getMessageContentParts(message))
            )),
            tap(tapRes => {

              let isExist = false;
              // 実行中のメッセージがあったら復旧する
              Object.keys(this.messageGroupIdListMas).forEach(threadId => {
                this.messageGroupIdListMas[threadId].forEach(messageGroupId => {
                  if (this.messageService.messageGroupMas[messageGroupId]) {
                    const message = this.messageService.messageGroupMas[messageGroupId].messages[this.messageService.messageGroupMas[messageGroupId].messages.length - 1];
                    const resDto = this.chatService.getObserver(message.id);
                    if (resDto && resDto.observer) {
                      // 別ページから復帰した場合に再開する。
                      message.contents[0].text = resDto.text;
                      this.chatStreamSubscriptionList[threadGroup.id] = this.chatStreamSubscriptionList[threadGroup.id] || [];
                      this.chatStreamSubscriptionList[threadGroup.id].push(resDto.observer.subscribe(this.chatStreamHander(message)));
                      isExist = true;
                    } else { }
                  } else { }
                });
              });

              if (isExist) {
              } else {
                this.onChange();
              }
              this.isThreadGroupLoading = false;

              // 一番下まで下げる
              setTimeout(() => { DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); }, 500);

              // this.router.navigate(['chat', this.selectedProject.id, thread.id], { relativeTo: this.activatedRoute });
              setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);

              document.title = `AI : ${this.selectedThreadGroup?.title || 'Ribbon UI'}`;
            }),
          ).subscribe({
            error: error => {
              this.isThreadGroupLoading = false;
              console.error(error);
            },
          });
        } else {
          this.clear();
          this.onChange();
        }
      }
    }
  }

  sortThreadGroup(threadGroupList: ThreadGroup[]): ThreadGroup[] {
    // 本来はlastUpdateでソートしたかったが、何故か時刻が更新されていないので。
    if (this.sortType === 1) {
      // 時刻順（新しい方が上に来る）
      threadGroupList.sort((a, b) => b.lastUpdate < a.lastUpdate ? -1 : 1);
    } else {
      // 名前順（Aが上に来る）
      threadGroupList.sort((a, b) => b.title < a.title ? 1 : -1);
    }
    return threadGroupList;
  }

  loadThreadGroups(project: Project): Observable<ThreadGroup[]> {
    return this.threadService.getThreadGroupList(project.id).pipe(tap(threadGroupList => {
      threadGroupList.forEach(threadGroup => {
        threadGroup.threadList.forEach(thread => {
          if (thread.inDto.args.cachedContent) {
            this.cacheMap[threadGroup.id] = thread.inDto.args.cachedContent;
          } else { }
        });
      });
      // ノーマルスレッドグループだけ持ってくる
      this.threadGroupList = this.sortThreadGroup(threadGroupList).filter(threadGroup => threadGroup.type === ThreadGroupType.Normal);
    }));
  }

  loadProjects(): Observable<Project[]> {
    return this.projectService.getProjectList().pipe(
      tap(projectList => {
        this.projectList = projectList;
        // guardが掛かっているので必ずある
        this.defaultProject = projectList.find(project => project.visibility === ProjectVisibility.Default) as Project;
      }));
  }

  loadTeams(): Observable<Team[]> {
    return this.teamService.getTeamList().pipe(
      tap(teamList => {
        // guardが掛かっているので必ずある
        this.aloneTeam = teamList.find(team => team.teamType === TeamType.Alone) as Team;
        this.teamMap = Object.fromEntries(teamList.map(team => [team.id, team]));
      })
    );
  }

  rebuildThreadGroup(): { [threadId: string]: string[] } {
    this.messageGroupIdListMas = this.messageService.rebuildThreadGroup(this.messageService.messageGroupMas);
    // 末尾のroleを取得
    const line = this.messageGroupIdListMas[this.selectedThreadGroup.threadList[0].id];
    this.tailRole = line[line.length - 1] ? this.messageService.messageGroupMas[line[line.length - 1]].role : 'system';
    // メッセージグループの数が最大のスレッドを探す
    const maxMessageGroupCount = Object.values(this.messageGroupIdListMas).map(messageGroupIdList => messageGroupIdList.length).reduce((a, b) => Math.max(a, b), 0);
    this.indexList = Array.from({ length: maxMessageGroupCount }, (_, i) => i);
    return this.messageGroupIdListMas;
  }

  createThreadGroup(): Observable<ThreadGroup> {
    return this.threadService.upsertThreadGroup(this.selectedProject.id, { title: '', description: '', visibility: ThreadGroupVisibility.Team, threadList: [] }).pipe(tap(threadGroup => {
      this.selectedThreadGroup = threadGroup;
      // this.inDto = this.selectedThreadGroup.inDto;
      this.threadGroupList.unshift(threadGroup);
      this.sortThreadGroup(this.threadGroupList);
    }));
  }

  saveThreadGroup(_orgThreadGroup: ThreadGroup): Observable<ThreadGroup> {
    const orgThreadGroup = Utils.clone(_orgThreadGroup);
    // 選択中スレッドを保存
    return this.threadService.upsertThreadGroup(this.selectedProject.id, _orgThreadGroup).pipe(tap(threadGroup => {
      if (orgThreadGroup.id.startsWith('dummy-')) {
        this.threadGroupList.unshift(threadGroup);
      } else { }
      // TODO 本当はここの反映はserviceでやりたいけど、サービスが割れてるからやりにくい。。
      threadGroup.threadList.forEach((thread, index) => {
        this.messageGroupIdListMas[orgThreadGroup.threadList[index].id].forEach(messageGroupId => {
          this.messageService.messageGroupMas[messageGroupId].threadId = thread.id;
        });
      });
      this.rebuildThreadGroup();
    }));
  }

  // selectThreadGroup(projectId: string, threadGroup: ThreadGroup): Observable<any> {
  //   if (this.selectedThreadGroup === threadGroup) {
  //     return of(0);
  //   } else {
  //     this.router.navigate(['chat', projectId, threadGroup.id]);
  //   }
  //   return of(0);
  //   // // 既存スレッド選択中に別スレッドを選択した場合、前回まで選択していたスレッドを保存する。（フォーカス外れたタイミングで保存する感じ）
  //   // // if (location.pathname.endsWith(thread.id)) {
  //   // // } else {
  //   // //   return of(null);
  //   // // }
  //   // this.router.navigate(['chat', projectId, threadGroup.id]);
  //   // const beforeSelectedThread = this.selectedThreadGroup;
  //   // // 選択中スレッドを変更
  //   // this.selectedThreadGroup = threadGroup;
  //   // // this.inDto = threadGoroup.inDto;

  //   // // TODO DANGER 何か良からぬことが起きている。selectedThreadが書き換わるはずないのに書き換わってしまうので仕方なくthreadListと切り離す。しかもこれが起きるのは本番モードだけという、、、
  //   // // this.selectedThreadGroup = JSON.parse(JSON.stringify(thread));

  //   // this.cdr.detectChanges();
  //   // return safeForkJoin([
  //   //   (beforeSelectedThread && threadGroup !== beforeSelectedThread && this.selectedDanmen !== JSON.stringify(beforeSelectedThread))
  //   //     ? this.save(this.selectedThreadGroup)
  //   //     : of(this.selectedThreadGroup),
  //   //   this.messageService.getMessageGroupList(threadGroup.id).pipe(
  //   //     tap(resDto => {
  //   //       this.selectedDanmen = JSON.stringify(this.selectedThreadGroup);
  //   //       // スレッド初期化
  //   //       this.initializeThread(resDto.messageGroups);
  //   //       const lastMessage = this.getLatestMessage(resDto.messageGroups);
  //   //       this.inputArea.previousMessageGroupId = lastMessage.id;
  //   //       if (this.previousMessageIdMap[lastMessage.id]) {
  //   //         this.previousMessageIdMap[lastMessage.id].selectedIndex = this.previousMessageIdMap[lastMessage.id].messages.length;
  //   //         this.inputArea.messageGroupId = this.previousMessageIdMap[lastMessage.id].id;
  //   //       }
  //   //       this.rebuildMessageList();
  //   //       this.onChange();

  //   //       // 5件以上だったら末尾2件を開く。5件未満だったら全部開く。
  //   //       // this.allExpandCollapseFlag = this.messageList.length < 5;
  //   //       this.allExpandCollapseFlag = this.messageClusterList.length < 5;
  //   //     }),
  //   //     switchMap(resDto => safeForkJoin(
  //   //       // this.messageList.slice().reverse()
  //   //       //   .filter(message => !message.id.startsWith('dummy-'))
  //   //       //   .filter((message, index) => index < (this.allExpandCollapseFlag ? 10 : 2))
  //   //       //   .map(message => this.messageService.getMessageContentParts(message))
  //   //       this.messageClusterList.slice().reverse()
  //   //         .filter(cluster => !cluster[0].id.startsWith('dummy-'))
  //   //         .filter((_, index) => index < (this.allExpandCollapseFlag ? 10 : 2))
  //   //         .map(cluster => this.messageService.getMessageContentParts(cluster[0]))
  //   //     )),
  //   //     tap(tapRes => {

  //   //       // 実行中のメッセージがあったら復旧する
  //   //       Object.keys(this.messageMap).forEach(messageId => {
  //   //         const resDto = this.chatService.getObserver(messageId);
  //   //         if (resDto && resDto.observer) {
  //   //           // 別ページから復帰した場合に再開する。
  //   //           // const responseMessage = this.messageList[this.messageList.length - 1];
  //   //           const responseMessage = this.messageClusterList[this.messageClusterList.length - 1][0];
  //   //           responseMessage.contents[0].text = resDto.text;
  //   //           this.chatStreamSubscription = resDto.observer.subscribe(this.chatStreamHander(responseMessage));
  //   //         } else { }
  //   //       });

  //   //       // 一番下まで下げる
  //   //       setTimeout(() => { DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); }, 500);

  //   //       // this.router.navigate(['chat', this.selectedProject.id, thread.id], { relativeTo: this.activatedRoute });
  //   //       setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);

  //   //       document.title = `AI : ${this.selectedThreadGroup?.title || 'Ribbon UI'}`;
  //   //     }),
  //   //     map(ret => null)
  //   //   )
  //   // ]);
  // }

  // loadModels(): Observable<ThreadGroup[]> {
  //   // 必要モデルのロード
  //   return of(0).pipe( // 0のofはインデント揃えるためだけに入れてるだけで特に意味はない。
  //     switchMap(() => this.loadTeams()),
  //     switchMap(() => this.loadProjects()),
  //     switchMap(() => this.loadThreadGroups(this.defaultProject))
  //   );
  // }

  // export(threadIndex: number): void {
  //   if (threadIndex < 0) {
  //     this.dbService.getAll('threadList').subscribe(obj => {
  //       const text = JSON.stringify(obj);
  //       const blob = new Blob([text], { type: 'application/json' });
  //       const url = window.URL.createObjectURL(blob);
  //       const a = document.createElement('a');
  //       a.href = url;
  //       a.download = 'threadList.json';
  //       a.click();
  //       window.URL.revokeObjectURL(url);
  //     });
  //   } else {
  //     const text = JSON.stringify(this.threadGroupList[threadIndex]);
  //     const blob = new Blob([text], { type: 'application/json' });
  //     const url = window.URL.createObjectURL(blob);
  //     const a = document.createElement('a');
  //     a.href = url;
  //     a.download = `thread-${threadIndex}.json`;
  //     a.click();
  //     window.URL.revokeObjectURL(url);
  //   }
  // }

  // generateInitialMessageGroup(): MessageGroupResponseDto {
  //   const defaultSystemPrompt = 'アシスタントAI';
  //   const defaultRole = 'system';

  //   const messageGroup = this.chatMessageService.initMessageUpsertDto(this.selectedThreadGroup?.id || '');

  //   const message = this.chatMessageService.initMessage(messageGroup.id, 0);
  //   message.label = defaultSystemPrompt.substring(0, 250);

  //   const contentPart = this.messageService.initContentPart(message.id);
  //   contentPart.text = defaultSystemPrompt;

  //   messageGroup.role = defaultRole;
  //   messageGroup.label = message.label;

  //   message.contents.push(contentPart);
  //   messageGroup.messages.push(message);
  //   return messageGroup;
  // }

  onFilesDropped(files: FullPathFile[]): Subscription {
    // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする。
    this.tokenObj.totalTokens = -1;
    this.isLock = true;
    return this.fileManagerService
      .uploadFiles({ projectId: this.selectedProject.id, contents: files.map(file => ({ filePath: file.fullPath, base64Data: file.base64String, })) })
      .subscribe({
        next: next => {
          next.results.forEach(fileEntity => {
            this.inputArea.content.push({ type: 'file', fileId: fileEntity.id, text: fileEntity.fileName });
          });

          this.onChange();
          this.isLock = false;
        },
        error: error => {
          this.snackBar.open(`アップロードエラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
          this.isLock = false;
        },
      });
  }

  onFileSelected(event: any) {
    const items = (event.target as HTMLInputElement).files;
    this.fileManagerService.onFileOrFolderMultipleForInputTag(items as any).then((files: FullPathFile[]) => {
      this.onFilesDropped(files);
    });
  }

  openFileDialog(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  calcCost(): number {
    const charCount = (this.tokenObj.text + this.tokenObj.image + this.tokenObj.audio + this.tokenObj.video);
    const isLarge = this.tokenObj.totalTokens > 128000 ? 2 : 0;
    // const cost = charCount / 1000 * this.chatService.priceMap[this.inDto.args.model || 'gemini-1.5-pro'].price[isLarge];
    const cost = this.selectedThreadGroup.threadList.map(thread => thread.inDto.args).reduce((prev, curr) => prev + charCount / 1000 * this.chatService.priceMap[curr.model || 'gemini-1.5-pro'].price[isLarge], 0);
    return cost;
  }

  // getLatestMessage(messageGroups: MessageGroupResponseDto[]): MessageForView {
  //   let latestMessage: MessageForView | undefined = undefined;
  //   let latestDate: Date | undefined = undefined;
  //   let latestSeq: number | undefined = undefined;
  //   for (const group of messageGroups) {
  //     for (const message of group.messages) {
  //       const messageDate = new Date(message.lastUpdate);
  //       if (!latestDate || messageDate > latestDate) {
  //         latestDate = messageDate;
  //         latestMessage = message;
  //       }
  //       // const messageSeq = message.seq;
  //       // if (!latestSeq || messageSeq > latestSeq) {
  //       //   latestSeq = messageSeq;
  //       //   latestMessage = message;
  //       // }
  //     }
  //   }
  //   // エラー
  //   if (latestMessage) { } else { throw Error('Message not found'); }
  //   return latestMessage;
  // }

  // selectLatest(messageGroup: MessageGroupResponseDto): number {
  //   const ary = messageGroup.messages;
  //   if (ary.length === 0) {
  //     // throw new Error("Array is empty");
  //     messageGroup.selectedIndex = 0;
  //     return 0;
  //   }
  //   let latestIndex = 0;
  //   // updateだと途中でキャッシュ作ると逆転するのでcreateを使う。
  //   let latestDate = ary[0].createdAt;
  //   for (let i = 1; i < ary.length; i++) {
  //     if (ary[i].createdAt > latestDate) {
  //       latestDate = ary[i].createdAt;
  //       latestIndex = i;
  //     }
  //   }
  //   messageGroup.selectedIndex = latestIndex;
  //   return latestIndex;
  // }

  // initializeThread(messageGroups: MessageGroupResponseDto[]): void {
  //   this.messageGroupListAll = messageGroups;

  //   // MessageGroupResponseDto の selectedIndex を設定する
  //   messageGroups.forEach(this.selectLatest);

  //   // previoudMessageId（一個前のメッセージID）が無いもをRootとして取り出しておく。
  //   const rootMessageGroup = messageGroups.find(messageGroup => !messageGroup.previousMessageId);
  //   if (rootMessageGroup) {
  //     this.rootMessageGroup = rootMessageGroup;
  //   } else {
  //     throw new Error('Root not found');
  //   }

  //   // ID, MessageForView のモデル化
  //   this.messageMap = messageGroups.reduce((prev, curr) => {
  //     curr.messages.forEach(message => prev[message.id] = message);
  //     return prev;
  //   }, {} as Record<UUID, MessageForView>);

  //   // ID, MessageGroupResponseDto のモデル化
  //   this.messageGroupMap = messageGroups.reduce((prev, curr) => {
  //     prev[curr.id] = curr;
  //     return prev;
  //   }, {} as Record<UUID, MessageGroupResponseDto>);

  //   // ツリーを作る
  //   this.previousMessageIdMap = messageGroups.reduce((prev, curr) => {
  //     if (curr.previousMessageId) {
  //       if (prev[curr.previousMessageId]) {
  //         // ツリー構造としてmessagePreviousIDが被るのはおかしい。分岐はmessageGroupで行われるべきであって。
  //         // throw Error('Model error');
  //         // おかしいけどなってしまったものは仕方ないのでそのまま動かす。
  //         // TODO 後でモデル側も更新するようにする。
  //         curr.messages.unshift(...prev[curr.previousMessageId].messages);
  //         curr.selectedIndex = curr.messages.length - 1;
  //         console.log(`curr.selectedIndex=${curr.selectedIndex}`);
  //         prev[curr.previousMessageId] = curr;
  //       } else {
  //         prev[curr.previousMessageId] = curr;
  //       }
  //     } else { /** rootは無視 */ }
  //     return prev;
  //   }, {} as Record<UUID, MessageGroupResponseDto>);
  // }

  // rebuildMessageList(): void {
  //   // 表示するメッセージ一覧
  //   // this.messageList = [];
  //   this.messageClusterList = [];
  //   if (this.rootMessageGroup.messages[this.rootMessageGroup.selectedIndex]) {
  //     // 先頭にルートを設定
  //     // this.messageList.push(this.rootMessageGroup.messages[this.rootMessageGroup.selectedIndex]);
  //     this.messageClusterList.push([this.rootMessageGroup.messages[this.rootMessageGroup.selectedIndex]]);
  //   } else {
  //     return;
  //   }
  //   while (true) {
  //     // const message = this.messageList[this.messageList.length - 1];
  //     const message = this.messageClusterList[this.messageClusterList.length - 1][0];
  //     // 先行後続マップ
  //     const messageGroup = this.previousMessageIdMap[message.id];
  //     if (messageGroup) {
  //       // inputAreaに相当する場合はselectedIndexがOutOfBoundしてるのでselectedMessageがnullになるはず。
  //       const selectedMessage = messageGroup.messages[messageGroup.selectedIndex];
  //       if (selectedMessage) {
  //         // 選択メッセージリスト
  //         // this.messageList.push(selectedMessage);
  //         this.messageClusterList.push([selectedMessage]);
  //       } else {
  //         // 選択メッセージが無い = inputAreaなので打ち止め
  //         break;
  //       }
  //     } else {
  //       break;
  //     }
  //   }

  //   // TODO inputAreaの更新。こここんな無理矢理だった微妙。。。他で包括的にやらなくていいんだっけ？
  //   // this.inputArea.previousMessageId = this.messageList[this.messageList.length - 1].id;
  //   this.inputArea.previousMessageGroupId = this.messageClusterList[this.messageClusterList.length - 1][0].id;

  //   // キャッシュ有無判定
  //   if (!this.inDto
  //     || !this.inDto.argsList[0].cachedContent
  //     || (this.inDto.argsList[0].cachedContent && new Date(this.inDto.argsList[0].cachedContent.expireTime) < new Date())) {
  //     // キャッシュ有効期限が切れているのでキャッシュを消しておく。
  //     // this.messageList.forEach(message => message.cacheId = undefined);
  //     this.messageClusterList.forEach(cluster => cluster.forEach(message => message.cacheId = undefined));
  //   }
  // }

  // saveMessage(threadId: string, message: MessageForView): Observable<MessageUpsertResponseDto> {
  //   let messageGroup = this.messageGroupMap[message.messageGroupId];
  //   // if (messageGroup) {
  //   // } else {
  //   //   messageGroup = { id: '', previousMessageId: '', } as any;
  //   // }
  //   return this.messageService.upsertMessageWithContents(threadId, {
  //     messageClusterId: messageGroup.messageClusterId,
  //     messageClusterType: messageGroup.messageClusterType || MessageClusterType.Single, // TODO 今nullになってしまうとエラーになるので。。。
  //     messageGroupId: messageGroup.id,
  //     messageId: message.id,
  //     previousMessageId: messageGroup.previousMessageId,
  //     role: messageGroup.role,
  //     label: message.label,
  //     messageGroupType: messageGroup.messageGroupType || MessageGroupType.Single,
  //     contents: message.contents,
  //   }).pipe(tap({
  //     next: next => {
  //       if (message.id && message.id.startsWith('dummy-')) {
  //         // IDが附番されたのでモデル更新しておく
  //         this.messageMap[next.message.id] = this.messageMap[message.id];
  //         delete this.messageMap[message.id]

  //         // contentのIDも附番する。でも中身はもとからあるのやらない。
  //         message.contents.forEach((content, index) => content.id = next.contentParts[index].id);

  //         // dummyを参照していた人々の更新
  //         if (this.previousMessageIdMap[message.id]) {
  //           this.previousMessageIdMap[next.message.id] = this.previousMessageIdMap[message.id];
  //           this.previousMessageIdMap[next.message.id].previousMessageId = next.message.id;
  //           delete this.previousMessageIdMap[message.id]
  //         }

  //         // dummyを参照していた人々の更新
  //         if (this.inputArea.previousMessageGroupId === message.id) {
  //           this.inputArea.previousMessageGroupId = next.message.id;
  //         }

  //       } else {/** dummy以外のものは画面側オブジェクトが最新なので反映する必要はない。 */ }
  //       if (message.messageGroupId && message.messageGroupId.startsWith('dummy-')) {
  //         // IDが附番されたのでモデル更新しておく
  //         this.messageGroupMap[next.messageGroup.id] = this.messageGroupMap[messageGroup.id];
  //         delete this.messageGroupMap[messageGroup.id]

  //         // 子供の更新
  //         messageGroup.messages.forEach(message => message.messageGroupId = next.messageGroup.id);

  //       } else {/** dummy以外のものは画面側オブジェクトが最新なので反映する必要はない。 */ }

  //       // id 発番されてないやつもいるので上書き
  //       message.id = next.message.id;
  //       messageGroup.id = next.messageGroup.id;
  //     }
  //   }));
  // }

  renameThreadGroup($event: Event, threadGroup: ThreadGroup, flag: boolean, $index: number): void {
    if (flag) {
      this.editNameThreadId = threadGroup.id;
      // 遅延でフォーカスさせる
      setTimeout(() => (document.getElementById(`thread-title-${$index}`) as HTMLInputElement)?.select(), 100);
    } else {
      this.editNameThreadId = '';
      threadGroup.title = threadGroup.title || 'No title';
      this.saveThreadGroup(threadGroup).subscribe();
    }
  }

  // duplicate($event: MouseEvent, thread: Thread): void {
  //   this.dialog.open(DialogComponent, { data: { title: 'スレッド複製', message: `未実装です`, options: ['Close'] } });
  //   // これはサーバー側で実装した方が良いやつ。
  //   // // this.stopPropagation($event);
  //   // const dupli = JSON.parse(JSON.stringify(thread)) as Thread;
  //   // dupli.title = thread.title + '_copy';
  //   // this.threadGroupList.push(dupli);
  // }

  // /**
  //  * スレッドを保存、メッセージの組み立て。
  //  * トリガとなるメッセージIDを配信。
  //  */
  // saveAndBuildThread(): Observable<string> {
  //   // 初回送信なので、スレッドを作るところから動かす
  //   const thread = this.selectedThreadGroup
  //     ? this.save(this.selectedThreadGroup) // 二回目以降はメタパラメータを保存するだけ。
  //     : this.save(this.selectedThreadGroup).pipe( // 初回送信の場合は色々動かす。
  //       // selectedThreadに反映
  //       tap(thread => {
  //         this.selectedThreadGroup = thread;
  //         // URL切替
  //         this.router.navigate(['chat', this.selectedProject.id, thread.id]);
  //       }),
  //       // initialのメッセージオブジェクト群（主にシステムプロンプト）をDB登録
  //       switchMap(thread => {
  //         // 最初のリクエストをnullで初期化
  //         let previousResult: MessageUpsertResponseDto[] | undefined = undefined;
  //         // safeForkJoin(this.messageGroupListAll.map(group =>
  //         //   safeForkJoin(group.messages.map(message => this.saveMessage(thread.id, message)))
  //         // ))
  //         // 処理開始
  //         return from(this.messageGroupListAll.map((obj, idx) => ({ obj, idx }))).pipe(
  //           concatMap(({ obj, idx }) => {
  //             return of(null).pipe(
  //               concatMap(() => {
  //                 // 前のリクエストの結果を現在のリクエストに含める
  //                 if (idx > 0 && previousResult) {
  //                   obj.previousMessageId = previousResult[previousResult.length - 1].message.id;
  //                   this.previousMessageIdMap[obj.previousMessageId] = obj;
  //                 } else { }
  //                 return safeForkJoin(
  //                   obj.messages.map(message => this.saveMessage(thread.id, message))
  //                 ).pipe(
  //                   tap(res => {
  //                     // 現在の結果を保存して、次のリクエストで使用
  //                     previousResult = res;
  //                   })
  //                 );
  //               })
  //             );
  //           }),
  //           // 全てのリクエストの結果を配列として返す
  //           toArray(),
  //           tap(upsertResponseList => {
  //             // inputAreaのpreviousMessageIdを更新しておく。
  //             if (previousResult) {
  //               this.inputArea.previousMessageGroupId = previousResult[previousResult.length - 1].message.id;
  //             } else { }
  //           }),
  //         );
  //       }),
  //       // 後続で使うようにthreadに戻しておく
  //       map(upsertResponseList => this.selectedThreadGroup as ThreadGroup),
  //     );
  //   return thread.pipe(
  //     tap(thread => {
  //       // 二回目以降だろうとタイトルが何も書かれていなかったら埋める。
  //       // タイトル自動設定ブロック
  //       if (thread.title && thread.title.trim() && thread.title !== '　') {
  //         // タイトルが設定済みだったら何もしない
  //       } else {
  //         // タイトルが無かったら入力分からタイトルを作る。この処理は待つ必要が無いので投げっ放し。
  //         // const presetText = this.messageList.map(message => message.contents.filter(content => content.type === 'text').map(content => content.text)).join('\n');
  //         const presetText = this.messageClusterList.map(cluster => cluster[0].contents.filter(content => content.type === 'text').map(content => content.text)).join('\n');
  //         const inputText = this.inputArea.contents.filter(content => content.type === 'text').map(content => content.text).join('\n');
  //         const mergeText = `${presetText}\n${inputText}`.substring(0, 1024);
  //         this.chatService.chatCompletionObservableStreamNew({
  //           args: {
  //             max_tokens: 40,
  //             model: 'gemini-1.5-flash',
  //             messages: [
  //               {
  //                 role: 'user',
  //                 content: `この書き出しで始まるチャットにタイトルをつけてください。短く適当でいいです。タイトルだけを返してください。タイトル以外の説明などはつけてはいけません。\n\n\`\`\`markdown\n\n${mergeText}\n\`\`\``
  //               } as any
  //             ],
  //           },
  //         }).subscribe({
  //           next: next => {
  //             next.observer.pipe(tap(text => thread.title += text), toArray()).subscribe({
  //               next: next => this.save(thread).subscribe()
  //             });
  //           },
  //         });
  //       }
  //     }),
  //     switchMap(thread => {
  //       // 入力エリアに何も書かれていない場合はスルーして直前のmessageIdを返す。
  //       if (this.inputArea.contents[0].type === 'text' && this.inputArea.contents[0].text) {
  //         const message = this.messageService.initMessage(this.inputArea.messageGroupId || '');
  //         message.label = this.inputArea.contents.filter(content => content.type === 'text').map(content => content.text).join('\n').substring(0, 250);
  //         this.inputArea.contents.forEach(content => {
  //           const contentPart = this.messageService.initContentPart(message.id);
  //           contentPart.type = content.type as ContentPartType;
  //           contentPart.text = content.text;
  //           contentPart.fileId = contentPart.type === 'file' ? (content as { fileId: string }).fileId : undefined;
  //           message.contents.push(contentPart);
  //         });

  //         if (this.inputArea.messageGroupId && this.messageGroupMap[this.inputArea.messageGroupId]) {
  //           // 既存グループへの追加
  //         } else {
  //           // 新規メッセージグループを作る
  //           const messageGroup = this.messageService.initMessageUpsertDto(thread.id, { role: this.inputArea.role, previousMessageId: this.inputArea.previousMessageGroupId });
  //           this.messageGroupListAll.push(messageGroup);
  //           this.messageGroupMap[messageGroup.id] = messageGroup;
  //           if (messageGroup.previousMessageId) {
  //             this.previousMessageIdMap[messageGroup.previousMessageId] = messageGroup;
  //           } else { }
  //           // メッセージと紐づけ
  //           message.messageGroupId = messageGroup.id;
  //         }
  //         // this.inputArea.editing = 0;
  //         // inputAreaをDB保存。
  //         return this.saveMessage(thread.id, message).pipe(
  //           tap(upsertResponse => {
  //             // 
  //             this.messageGroupMap[upsertResponse.messageGroup.id].messages.push(upsertResponse.message);
  //             // 入力エリアをクリア
  //             this.inputArea = this.generateInitalInputArea();
  //             //再構成
  //             this.rebuildMessageList();
  //             setTimeout(() => {
  //               DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement); // 高さ調整
  //               DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
  //             }, 0);
  //           }),
  //           map(upsertResponse => upsertResponse.message.id),
  //         )
  //       } else {
  //         // return of(this.messageList[this.messageList.length - 1].id); // 末尾にあるメッセージが発火トリガー
  //         return of(this.messageClusterList[this.messageClusterList.length - 1][0].id); // 末尾にあるメッセージが発火トリガー
  //       }
  //     }),
  //     // 発射準備完了。発射トリガーとなるメッセージIDを返す。とりあえずログ出力もしておく。
  //     tap(messageId => console.log('Message ID before chat completion:', messageId)),
  //   );
  // }

  /**
   * スレッドを保存、メッセージの組み立て。
   * トリガとなるメッセージIDを配信。
   * @returns トリガとなるmessageGroupIdの配列
   */
  saveAndBuildThread(): Observable<string[]> {
    // 初回送信なので、スレッドを作るところから動かす
    const threadGroup = (!this.selectedThreadGroup.id.startsWith('dummy-'))
      ? this.saveThreadGroup(this.selectedThreadGroup) // 二回目以降はメタパラメータを保存するだけ。
      : this.saveThreadGroup(this.selectedThreadGroup).pipe( // 初回送信の場合は色々動かす。
        // selectedThreadに反映
        tap(threadGroup => {
          this.selectedThreadGroup = threadGroup;
          // // URL切替
          // this.router.navigate(['chat', this.selectedProject.id, threadGroup.id]);
        }),
        // initialのメッセージオブジェクト群（主にシステムプロンプト）をDB登録
        switchMap(threadGroup =>
          safeForkJoin(threadGroup.threadList.map(thread =>
            this.messageGroupIdListMas[thread.id].map(messageGroupId =>
              this.messageService.upsertSingleMessageGroup(
                this.messageService.messageGroupMas[messageGroupId]
              )
            ),
          ).flat()),
        ),
        // メッセージ状況を反映
        tap(upsertResponseList => this.rebuildThreadGroup()),
        // 後続で使うようにthreadに戻しておく
        map(upsertResponseList => this.selectedThreadGroup),
      );
    return threadGroup.pipe(
      tap(threadGroup => {
        // 二回目以降だろうとタイトルが何も書かれていなかったら埋める。
        // タイトル自動設定ブロック
        if (threadGroup.title && threadGroup.title.trim() && threadGroup.title !== '　') {
          // タイトルが設定済みだったら何もしない
        } else {
          // タイトルが無かったら入力分からタイトルを作る。この処理は待つ必要が無いので投げっ放し。
          const presetText = this.messageService.messageGroupList.map(messageGroup => messageGroup.messages[0].contents.filter(content => content.type === 'text').map(content => content.text)).join('\n');
          const inputText = this.inputArea.content.filter(content => content.type === 'text').map(content => content.text).join('\n');
          const mergeText = `${presetText}\n${inputText}`.substring(0, 1024);
          this.chatService.chatCompletionObservableStreamNew({
            args: {
              max_tokens: 40,
              model: 'gemini-1.5-flash',
              messages: [
                {
                  role: 'user',
                  content: `この書き出しで始まるチャットにタイトルをつけてください。短く適当でいいです。タイトルだけを返してください。タイトル以外の説明などはつけてはいけません。\n\n\`\`\`markdown\n\n${mergeText}\n\`\`\``
                } as any
              ],
            },
          }).subscribe({
            next: next => {
              next.observer.pipe(tap(text => threadGroup.title += text), toArray()).subscribe({
                next: next => this.saveThreadGroup(threadGroup).subscribe()
              });
            },
          });
        }
      }),
      switchMap(threadGroup => {
        // 入力エリアに何も書かれていない場合はスルーして直前のmessageIdを返す。
        if (this.inputArea.content[0].type === 'text' && this.inputArea.content[0].text) {
          return safeForkJoin(threadGroup.threadList.map(thread => {
            const contents = this.inputArea.content.map(content => {
              const contentPart = this.messageService.initContentPart(genDummyId(), content.text);
              contentPart.type = content.type as ContentPartType;
              contentPart.text = content.text;
              contentPart.fileId = contentPart.type === 'file' ? (content as { fileId: string }).fileId : undefined;
              return contentPart;
            });
            return this.messageService.upsertSingleMessageGroup(
              this.messageService.initMessageGroup(
                thread.id,
                this.messageGroupIdListMas[thread.id][this.messageGroupIdListMas[thread.id].length - 1],
                this.inputArea.role,
                contents,
              )
            );
          })).pipe(
            map(upsertResponseList => {
              // 入力エリアをクリア
              this.inputArea = this.generateInitalInputArea();
              this.rebuildThreadGroup();
              setTimeout(() => {
                DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement); // 高さ調整
                DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
              }, 0);
              return upsertResponseList.map(messageGroup => messageGroup.id);
            }),
          );
        } else {
          // return of(this.messageList[this.messageList.length - 1].id); // 末尾にあるメッセージが発火トリガー
          return of(threadGroup.threadList.map(thread => this.messageGroupIdListMas[thread.id][this.messageGroupIdListMas[thread.id].length - 1])); // 末尾にあるメッセージが発火トリガー
        }
      }),
      // 発射準備完了。発射トリガーとなるメッセージIDを返す。とりあえずログ出力もしておく。
      tap(messageGroupId => console.log('Message ID before chat completion:', messageGroupId)),
    );
  }

  touchMessageGroupAndRebuild(messageGroup: MessageGroupForView): Observable<MessageGroup> {
    return this.messageService.updateTimestamp('message-group', messageGroup.id)
      .pipe(map((res) => {
        // lastUpdateを更新
        messageGroup.lastUpdate = res.lastUpdate;
        this.rebuildThreadGroup();
        // this.onChange();
        return messageGroup;
      }));
  }

  /**
   * 履歴の選択変更
   * @param group 
   * @param delta 
   */
  setSelect(group: MessageGroupForView, delta: number): void {
    group.selectedIndex += delta;
    const selectedMessageGroupId = this.messageService.nextMessageGroupId[group.id][group.selectedIndex];
    const messageGroup = this.messageService.messageGroupMas[selectedMessageGroupId];
    const ids = this.messageService.getTailMessageGroupIds(messageGroup);
    const newMessageGroup = this.messageService.messageGroupMas[ids[ids.length - 1]];
    // contentのキャッシュを取得
    newMessageGroup.messages.forEach(message => {
      message.status = MessageStatusType.Loading;
      this.messageService.getMessageContentParts(message).subscribe({
        next: contentParts => message.status = MessageStatusType.Loaded,
      })
    });
    this.touchMessageGroupAndRebuild(this.messageService.messageGroupMas[ids[ids.length - 1]]).subscribe();
    // this.touchMessageGroupAndRebuild(this.messageService.messageGroupMas[selectedMessageGroupId]).subscribe();
  }

  // changeModel(index: number): void {
  //   const model = this.selectedThreadGroup.threadList[index].inDto.args.model;
  //   if (model) {
  //     if (model.startsWith('claude-')) {
  //       this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${model} は海外リージョン（us-east5）を利用します。\n個人情報は絶対に入力しないでください。`, options: ['Close'] } });
  //     } else if (model.startsWith('meta/')) {
  //       this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${model} は海外リージョン（us-central1）を利用します。\n個人情報は絶対に入力しないでください。`, options: ['Close'] } });
  //     } else if (model.endsWith('-experimental')) {
  //       this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${model} は海外リージョン（us-central1）を利用します。\n実験的なモデルのため結果が正確でない可能性があります。`, options: ['Close'] } });
  //     }
  //   } else { }
  // }

  // /**
  //  * 推論開始トリガーを引く
  //  */
  // send(): void {
  //   // // バリデーションエラー
  //   // if (!this.inDto.args.model) {
  //   //   return;
  //   //   // } else if (this.inDto.args.model.startsWith('gemini-1.0') && this.tokenObj.totalTokens > 32766) {
  //   //   //   this.snackBar.open(`トークンサイズオーバーです。 32,766以下にしてください。`, 'close', { duration: 3000 });
  //   //   //   return;
  //   // } else if (this.inDto.args.model.startsWith('gpt-') && (this.inDto.args.max_tokens || 0) > 4096) {
  //   //   this.snackBar.open(`${this.inDto.args.model} の maxTokens は上限4,096です。`, 'close', { duration: 3000 });
  //   //   this.inDto.args.max_tokens = Math.min(this.inDto.args.max_tokens || 0, 4096);
  //   //   return;
  //   // } else if (this.inDto.args.model.startsWith('meta/llama3') && (this.inDto.args.max_tokens || 0) > 4096) {
  //   //   this.snackBar.open(`${this.inDto.args.model} の maxTokens は上限4,096です。`, 'close', { duration: 3000 });
  //   //   this.inDto.args.max_tokens = Math.min(this.inDto.args.max_tokens || 0, 4096);
  //   //   return;
  //   // } else if (this.messageGroupMap[this.messageList[this.messageList.length - 1].messageGroupId].role === 'assistant' && this.inputArea.contents[0].text.length === 0) {
  //   //   if (this.inputArea.contents.length > 1) {
  //   //     this.snackBar.open(`ファイルだけでは送信できません。何かメッセージを入力してください。`, 'close', { duration: 3000 });
  //   //   } else {
  //   //     this.snackBar.open(`メッセージを入力してください。`, 'close', { duration: 3000 });
  //   //   }
  //   //   return;
  //   // } else if (this.inDto.args.isGoogleSearch && !this.inDto.args.model.startsWith('gemini-1.5')) {
  //   //   this.snackBar.open(`Google検索統合は Gemini-1.5 系統以外では使えません。`, 'close', { duration: 3000 });
  //   //   this.inDto.args.isGoogleSearch = false;
  //   //   return;
  //   // } else {
  //   // }

  //   // // 継続系
  //   // if (this.inDto.args.model.startsWith('claude-') && (this.inDto.args.temperature || 0) > 1) {
  //   //   this.snackBar.open(`claude はtempertureを0～1.0の範囲で使ってください。`, 'close', { duration: 3000 });
  //   //   this.inDto.args.temperature = 1;
  //   // } else { }
  //   // if ((this.messageList.length % 2) % 7 === 0 && this.tokenObj.totalTokens > 16384) {
  //   //   // 7問い合わせごとにアラート出す
  //   //   this.snackBar.open(`スレッド内のやり取りが長引いてきました。話題が変わった際は左上の「新規スレッド」から新規スレッドを始めることをお勧めします。\n（スレッドが長くなるとAIの回答精度が落ちていきます）`, 'close', { duration: 6000 });
  //   // } else { }

  //   this.isLock = true;

  //   // 初回送信後はプレースホルダをデフォルトのものに戻す。
  //   this.placeholder = this.defaultPlaceholder;

  //   // キャッシュ使う場合はキャッシュ期限をcacheTtlInSecondsまで伸ばす
  //   const inDto = this.selectedThreadGroup.threadList[0].inDto;
  //   if (this.selectedThreadGroup && inDto.args.cachedContent) {
  //     const expireTime = new Date(inDto.args.cachedContent.expireTime);
  //     const currentTime = new Date();
  //     const differenceInMilliseconds = expireTime.getTime() - currentTime.getTime();

  //     if (differenceInMilliseconds > this.cacheTtlInSeconds * 1000) {
  //       // If expire time is more than 10 minutes ahead, return it as is
  //     } else {
  //       // If expire time is within 10 minutes, update it to 10 minutes from now
  //       this.chatService.updateCacheByProjectModel(this.selectedThreadGroup.id, { ttl: { seconds: this.cacheTtlInSeconds, nanos: 0 } }).subscribe({
  //         next: next => {
  //           // console.log(next);
  //           // キャッシュ更新はDB側で登録済みなのでこっちはinDtoに入れるだけにする。
  //           // this.inDto.argsList[0].cachedContent = next;
  //           inDto.args.cachedContent = next;
  //         },
  //       });
  //     }
  //   } else { }

  //   // if (this.selectedThreadGroup) {
  //   //   this.selectedThreadGroup.inDto.args.cachedContent = this.cacheMap[this.selectedThreadGroup.id];
  //   // }
  //   // メッセージを組み立ててから末尾のmessageIdに火をつける。

  //   this.saveAndBuildThread().pipe(
  //     switchMap(messageId =>
  //       safeForkJoin(this.selectedThreadGroup.threadList.map(thread => this.chatService.chatCompletionObservableStreamByProjectModel(thread.inDto.args, messageId).pipe(
  //         tap(resDto => {
  //           // キャッシュを更新する
  //           // 初回の戻りを受けてからメッセージリストにオブジェクトを追加する。こうしないとエラーの時にもメッセージが残ってしまう。
  //           let messageGroup = this.previousMessageIdMap[resDto.meta.messageGroup.previousMessageId || ''];
  //           if (messageGroup) {
  //           } else {
  //             // サーバー側で生成されたメッセージグループをこっちがわに構成する。
  //             messageGroup = resDto.meta.messageGroup;
  //             messageGroup.messages = messageGroup.messages || [];
  //             messageGroup.selectedIndex = 0;
  //             if (messageGroup.previousMessageId) {
  //               this.previousMessageIdMap[messageGroup.previousMessageId] = messageGroup;
  //             }
  //             this.messageGroupListAll.push(messageGroup);
  //             this.messageGroupMap[messageGroup.id] = messageGroup;
  //           }

  //           // レスポンス受け用オブジェクト
  //           const responseMessage = resDto.meta.message;
  //           messageGroup.messages.push(responseMessage);
  //           this.messageMap[responseMessage.id] = responseMessage;
  //           responseMessage.contents = resDto.meta.contentParts as any;

  //           // メッセージID紐づけ。
  //           this.inputArea.previousMessageGroupId = resDto.meta.message.id;
  //           this.rebuildMessageList();

  //           // 入力ボックスのサイズを戻す。
  //           setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
  //           setTimeout(() => {
  //             DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
  //           }, 100);

  //           this.chatStreamSubscription = resDto.observer.subscribe(this.chatStreamHander(responseMessage));
  //         }),
  //       )))
  //     ),
  //   ).subscribe({
  //     next: resDto => {
  //     },
  //     error: error => {
  //       this.chatErrorHandler(error);
  //     }
  //   });
  // }

  /**
   * 推論開始トリガーを引く
   */
  send(type: 'threadGroup' | 'thread' | 'messageGroup' | 'message' = 'threadGroup', idList: string[] = []): Observable<{
    connectionId: string,
    streamId: string,
    metaList: { messageGroup: MessageGroupForView, observer: Observable<string> }[],
  }[]> {
    let threadList: Thread[] = [];
    if (type === 'threadGroup') {
      // idListが空の場合は選択中のスレッドグループを使う
      const threadIdList = idList.length > 0
        ? idList.filter(id => this.threadGroupList.find(threadGroup => threadGroup.id === id))
        : this.selectedThreadGroup.threadList.map(thread => thread.id);
      threadList = this.selectedThreadGroup.threadList.filter(thread => threadIdList.includes(thread.id));
    } else if (type === 'messageGroup') {
    } else {
      throw new Error('Not implemented');
    }

    for (const thread of threadList) {
      const messageGroup = this.messageService.messageGroupMas[this.messageGroupIdListMas[thread.id][this.messageGroupIdListMas[thread.id].length - 1]];
      const modelName = thread.inDto.args.model || '';
      const model = this.chatService.priceMap[modelName];
      const args = thread.inDto.args;

      // バリデーションエラー
      if (!args.model) {
        throw new Error('Model is not set');
      } else if (this.tokenObj.totalTokens > model.maxInputTokens) {
        this.snackBar.open(`トークンサイズオーバーです。「${modelName}」への入力トークンは ${model.maxInputTokens}以下にしてください。`, 'close', { duration: 3000 });
        throw new Error(`トークンサイズオーバーです。「${modelName}」への入力トークンは ${model.maxInputTokens}以下にしてください。`);
      } else if (args.isGoogleSearch && !args.model.startsWith('gemini-1.5')) {
        this.snackBar.open(`Google検索統合は Gemini-1.5 系統以外では使えません。`, 'close', { duration: 3000 });
        args.isGoogleSearch = false;
        throw new Error(`Google search is not available for ${args.model}.`);
      } else if (messageGroup.role === 'assistant' && this.inputArea.content[0].text.length === 0) {
        if (this.inputArea.content.length > 1) {
          this.snackBar.open(`ファイルだけでは送信できません。何かメッセージを入力してください。`, 'close', { duration: 3000 });
          throw new Error('ファイルだけでは送信できません。何かメッセージを入力してください。');
        } else {
          this.snackBar.open(`メッセージを入力してください。`, 'close', { duration: 3000 });
        }
      }

      // 継続系
      if (modelName.startsWith('claude-') && (thread.inDto.args.temperature || 0) > 1) {
        this.snackBar.open(`claude はtempertureを0～1.0の範囲で使ってください。`, 'close', { duration: 3000 });
        thread.inDto.args.temperature = 1;
      } else { }
      if ((this.messageGroupIdListMas[thread.id].length % 2) % 7 === 0 && this.tokenObj.totalTokens > 16384) {
        // 7問い合わせごとにアラート出す
        this.snackBar.open(`スレッド内のやり取りが長引いてきました。話題が変わった際は左上の「新規スレッド」から新規スレッドを始めることをお勧めします。\n（スレッドが長くなるとAIの回答精度が落ちていきます）`, 'close', { duration: 6000 });
      } else { }
    }

    this.isLock = true;

    // 初回送信後はプレースホルダをデフォルトのものに戻す。
    this.placeholder = this.defaultPlaceholder;

    // キャッシュ使う場合はキャッシュ期限をcacheTtlInSecondsまで伸ばす
    const inDto = this.selectedThreadGroup.threadList[0].inDto;
    if (this.selectedThreadGroup && inDto.args.cachedContent) {
      const expireTime = new Date(inDto.args.cachedContent.expireTime);
      const currentTime = new Date();
      const differenceInMilliseconds = expireTime.getTime() - currentTime.getTime();

      if (differenceInMilliseconds > this.cacheTtlInSeconds * 1000) {
        // If expire time is more than 10 minutes ahead, return it as is
      } else {
        // If expire time is within 10 minutes, update it to 10 minutes from now
        this.chatService.updateCacheByProjectModel(this.selectedThreadGroup.id, { ttl: { seconds: this.cacheTtlInSeconds, nanos: 0 } }).subscribe({
          next: next => {
            // console.log(next);
            // キャッシュ更新はDB側で登録済みなのでこっちはinDtoに入れるだけにする。
            // this.inDto.argsList[0].cachedContent = next;
            inDto.args.cachedContent = next;
          },
        });
      }
    } else { }

    return this.saveAndBuildThread().pipe(
      tap(() => {
        this.router.navigate(['chat', this.selectedProject.id, this.selectedThreadGroup.id]);
      }),
      switchMap(messageGroupIds =>
        safeForkJoin(messageGroupIds.filter(messageGroupId => {
          if (type === 'threadGroup') {
            return true;
          } else if (type === 'messageGroup') {
            return idList.includes(messageGroupId);
          } else {
            throw new Error('Not implemented');
          }
        }).map((messageGroupId, index) =>
          this.chatService.chatCompletionObservableStreamByProjectModel(this.selectedThreadGroup.threadList[index].inDto.args, 'messageGroup', messageGroupId)
            .pipe(tap(resDto => {
              // キャッシュを更新する
              // 初回の戻りを受けてからメッセージリストにオブジェクトを追加する。こうしないとエラーの時にもメッセージが残ってしまう。
              resDto.metaList.forEach(meta => {
                this.messageService.applyMessageGroup(meta.messageGroup);
                this.chatStreamSubscriptionList[this.selectedThreadGroup.id] = this.chatStreamSubscriptionList[this.selectedThreadGroup.id] || [];
                this.chatStreamSubscriptionList[this.selectedThreadGroup.id].push(meta.observer.subscribe(this.chatStreamHander(meta.messageGroup.messages[0])));
                const message = meta.messageGroup.messages[0];
                console.log(`Message ID before chat completion: ${message.id}`);
              });
            }))
        )).pipe(tap(text => {

          // メッセージID紐づけ。
          this.rebuildThreadGroup();

          // 入力ボックスのサイズを戻す。
          setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
          setTimeout(() => {
            DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
          }, 100);
        }))
      )
    );

    // this.saveAndBuildThread().pipe(
    //   switchMap(messageId =>
    //     safeForkJoin(this.selectedThreadGroup.threadList.map(thread => this.chatService.chatCompletionObservableStreamByProjectModel(thread.inDto.args, messageId).pipe(
    //       tap(resDto => {
    //         // キャッシュを更新する
    //         // 初回の戻りを受けてからメッセージリストにオブジェクトを追加する。こうしないとエラーの時にもメッセージが残ってしまう。
    //         let messageGroup = this.previousMessageIdMap[resDto.meta.messageGroup.previousMessageId || ''];
    //         if (messageGroup) {
    //         } else {
    //           // サーバー側で生成されたメッセージグループをこっちがわに構成する。
    //           messageGroup = resDto.meta.messageGroup;
    //           messageGroup.messages = messageGroup.messages || [];
    //           messageGroup.selectedIndex = 0;
    //           if (messageGroup.previousMessageId) {
    //             this.previousMessageIdMap[messageGroup.previousMessageId] = messageGroup;
    //           }
    //           this.messageGroupListAll.push(messageGroup);
    //           this.messageGroupMap[messageGroup.id] = messageGroup;
    //         }

    //         // レスポンス受け用オブジェクト
    //         const responseMessage = resDto.meta.message;
    //         messageGroup.messages.push(responseMessage);
    //         this.messageMap[responseMessage.id] = responseMessage;
    //         responseMessage.contents = resDto.meta.contentParts as any;

    //         // メッセージID紐づけ。
    //         this.inputArea.previousMessageGroupId = resDto.meta.message.id;
    //         this.rebuildMessageList();

    //         // 入力ボックスのサイズを戻す。
    //         setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
    //         setTimeout(() => {
    //           DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
    //         }, 100);

    //         this.chatStreamSubscription = resDto.observer.subscribe(this.chatStreamHander(responseMessage));
    //       }),
    //     )))
    //   ),
    // ).subscribe({
    //   next: resDto => {
    //   },
    //   error: error => {
    //     this.chatErrorHandler(error);
    //   }
    // });
  }

  /**
   * チャットのレスポンスストリームを捌くハンドラ
   * @param message 
   * @returns 
   */
  chatStreamHander(message: MessageForView): Partial<Observer<string>> | ((value: string) => void) {
    return {
      next: text => {
        message.contents[0].text += text;
        message.status = MessageStatusType.Editing;
        this.bitCounter++;
        DomUtils.scrollToBottomIfNeeded(this.textBodyElem.nativeElement);
      },
      error: error => {
        this.chatErrorHandler(error);
        this.chatAfterHandler(message); // observableはPromise.then/catch/finallyのfinallyとは違って、エラーになったらcompleteは呼ばれないので自分で呼ぶ。
      },
      complete: () => {
        this.chatAfterHandler(message);
      },
    }
  }

  /**
   * チャットのレスポンスストリームの終了を捌くハンドラ
   * @param message 
   * @returns 
   */
  chatAfterHandler(message: MessageForView): void {
    // this.を使っているのでスレッドグループ行き来したときに混ざってないか心配。。。
    delete this.chatStreamSubscriptionList[this.selectedThreadGroup.id];

    this.isLock = false;
    message.status = MessageStatusType.Loaded;
    message.label = message.contents.filter(content => content.type === 'text').map(content => content.text).join('\n').substring(0, 250);
    this.bulkNext();
    setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
  }

  // エラーハンドラー
  chatErrorHandler(error: Error): void {
    // ERROR
    // 原因不明のエラーです
    // "ClientError: [VertexAI.ClientError]: got status: 429 Too Many Requests. {\"error\":{\"code\":429,\"message\":\"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/quotas#error-code-429 for more details.\",\"status\":\"RESOURCE_EXHAUSTED\"}}"
    // "ClientError: [VertexAI.ClientError]: got status: 400 Bad Request. {\"error\":{\"code\":400,\"message\":\"The document has no pages.\",\"status\":\"INVALID_ARGUMENT\"}}"

    if (typeof error === 'string') {
      // TODO エラーになったらオブジェクトを戻す。
      try {
        const errObj = JSON.parse(error);
        if (errObj.candidate && Array.isArray(errObj.candidate.safetyRatings)) {
          const blocked = (errObj.candidate.safetyRatings as SafetyRating[]).find(rating => rating.blocked);
          if (blocked) {
            // alert(`このメッセージは安全性の理由でブロックされました。\n${blocked.category} （${safetyRatingLabelMap[blocked.category]}）\nprobability（該当度） ${blocked.probability} : ${blocked.probabilityScore}\nseverity（深刻度） ${blocked.severity} : ${blocked.severityScore}`);
            this.dialog.open(DialogComponent, { data: { title: 'ERROR', message: `このメッセージは安全性の理由でブロックされました。\n${blocked.category} （${safetyRatingLabelMap[blocked.category]}）\nprobability（該当度） ${blocked.probability} : ${blocked.probabilityScore}\nseverity（深刻度） ${blocked.severity} : ${blocked.severityScore}`, options: ['Close'] } });
          } else {
            throw new Error(error);
          }
        } else {
          throw new Error(error);
        }
      } catch (e) {
        const verteErrorHeader = 'ClientError: [VertexAI.ClientError]: ';
        if ((error as string).startsWith(verteErrorHeader)) {
        } else {

        }
        this.dialog.open(DialogComponent, { data: { title: 'ERROR', message: `原因不明のエラーです\n${JSON.stringify(error)}`, options: ['Close'] } });
      }
    } else {
      if ((error as any).status === 401) {
        // 認証エラー。インターセプターでログイン画面に飛ばすようにしているのでここでは何もしない。
        // this.dialog.open(DialogComponent, { data: { title: 'ERROR', message: `認証エラー: ${error.message}`, options: ['Close'] } });
        this.snackBar.open(`認証エラー: ${error.message}`, 'close', { duration: 3000 });
      } else {
        this.dialog.open(DialogComponent, { data: { title: 'ERROR', message: `原因不明のエラーです\n${JSON.stringify(error)}`, options: ['Close'] } });
      }
    }
  }

  /** チャット中断 */
  chatCancel(): void {
    if (this.chatStreamSubscriptionList[this.selectedThreadGroup.id]) {
      this.isLock = false;
      setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
      this.chatStreamSubscriptionList[this.selectedThreadGroup.id].forEach(s => s.unsubscribe());
    } else {
    }
    delete this.chatStreamSubscriptionList[this.selectedThreadGroup.id];
  }

  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ($event.shiftKey) {
        this.onChange();
      } else if ($event.ctrlKey) {
        // TODO: 送信処理 danger
        this.send().subscribe();
      } else {
        this.onChange();
      }
    } else {
      // 最後のキー入力から1000秒後にonChangeが動くようにする。1000秒経たずにここに来たら前回のタイマーをキャンセルする
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => this.onChange(), 1000);
    }
  }

  onChange(): void {
    this.charCount = 0;
    this.tokenObj.totalTokens = -1;
    safeForkJoin(this.selectedThreadGroup.threadList.map(thread => {
      // console.log(this.messageGroupIdListMas[thread.id][this.messageGroupIdListMas[thread.id].length - 1]);
      const inDto: ChatInputArea[] = [];
      this.messageGroupIdListMas[thread.id].map(messageGroupId => {
        const messageGroup = this.messageService.messageGroupMas[messageGroupId];
        this.messageService.messageGroupMas[messageGroupId].messages.map(message => {
          inDto.push({
            role: messageGroup.role,
            messageGroupId: messageGroup.id,
            content: message.contents.filter(content => content.text).map(content => {
              return {
                type: content.type,
                text: content.text,
                fileId: content.fileId,
              } as ChatContent;
            }),
          });
        });
        if (this.inputArea.content[0].text) {
          inDto.push(this.inputArea);
        } else { }
      });
      // countTokensByProjectModel(inDto: ChatInputArea[], id: string = '', type: 'message' | 'messageGroup'): Observable<CountTokensResponse> {
      return this.chatService.countTokensByProjectModel(inDto, 'messageGroup', this.messageGroupIdListMas[thread.id][this.messageGroupIdListMas[thread.id].length - 1]);
    })).subscribe({
      next: next => {
        const tokenObj: CountTokensResponse = { totalTokens: 0, totalBillableCharacters: 0, text: 0, image: 0, audio: 0, video: 0 };
        next.forEach(res => {
          tokenObj.totalTokens += res.totalTokens;
          tokenObj.totalBillableCharacters = tokenObj.totalBillableCharacters || 0; // undefinedの場合があるので初期化
          tokenObj.totalBillableCharacters += res.totalBillableCharacters || 0;
          tokenObj.text += res.text;
          tokenObj.image += res.image;
          tokenObj.audio += res.audio;
          tokenObj.video += res.video;
        });
        this.tokenObj = tokenObj;
        this.cost = this.calcCost();;
      },
    });
    // textareaの縦幅更新。遅延打ちにしないとvalueが更新されていない。
    this.textAreaElem && setTimeout(() => { DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement); }, 0);
  }

  contextCacheControl(threadGroup: ThreadGroup): void {
    if (threadGroup.threadList.length === 1) {
    } else {
      alert('複数スレッドモードでのキャッシュは未対応です。そのうち対応予定です。');
      return;
    }

    if (threadGroup) {
      // キャッシュがあれば削除する。本来はこっちの終了を待ってからキャッシュ作成を行うべきだが、キャッシュ削除はすぐ終わるのでここで並行処理している。
      safeForkJoin(threadGroup.threadList.filter(thread => thread.inDto.args.cachedContent).map(thread => {
        thread.inDto.args.cachedContent = undefined;
        // 全てのメッセージのキャッシュIDを削除する
        Object.values(this.messageGroupIdListMas).forEach(messageGroupIdList => messageGroupIdList.forEach(messageGroupId => this.messageService.messageGroupMas[messageGroupId].messages.forEach(message => message.cacheId = undefined)));
        return this.chatService.deleteCacheByProjectModel(threadGroup.id).pipe(
          switchMap(next => this.saveThreadGroup(threadGroup)),
        );
      })).subscribe({
        next: next => {
          if (next.length > 0) {
            this.snackBar.open(`キャッシュが削除されました。`, 'close', { duration: 3000 });
          } else { /** キャッシュ無し */ }
        },
      });
    } else {
      // スレッドナシの場合は継続
    }

    this.isLock = true;
    safeForkJoin(threadGroup.threadList.map(thread => {
      // 32768トークン以上ないとキャッシュ作成できない
      if (this.tokenObj.totalTokens < 32768) {
        const message = `コンテキストキャッシュを作るには 32,768 トークン以上必要です。\n現在 ${this.tokenObj.totalTokens} トークンしかありません。`;
        this.dialog.open(DialogComponent, { data: { title: 'alert', message, options: ['Close'] } });
        throw new Error(message);
      } else if (!threadGroup.threadList[0].inDto.args.model?.endsWith('-001') && !threadGroup.threadList[0].inDto.args.model?.endsWith('-002')) {
        const message = `コンテキストキャッシュは末尾が「-001」か「-002」となっているモデルでしか利用できません。\n -002系がおすすめです。`;
        this.dialog.open(DialogComponent, { data: { title: 'alert', message, options: ['Close'] } });
        throw new Error(message);
        // } else if (this.messageList.length === 0 || (!this.messageList.find(message => this.messageGroupMap[message.messageGroupId].role === 'user' && message.contents.find(content => content.type === 'text')) && !this.inputArea.contents[0].text.length)) {
      } else if (this.messageGroupIdListMas[thread.id].length === 0 || (!this.messageGroupIdListMas[thread.id].find(messageGroupId => this.messageService.messageGroupMas[messageGroupId].role === 'user' && this.messageService.messageGroupMas[messageGroupId].messages[0].contents.find(content => content.type === 'text'))) && !this.inputArea.content[0].text.length) {
        // ファイルだけだとダメ。テキスト入力が必須。
        const message = `コンテキストキャッシュはファイルだけでは作成できません。短くても必ずテキストメッセージを入力してください。`;
        this.dialog.open(DialogComponent, { data: { title: 'alert', message, options: ['Close'] } });
        throw new Error(message);
      }
      return this.saveAndBuildThread().pipe(switchMap(
        // トリガーを引く
        messageGroupId => this.chatService.createCacheByProjectModel(
          thread.inDto.args.model || '', messageGroupId[0], 'messageGroup',
          { ttl: { seconds: this.cacheTtlInSeconds, nanos: 0 } },
        )
      )).pipe(tap(next => {
        thread.inDto.args.cachedContent = next;
        if (this.selectedThreadGroup) {
          // this.cacheMap[this.selectedThreadGroup.id] = next;
          // TODO DANGER selectedThreadとinDto.argsが不一致になっている。これは致命的によくなさそう。。
          thread.inDto.args.cachedContent = next;
        }
        this.messageGroupIdListMas[thread.id].forEach(messageGroupId => this.messageService.messageGroupMas[messageGroupId].messages.forEach(message => message.cacheId = next.id));
      }));
    }))
      .pipe(switchMap(_ => this.saveThreadGroup(this.selectedThreadGroup)))
      .subscribe({
        next: next => {
          // this.messageList.forEach(message => message.cacheId = next.id);
          this.rebuildThreadGroup();
          this.onChange();
          this.isLock = false;
          this.snackBar.open(`メッセージがキャッシュされました。`, 'close', { duration: 3000 });
        },
        error: error => {
          this.snackBar.open(`ERROR: ${JSON.stringify(error)}`, 'close', { duration: 30000 });
          this.isLock = false;
        }
      });
  }

  // TODO ここは本来関数バインドでやるべきではない。1秒タイマーとかでやるべき。
  isCacheLive(threadGroup?: ThreadGroup): boolean {
    if (threadGroup) { } else { return false; }

    if (!threadGroup.threadList[0]) {
      console.log(threadGroup.title);
      console.log(threadGroup.threadList);
    } else {
      threadGroup.threadList[0].inDto.args.cachedContent = undefined;
    }

    const cache = threadGroup.threadList[0].inDto.args.cachedContent;
    const isLive = (cache && cache.expireTime && new Date(cache.expireTime) > new Date()) ? true : false;
    if (!isLive && cache) {
      if (threadGroup) {
        // 時間経過でキャッシュが有効期限切れになったら消しておく。
        if (!threadGroup.threadList[0]) {
          console.log(threadGroup.title);
          console.log(threadGroup.threadList);
        } else {
          threadGroup.threadList[0].inDto.args.cachedContent = undefined;
        }
        // thread.inDto.argsList[0].messages?.forEach(message => message.cacheId = undefined);
        // this.chatService.deleteCacheByProjectModel(this.selectedThreadGroup.id).subscribe({
        //   next: next => {
        //     this.save(this.selectedThreadGroup).subscribe(next => {
        //       this.rebuildMessageList(this.messageGroupListAll);
        //       this.onChange();
        //     });
        //   }
        // });
      } else { }
    } else { }
    return isLive;
  }

  toggleAllExpandCollapse(): void {
    this.allExpandCollapseFlag = !this.allExpandCollapseFlag;
    // this.chatSystemPanelList
    ([this.chatPanelList] as QueryList<ChatPanelBaseComponent>[])
      .forEach(chatList => {
        chatList.forEach(chat => {
          if (this.allExpandCollapseFlag) {
            chat.exPanel.open();
          } else {
            chat.exPanel.close();
          }
        });
      });
  }

  removeContent(content: ContentPart): void {
    this.messageService.deleteContentPart(content.id).pipe(
      tap(() => {
        const contents = this.messageService.messageMas[content.messageId].contents;
        contents.splice(contents.indexOf(content), 1);
        clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => this.onChange(), 500);
      }),
    ).subscribe();
  }

  removeMessage(message: MessageForView): void {
    // // あえてOutOfBoundsさせる
    // this.messageGroupMap[message.messageGroupId].selectedIndex = this.messageGroupMap[message.messageGroupId].messages.length;
    // if (this.messageGroupMap[message.messageGroupId].role === 'user') {
    //   if (this.messageGroupMap[message.messageGroupId].previousMessageId && this.selectedThreadGroup) {
    //     const prevMessage = this.messageMap[this.messageGroupMap[message.messageGroupId].previousMessageId || ''];
    //     this.messageService.updateTimestamp(this.selectedThreadGroup.id, prevMessage).subscribe({
    //       next: next => {
    //         // メッセージのタイムスタンプを更新するだけ。
    //         message.updatedAt = next.updatedAt;
    //         this.inputArea.messageGroupId = this.messageGroupMap[message.messageGroupId].id;
    //         this.rebuildMessageList();
    //         this.onChange();
    //       },
    //       error: error => {
    //         this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
    //       }
    //     });
    //   }
    // } else if (this.messageGroupMap[message.messageGroupId].role === 'assistant') {
    //   // assistantを削除するとはつまりリトライのこと
    //   this.rebuildMessageList();
    //   this.inputArea.contents[0].text = '';
    //   this.send();
    // } else if (this.messageGroupMap[message.messageGroupId].role === 'system') {
    //   // systemはchange相当
    // }
  }

  removeMessageGroup(messageGroup: MessageGroupForView): void {
    // あえてOutOfBoundsさせる
    messageGroup.selectedIndex = messageGroup.messages.length;
    // systemは削除させない
    if (messageGroup.role === 'system'
      || !messageGroup.previousMessageGroupId
      || !this.messageService.messageGroupMas[messageGroup.previousMessageGroupId])
      return;

    const previousMessageGroup: MessageGroupForView = this.messageService.messageGroupMas[messageGroup.previousMessageGroupId];

    this.touchMessageGroupAndRebuild(previousMessageGroup).subscribe({
      next: next => {
        if (messageGroup.role === 'user') {
          this.inputArea.messageGroupId = previousMessageGroup.id;
        } else if (messageGroup.role === 'assistant') {
          // assistantを削除するとはつまりリトライのこと
          this.inputArea.content[0].text = '';
          if (messageGroup.previousMessageGroupId) {
            // リトライさせるのは一個前のメッセージグループ
            this.send('messageGroup', [messageGroup.previousMessageGroupId]).subscribe({});
          } else { }
        } else if (messageGroup.role === 'system') {
        }
      },
      error: error => {
        this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
      }
    });
  }

  editChat(messageGroup: MessageGroupForView): void {
    messageGroup.messages.forEach(message => {
      if (this.messageService.messageMas[message.id]) {
        // 既存メッセージそのままの場合。
      } else if (this.messageService.messageGroupMas[messageGroup.id]) {
        // 既存グループへの新メッセージ追加
        // this.inputArea.messageGroupId = '';
        this.textAreaElem.nativeElement.focus();
      } else {
        // 新規グループで新規メッセージ
        // ここはない？
      }
    });
    this.rebuildThreadGroup();
    this.onChange();
  }

  contentsDownload($event: MouseEvent, $index: number, threadGroup: ThreadGroup): void {
    this.messageService.downloadContent(threadGroup.id).subscribe({
      next: zip => {
        // ZIPファイルを生成し、ダウンロードする
        zip.generateAsync({ type: 'blob' }).then(content => {
          // Blobを利用してファイルをダウンロード
          saveAs(content, `ribbon-${Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS')}.zip`);
          // this.snackBar.open(`ダウンロードが完了しました。`, 'close', { duration: 1000 });
        });
      },
      error: error => {
        this.snackBar.open(error, 'close', { duration: 1000 });
      }
    });
  }

  removeThreadGroup($event: MouseEvent, $index: number, threadGroup: ThreadGroup): void {
    // this.stopPropagation($event);
    this.dialog.open(DialogComponent, { data: { title: 'スレッド削除', message: `このスレッドを削除しますか？\n「${threadGroup.title.replace(/\n/g, '')}」`, options: ['削除', 'キャンセル'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 0) {
          this.threadService.deleteThreadGroup(threadGroup.id).subscribe({
            next: next => {
              this.threadGroupList.splice($index, 1)
              if (threadGroup === this.selectedThreadGroup) {
                this.clear();
              } else {
                this.sortThreadGroup(this.threadGroupList);
              }
            }
          });
        } else { /** 削除キャンセル */ }
      }
    });
  }

  sendThreadToProject(project: Project, threadGroup: ThreadGroup): void {

    const exec = (() => {
      this.threadService.moveThreadGroup(threadGroup.id, project.id).subscribe({
        next: next => {
          // スレッド移動後はスレッドグループを再読み込みする
          this.loadThreadGroups(this.selectedProject).subscribe({
            next: next => {
              if (threadGroup === this.selectedThreadGroup) { this.clear(); } // 選択中のスレッドを移動した場合は選択解除
              this.snackBar.open(`スレッドを移動しました。`, 'close', { duration: 3000 });
            },
          });
        },
        error: error => {
          this.snackBar.open(`更新エラーです。\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
        }
      });
    }).bind(this);

    // if (thread === this.selectedThreadGroup) {
    //   this.snackBar.open(`使用中のスレッドは移動できません。}`, 'close', { duration: 30000 });
    //   return;
    // }

    const projectVisibility = (projet: Project) => {
      // 一人チームはDefaultと見做す。
      return project.visibility === ProjectVisibility.Team && this.teamMap[project.teamId].teamType === TeamType.Alone ? ProjectVisibility.Team : project.visibility;
    }

    if (projectVisibility(project) !== projectVisibility(this.selectedProject) || project.teamId !== this.selectedProject.teamId) {
      const table = {
        Default: '個人用デフォルト',
        Team: 'チーム',
        Login: 'ログインユーザー全員',
        Public: '無制限',
      }
      this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `共有範囲の異なるプロジェクトに送ります。\n[${table[this.selectedProject.visibility]}]${this.selectedProject.label}->[${table[project.visibility]}]${project.label}\nよろしいですか？`, options: ['OK', 'キャンセル'] } }).afterClosed().subscribe({
        next: next => {
          if (next === 0) {
            exec();
          }
        }
      });
    } else {
      exec();
    }
  }

  openBulk(): void {
    if (this.bulkRunSetting.contents.length === 0) {
      this.bulkRunSetting.contents.push({ type: 'text', text: '', });
    } else { }

    if (this.inputArea.content[0].text) {
      // 一括実行するにはメッセージ入力エリアを空にしてください。
      this.dialog.open(DialogComponent, { data: { title: 'alert', message: `一括実行するにはメッセージ入力エリアを空にしてください。`, options: ['Close'] } });
    } else {
      // メッセージエリアに何も書かれていなかったら一括実行モーダル開く
      this.dialog.open(BulkRunSettingComponent, {
        data: {
          projectId: this.selectedProject.id,
          ...this.bulkRunSetting
        }
      }).afterClosed().subscribe({
        next: next => {
          if (next) {
            // モーダル閉じたら実行かける
            this.bulkRunSetting.promptTemplate = next.promptTemplate;
            this.bulkRunSetting.contents = next.contents;
            this.bulkRunSetting.contents = this.bulkRunSetting.contents.filter(content => content.text); // 空コンテンツは除外
            this.bulkRunSetting.mode = next.mode;
            this.bulkNext();
          } else {
            // キャンセル
          }
        }
      });
    }
  }
  bulkNext(): void {
    if (this.bulkRunSetting.contents.length > 0) {
      // 一括実行設定あり
      const content = this.bulkRunSetting.contents.shift();
      if (content) {
        this.inputArea.content[0].type = 'text';
        this.inputArea.content[0].text = this.bulkRunSetting.promptTemplate.replace('${value}', content.text);
        if (content.type === 'text') {
        } else if (content.type === 'file') {
          this.inputArea.content.push({ type: 'file', fileId: content.fileId, text: content.text });
        }
        this.send().subscribe();
      }
    } else { }
  }

  clear() {
    this.messageService.clear(); // ストック情報を全消ししておく。
    this.threadGroupChangeHandler(this.selectedProject, this.threadGroupList, 'new-thread');
    this.router.navigate(['/chat', this.selectedProject.id, 'new-thread']);
  }


  /** イベント伝播しないように止める */
  stopPropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }

  logout(): void {
    this.authService.logout();
    // this.router.navigate(['/login']);
  }
}
