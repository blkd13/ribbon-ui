import { ChangeDetectorRef, Component, ElementRef, NgZone, OnInit, QueryList, TemplateRef, inject, viewChildren, viewChild } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import OpenAI from 'openai';
import { DomSanitizer } from '@angular/platform-browser';

import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
import { MatTabsModule } from '@angular/material/tabs';
import { ScrollingModule } from '@angular/cdk/scrolling';

import { concatMap, from, map, mergeMap, of, Subscription, switchMap, Observer, BehaviorSubject, filter, defaultIfEmpty, catchError, throwError, EMPTY } from 'rxjs';
import { saveAs } from 'file-saver';

import { ChatPanelMessageComponent } from '../../parts/chat-panel-message/chat-panel-message.component';
import { FileEntity, FileManagerService, FileUploadContent, FullPathFile } from './../../services/file-manager.service';
import { genDummyId, MessageService, ProjectService, TeamService, ThreadService } from './../../services/project.service';
import { CachedContent, GPTModels, SafetyRating, safetyRatingLabelMap } from '../../models/models';
import { ChatContent, ChatInputArea, ChatService, CountTokensResponse, PresetDef } from '../../services/chat.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, tap, toArray } from 'rxjs';
import { DomUtils, safeForkJoin } from '../../utils/dom-utils';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { AuthService } from '../../services/auth.service';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { BaseEntity, ContentPart, ContentPartType, Message, MessageClusterType, MessageForView, MessageGroup, MessageGroupForView, MessageGroupType, MessageStatusType, Project, ProjectVisibility, Team, TeamType, Thread, ThreadGroup, ThreadGroupType, ThreadGroupVisibility, UUID } from '../../models/project-models';
import { GService } from '../../services/g.service';
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { BulkRunSettingComponent, BulkRunSettingData } from '../../parts/bulk-run-setting/bulk-run-setting.component';
import { Utils } from '../../utils';
import { ParameterSettingDialogComponent } from '../../parts/parameter-setting-dialog/parameter-setting-dialog.component';
import { ChatPanelSystemComponent } from "../../parts/chat-panel-system/chat-panel-system.component";
import { UserService } from '../../services/user.service';
import { AppMenuComponent } from '../../parts/app-menu/app-menu.component';
import { ToolCall, ToolCallBody, ToolCallInfoBody, ToolCallCallBody, ToolCallCommandBody, ToolCallResultBody, ToolCallType, ToolCallInfo, ToolCallCall, ToolCallCommand, ToolCallResult, } from '../../services/tool-call.service';

declare var _paq: any;

@Component({
  selector: 'app-chat',
  imports: [
    CommonModule, FormsModule, RouterModule, FileDropDirective, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatSliderModule, MatMenuModule, MatDialogModule, MatRadioModule, MatSelectModule,
    MatSnackBarModule, MatDividerModule, MatCheckboxModule, MatProgressSpinnerModule,
    MatTabsModule, ScrollingModule,
    UserMarkComponent,
    ChatPanelMessageComponent, ChatPanelSystemComponent, AppMenuComponent,
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent implements OnInit {

  // メッセージ表示ボックスのリスト
  readonly chatPanelList = viewChildren<ChatPanelMessageComponent>(ChatPanelMessageComponent);

  // メッセージ表示ボックスのリスト
  readonly chatSystemPanelList = viewChildren<ChatPanelSystemComponent>(ChatPanelSystemComponent);

  // チャット入力欄
  readonly textAreaElem = viewChild.required<ElementRef<HTMLTextAreaElement>>('textAreaElem');

  // チャット表示欄
  readonly textBodyElem = viewChildren<ElementRef<HTMLDivElement>>('textBodyElem');

  // スクロール制御用のアンカー
  readonly chatPanelGroupElem = viewChildren<ElementRef<HTMLDivElement>>('chatPanelGroupElem');
  readonly anchor = viewChildren<ElementRef<HTMLDivElement>>('anchor');


  readonly appFileDrop = viewChild(FileDropDirective);

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

  aloneTeam!: Team;
  defaultProject!: Project;

  selectedTeam!: Team;
  selectedProject!: Project;
  projectList: Project[] = [];
  teamMap: { [key: string]: Team } = {};

  placeholder = '';
  defaultPlaceholder = 'メッセージを入力...。Shift+Enterで改行。Ctrl+Enterで送信。Drag＆Drop、ファイル貼り付け。';
  chatStreamSubscriptionList: { [threadGroupId: string]: Subscription[] } = {};
  cacheMap: { [key: string]: CachedContent } = {};
  editNameThreadId: string = '';
  private timeoutId: any;
  bulkRunSetting: BulkRunSettingData = {
    mode: 'parallel',
    promptTemplate: `ありがとうございます。\nでは次は"\${value}"をお願いします。`,
    contents: [],
    projectId: '',
  };
  tailMessageGroupList: (MessageGroupForView | null)[] = [];

  // 画面インタラクション系
  allExpandCollapseFlag = true; // メッセージの枠を全部一気に開くか閉じるかのフラグ
  isCost = true;
  showThreadList = true; // スレッドリスト表示フラグ
  showInfo = true;
  sortType: number = 1;
  isLock = false;
  // スレッドごとのロック状態を管理するオブジェクトを追加
  threadLocks: { [threadId: string]: boolean } = {};

  isThreadGroupLoading = false;
  tailRole = 'system';
  cost: number = 0;
  charCount: number = 0;
  tokenObj: CountTokensResponse = { totalTokens: 0, totalBillableCharacters: 0, text: 0, image: 0, audio: 0, video: 0 };
  linkChain: boolean[] = []; // デフォルトはfalse

  readonly authService: AuthService = inject(AuthService);
  readonly chatService: ChatService = inject(ChatService);
  readonly projectService: ProjectService = inject(ProjectService);
  readonly teamService: TeamService = inject(TeamService);
  readonly threadService: ThreadService = inject(ThreadService);
  readonly messageService: MessageService = inject(MessageService);
  readonly fileManagerService: FileManagerService = inject(FileManagerService);
  readonly userService: UserService = inject(UserService);
  readonly dbService: NgxIndexedDBService = inject(NgxIndexedDBService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  readonly ngZone: NgZone = inject(NgZone);
  readonly sanitizer: DomSanitizer = inject(DomSanitizer);

  ngOnInit(): void {
    document.title = `AI`;
    of(0).pipe(
      switchMap(() => this.loadTeams()),
      switchMap(() => this.loadProjects()),
    ).subscribe(ret => {
      this.routerChangeHandler();
    });

    setInterval(() => {
      const textAreaElem = this.textAreaElem();
      if (textAreaElem && textAreaElem.nativeElement) {
        // とりあえず毎秒高さ調整をしとく。
        DomUtils.textAreaHeighAdjust(textAreaElem.nativeElement);
      } else { }
    }, 1000);
  }

  // changeModel(index: number): void { }
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
        // switchMap(() => safeForkJoin(
        //   this.selectedThreadGroup.threadList
        //     // 既存スレッドの場合は何もしないので除外する
        //     .filter(thread => !this.messageService.messageGroupList.find(messageGroup => messageGroup.threadId === thread.id))
        //     // 新規スレッドの場合は元スレッドをコピー
        //     .map(thread => this.messageService.cloneThreadDry(this.selectedThreadGroup.threadList[0], thread.id))
        // )),
        this.modelCheck();
        safeForkJoin(
          result.threadList
            // 既存スレッドの場合は何もしないので除外する
            .filter(thread => !this.messageGroupIdListMas[thread.id])
            // 新規スレッドの場合は元スレッドをコピー
            .map(thread => this.messageService.cloneThreadDry(this.selectedThreadGroup.threadList[0], thread.id))
        ).subscribe({
          next: resDto => {
            this.selectedThreadGroup = result;
            this.rebuildThreadGroup();
            this.onChange();
          },
          error: error => {
            console.error(error);
          },
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
          this.selectedTeam = this.teamMap[project.teamId];
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

  presetLabel = '通常';
  selectPreset(preset: PresetDef): void {
    _paq.push(['trackEvent', 'AIチャット', 'モード選択', this.selectedThreadGroup.threadList.length]);
    this.presetLabel = preset.label;
    let isModelChange = false;
    this.selectedThreadGroup.threadList.forEach((thread, tIndex) => {
      if (preset.modelSelection && preset.modelSelection[tIndex]) {
        thread.inDto.args.model = preset.modelSelection[tIndex];
        isModelChange = true;
      } else { }
      const messageGroup = this.messageService.messageGroupMas[this.messageGroupIdListMas[thread.id][0]];
      messageGroup.messages[0].contents[0].text = preset.systemPrompt || this.chatService.defaultSystemPrompt;
      messageGroup.messages.forEach(message => message.label = preset.systemLabel || this.chatService.defaultSystemPrompt);
      thread.inDto.args.tool_choice = preset.tool_choice;
    });
    this.inputArea.content[0].text = preset.userPrompt || '';
    this.placeholder = preset.placeholder || this.placeholder;
    if (isModelChange) {
      this.modelCheck();
    }
    setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);
  }

  modelCheck(modelList: string[] = []): void {
    console.log(modelList);
    // 空配列だったらスレッドグループ全体をチェック
    modelList = modelList.length === 0 ? this.selectedThreadGroup.threadList.map(thread => thread.inDto.args.model as string).filter(model => model) : modelList;
    const mess = this.chatService.validateModelAttributes(modelList);
    if (mess.message.length > 0) {
      this.dialog.open(DialogComponent, { data: { title: 'Alert', message: mess.message, options: ['Close'] } });
    } else {
      // アラート不用
    }
  }

  presetThreadList: Thread[] = [];
  loadPreset(index: number): void {
    this.selectedThreadGroup.threadList = this.selectedThreadGroup.threadList.slice(0, index);
    while (this.selectedThreadGroup.threadList.length < index) {
      this.selectedThreadGroup.threadList.push(this.presetThreadList[this.selectedThreadGroup.threadList.length - 1])
    }
    this.modelCheck();
    this.rebuildThreadGroup();
    setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);
  }

  threadGroupChangeHandler(project: Project, threadGroupList: ThreadGroup[], threadGroupId: string): void {
    let noSend = true;
    if (threadGroupId === 'new-thread') {
      this.messageService.clear(); // ストック情報を全消ししておく。
      document.title = `AI: new thread`;
      // 新規スレッド作成
      this.selectedThreadGroup = this.threadService.genInitialThreadGroupEntity(this.selectedProject.id);
      this.selectedThreadGroup.threadList.forEach(thread => {
        const contentPart = this.messageService.initContentPart(genDummyId(), this.chatService.defaultSystemPrompt);
        this.messageService.addSingleMessageGroupDry(thread.id, undefined, 'system', [contentPart]);
      });

      // presetスレッドようにスレッドコピーしておく。
      const baseThread = this.selectedThreadGroup.threadList[0];
      safeForkJoin([
        this.messageService.cloneThreadDry(baseThread),
        this.messageService.cloneThreadDry(baseThread),
        this.messageService.cloneThreadDry(baseThread),
      ]).subscribe({
        next: next => {
          (['gpt-4o', 'claude-3-5-sonnet-v2@20241022', 'gemini-2.0-flash-exp'] as GPTModels[]).forEach((model, index) => {
            next[index].inDto.args.model = model;
          });
          this.presetThreadList = next;
        }
      });

      this.rebuildThreadGroup();

      this.inputArea = this.generateInitalInputArea();
      // this.inputArea.previousMessageGroupId = lastMessage.id;
      this.cdr.detectChanges();
      setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);

      // ホーム画面からの遷移の場合は初期値を入れる
      if (this.g.share['home->chat'] && this.g.share['home->chat'].static) {
        // ホーム画面から：home->chat経由で初期値指定されているときは初期値入れる。
        const args = this.g.share['home->chat'];
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
          this.isThreadGroupLoading = true;

          this.cdr.detectChanges();
          // ちょっとご茶ついてるから直さないとダメかも。。cloneThreadDryの後に ).flat().flat().filter(message => message.contents.length === 0).map(message => this.messageService.getMessageContentParts(message)) はなんか違和感がある。
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

              // linkChainの設定
              this.messageGroupIdListMas[this.selectedThreadGroup.threadList[0].id].forEach((messageGroupId, index) => {
                this.linkChain[index] = this.messageService.messageGroupMas[messageGroupId].role !== 'assistant';
              });

              // 5件以上だったら末尾2件を開く。5件未満だったら全部開く。
              // this.allExpandCollapseFlag = this.messageList.length < 5;
              this.allExpandCollapseFlag = this.messageGroupIdListMas[this.selectedThreadGroup.threadList[0].id].length < 5;

              this.selectedThreadGroup.threadList.map(thread => this.messageGroupIdListMas[thread.id]
                .slice().reverse().filter((messageGroupId, index) => index < 2)
                .forEach((messageGroupId, index) => this.messageService.messageGroupMas[messageGroupId].isExpanded = true)
              );
              // スレッドオブジェクトとメッセージグループオブジェクトの不整合（複数スレッドのはずなのにメッセージグループが無いとか）が起きていても大丈夫なようにする。
            }),
            // switchMap(resDto => safeForkJoin(
            //   this.selectedThreadGroup.threadList.map(thread => this.messageGroupIdListMas[thread.id]
            //     .slice().reverse().filter((messageGroupId, index) => index < 2)
            //     .map((messageGroupId, index) => {
            //       this.messageService.messageGroupMas[messageGroupId].isExpanded = true;
            //       return this.messageService.messageGroupMas[messageGroupId].messages;
            //     })
            //   ).flat().flat().filter(message => message.contents.length === 0).map(message => this.messageService.getMessageContentParts(message))
            // )),
            tap(tapRes => {

              let isExist = false;
              // 実行中のメッセージがあったら復旧する
              Object.keys(this.messageGroupIdListMas).forEach(threadId => {
                this.messageGroupIdListMas[threadId].forEach(messageGroupId => {
                  if (this.messageService.messageGroupMas[messageGroupId]) {
                    const message = this.messageService.messageGroupMas[messageGroupId].messages.at(-1)!;
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
              // this.textBodyElem().forEach(elem => DomUtils.scrollToBottomIfNeededSmooth(elem.nativeElement));

              // this.router.navigate(['chat', this.selectedProject.id, thread.id], { relativeTo: this.activatedRoute });
              setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);

              document.title = `AI : ${this.selectedThreadGroup?.title || '(no title)'}`;
            }),
          ).subscribe({
            next: next => {
              this.cdr.detectChanges();
            },
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
    // 本来はupdatedAtでソートしたかったが、何故か時刻が更新されていないので。
    if (this.sortType === 1) {
      // 時刻順（新しい方が上に来る）
      threadGroupList.sort((a, b) => new Date(b.updatedAt) < new Date(a.updatedAt) ? -1 : 1);
    } else {
      // 名前順（Aが上に来る）
      threadGroupList.sort((a, b) => b.title < a.title ? 1 : -1);
    }
    return [...threadGroupList];
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
      const _threadGroupList = this.sortThreadGroup(threadGroupList).filter(threadGroup => threadGroup.type === ThreadGroupType.Normal);
      const mergedUsers = _threadGroupList.map(newObj => {
        const oldObj = this.threadGroupList.find(oldObj => oldObj.id === newObj.id); // idでマッチする詳細を検索
        if (oldObj) {
          Object.assign(oldObj, newObj);
        } else {
          this.threadGroupList.push(newObj);
          this.threadGroupList = [...this.threadGroupList];
        }
      });
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
    const lineMessageList = this.selectedThreadGroup.threadList.map(thread => this.messageGroupIdListMas[thread.id]);
    this.tailMessageGroupList = lineMessageList.map(message => this.messageService.messageGroupMas[message.at(-1)!] ?? null);
    this.tailRole = this.tailMessageGroupList[0] ? this.tailMessageGroupList[0].role : 'system';
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
      this.threadGroupList = [...this.threadGroupList];
      this.sortThreadGroup(this.threadGroupList);
    }));
  }

  cloneThreadGroup(threadGroupId: string) {
    this.isThreadGroupLoading = true
    this.threadService.cloneThreadGroup(threadGroupId).subscribe({
      next: threadGroup => {
        this.threadGroupList.unshift(threadGroup);
        this.threadGroupList = [...this.threadGroupList];
        this.sortThreadGroup(this.threadGroupList);
        this.isThreadGroupLoading = false;
      },
      error: error => {
        console.error(error);
        this.isThreadGroupLoading = false;
      },
    });
  }

  expanded(isExtended: boolean, pIndex: number, tIndex: number, messageGroup: MessageGroupForView): void {
    this.selectedThreadGroup.threadList.forEach((thread, index) => {
      const messageGroup = this.messageService.messageGroupMas[this.messageGroupIdListMas[thread.id][this.indexList[pIndex]]];
      if (tIndex === index) {
      } else if (messageGroup) {
        messageGroup.isExpanded = isExtended;
      }
    });
    this.cdr.detectChanges();
  }

  saveThreadGroup(_orgThreadGroup: ThreadGroup): Observable<ThreadGroup> {
    const orgThreadGroup = Utils.clone(_orgThreadGroup);
    // 選択中スレッドを保存
    return this.threadService.upsertThreadGroup(this.selectedProject.id, _orgThreadGroup).pipe(tap(threadGroup => {
      if (orgThreadGroup.id.startsWith('dummy-')) {
        this.threadGroupList.unshift(threadGroup);
        this.threadGroupList = [...this.threadGroupList];
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

  onFilesDropped(files: FullPathFile[]): Subscription {
    // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする。
    this.tokenObj.totalTokens = -1;
    this.isLock = true;

    let label = '';
    if (files.length === 1) {
      label = files[0].fullPath;
    } else {
      const file = files.find(file => file.fullPath.includes('/'));
      if (file) {
        // フォルダが含まれる場合はフォルダ名を表示
        label = `${file.fullPath.split('/')[0]}/`;
      } else {
        label = `${files.length} files`;
      }
    }
    // fileGroupIdなのかlinkIdなのかは迷ったが、fileGroupIdにしておく。結局fileIdとlinkIdと名前が混在して危険になってしまった。。。
    const file: { type: 'file', fileGroupId: string, text: string, isLoading: boolean } = { type: 'file', fileGroupId: '', text: label, isLoading: true };
    this.inputArea.content.push(file);
    return this.fileManagerService
      .uploadFiles({ uploadType: 'Group', projectId: this.selectedProject.id, contents: files.map(file => ({ filePath: file.fullPath, base64Data: file.base64String, })) })
      .subscribe({
        next: next => {
          next.results.forEach(fileGroupEntity => {
            file.fileGroupId = fileGroupEntity.id;
            file.isLoading = false;
            // this.inputArea.content.push({ type: 'file', fileGroupId: fileGroupEntity.id, text: fileGroupEntity.label });
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
    const charCount = (this.tokenObj.text + this.tokenObj.image + this.tokenObj.audio + this.tokenObj.video) || this.tokenObj.totalBillableCharacters || 0;
    const isLarge = this.tokenObj.totalTokens > 128000 ? 2 : 0;
    // const cost = charCount / 1000 * this.chatService.modelMap[this.inDto.args.model || 'gemini-1.5-pro'].price[isLarge];
    const cost = this.selectedThreadGroup.threadList.map(thread => thread.inDto.args).reduce((prev, curr) => {
      // console.log(`prev=${prev} charCount=${charCount} curr=${this.chatService.modelMap[curr.model || 'gemini-1.5-pro'].price[isLarge]}`)
      return prev + charCount / 1000 * this.chatService.modelMap[curr.model || 'gemini-1.5-pro'].price[isLarge];
    }, 0);
    return cost;
  }

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

  /**
   * スレッドを保存、メッセージの組み立て。
   * トリガとなるメッセージIDを配信。
   * @returns トリガとなるmessageGroupIdの配列
   */
  saveAndBuildThreadGroup(): Observable<string[]> {
    // 初回送信なので、スレッドを作るところから動かす
    const threadGroup = this.saveThreadGroup(this.selectedThreadGroup).pipe(
      tap(threadGroup => this.selectedThreadGroup = threadGroup), // 選択中のものを更新（これをしておかないとthreadGroupの参照が切れる）
      // initialのメッセージオブジェクト群（主にシステムプロンプト）をDB登録
      switchMap(threadGroup =>
        safeForkJoin(threadGroup.threadList.map(thread =>
          // 複雑になってしまったけど、直列実行したい＋配列が空の時も動かしたいを実現するためにこんな感じになっている。
          this.messageGroupIdListMas[thread.id].filter(messageGroupId => messageGroupId.startsWith('dummy-')).length === 0
            ? of([])
            : from(this.messageGroupIdListMas[thread.id].filter(messageGroupId => messageGroupId.startsWith('dummy-')))
              .pipe(
                concatMap(messageGroupId => this.messageService.upsertSingleMessageGroup(this.messageService.messageGroupMas[messageGroupId])),
                toArray(),
              ),
        ).flat())
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
        if (threadGroup.title && threadGroup.title.trim() && threadGroup.title !== '　' && threadGroup.title !== 'No title') {
          // タイトルが設定済みだったら何もしない
        } else {
          // タイトルが無かったら入力分からタイトルを作る。この処理は待つ必要が無いので投げっ放し。
          threadGroup.title = ''; // 一応内容を消しておく
          const presetText = this.messageService.messageGroupList.map(messageGroup => messageGroup.messages[0].contents.filter(content => content.type === 'text').map(content => content.text)).join('\n');
          const inputText = this.inputArea.content.filter(content => content.type === 'text').map(content => content.text).join('\n');
          const mergeText = `SystemPrompt:${presetText.substring(0, 512)}\nUserPrompt:${inputText}`.substring(0, 1024);
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
              next.observer.pipe(
                tap(text => threadGroup.title += text.choices[0].delta.content || ''),
                toArray(),
                tap(text => document.title = `AI : ${threadGroup.title}`),
              ).subscribe({
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
              contentPart.linkId = contentPart.type === 'file' ? (content as { fileGroupId: string }).fileGroupId : undefined;
              return contentPart;
            });
            return this.messageService.upsertSingleMessageGroup(
              this.messageService.initMessageGroup(
                thread.id,
                this.messageGroupIdListMas[thread.id].at(-1),
                this.inputArea.role,
                contents,
              )
            );
          })).pipe(
            map(upsertResponseList => {
              // 入力エリアをクリア
              this.inputArea = this.generateInitalInputArea();
              this.rebuildThreadGroup();
              const messageGroupIdList = this.messageGroupIdListMas[this.selectedThreadGroup.threadList[0].id];
              const tailMessageGroup = this.messageService.messageGroupMas[messageGroupIdList.at(-1)!];
              if (messageGroupIdList.length >= this.linkChain.length) {
                // TODO linkChainの方が短くてassistant以外はチェインしておく。でもこれだとメッセージグループ削除したときに設定が復活しちゃうことにはなる。まぁでもいいや。
                this.linkChain[messageGroupIdList.length - 1] = tailMessageGroup.role !== 'assistant';
              } else { }
              setTimeout(() => {
                DomUtils.textAreaHeighAdjust(this.textAreaElem().nativeElement); // 高さ調整
                // this.textBodyElem().forEach(elem => DomUtils.scrollToBottomIfNeededSmooth(elem.nativeElement));
              }, 0);
              upsertResponseList.forEach(messageGroup => messageGroup.isExpanded = true);
              return upsertResponseList.map(messageGroup => messageGroup.id);
            }),
          );
        } else {
          return of(threadGroup.threadList.map(thread => this.messageGroupIdListMas[thread.id].at(-1)!)); // 末尾にあるメッセージが発火トリガー
        }
      }),
      // 発射準備完了。発射トリガーとなるメッセージIDを返す。とりあえずログ出力もしておく。
      tap(messageGroupId => console.log('Message ID before chat completion:', messageGroupId)),
    );
  }

  touchMessageGroupAndRebuild(messageGroup: MessageGroupForView): Observable<MessageGroupForView> {
    return (
      // ダミーの場合は一旦保存してからじゃないとタイムスタンプの意味ない。
      (messageGroup.threadId.startsWith('dummy-') || messageGroup.id.startsWith('dummy-'))
        ? from(this.messageGroupIdListMas[messageGroup.threadId]).pipe(concatMap(messageGroupId => this.messageService.upsertSingleMessageGroup(this.messageService.messageGroupMas[messageGroupId])))
        : of({})
    ).pipe(
      switchMap(_ => this.messageService.updateTimestamp('message-group', messageGroup.id)),
      map((res) => {
        // updatedAtを更新
        messageGroup.updatedAt = res.updatedAt;
        this.rebuildThreadGroup();
        // this.onChange();
        return messageGroup;
      }),
    )
  }

  // ロック状態を確認するヘルパーメソッド
  isThreadLocked(threadId: string): boolean {
    return this.threadLocks[threadId] || false;
  }

  // スレッドグループ全体のロック状態を確認するヘルパーメソッド
  isThreadGroupLocked(threadGroup: ThreadGroup): boolean {
    return threadGroup.threadList.some(thread => this.isThreadLocked(thread.id));
  }

  /**
   * 履歴の選択変更
   * @param group
   * @param delta
   */
  setSelect($event: Event, group: MessageGroupForView, delta: number): void {
    this.stopPropagation($event);
    const selectedIndex = group.selectedIndex + delta;
    // Chainされている場合はシンクロ
    const chainedList = this.getChaindedMessageGroupList(group, 1);
    chainedList.forEach(group => {
      console.log(group.id, selectedIndex, group.selectedIndex);
      group.selectedIndex = Math.min(Math.max(0, selectedIndex), this.messageService.nextMessageGroupId[group.id].length - 1);
      const selectedMessageGroupId = this.messageService.nextMessageGroupId[group.id][group.selectedIndex];
      const messageGroup = this.messageService.messageGroupMas[selectedMessageGroupId];
      const ids = this.messageService.getTailMessageGroupIds(messageGroup);
      const newMessageGroup = this.messageService.messageGroupMas[ids.at(-1)!];
      // contentのキャッシュを取得
      newMessageGroup.isExpanded = true;
      this.touchMessageGroupAndRebuild(newMessageGroup).subscribe({
        next: newMessageGroup => {
          newMessageGroup.isExpanded = true;
          this.messageService.getMessageContentParts(newMessageGroup.messages[0]).pipe(
            tap(contents => {
              newMessageGroup.messages[0].contents = contents;
              // 本来はメッセージ処理をしないといけないはず、、、
              // this.setBrackets();
              // this.isLoading = false;
              // this.exPanel().open();
            }),
          );
        },
      });
    });
  }

  /**
   * 推論開始トリガーを引く
   */
  send(
    // typeで色々指定できるようにしたかったが、現状messageGroup以外はバグってる。。
    type: 'threadGroup' | 'thread' | 'messageGroup' | 'message' | 'contentPart' | undefined = undefined,
    idList: string[] = [],
    toolCallCommandList?: ToolCallCommand[],
  ): Observable<{
    connectionId: string,
    streamId: string,
    messageGroupList: MessageGroup[],
  }[]> {

    if (this.isLock) {
      this.snackBar.open(`メッセージ受信中は送信できません。途中でやめる場合は右下の✕ボタンでメッセージをキャンセルしてください。`, 'close', { duration: 3000 });
      throw new Error(`メッセージ受信中は送信できません。途中でやめる場合は右下の✕ボタンでメッセージをキャンセルしてください。`);
    } else { }

    if (type === undefined) {
      // デフォルト値はthreadGroup。
      if (this.selectedThreadGroup.threadList.length > 1 && this.userService.chatTabLayout === 'tabs') {
        type = 'thread'; // タブ表示中であれば選択中のスレッドのみとする。
      } else {
        type = 'threadGroup'; // デフォルト値はthreadGroup
      }
    } else {
      // そのまま
    }

    let threadList: Thread[] = [];
    if (type === 'threadGroup') {
      // idListが空の場合は選択中のスレッドグループを使う
      const threadIdList = idList.length > 0
        ? idList.filter(id => this.threadGroupList.find(threadGroup => threadGroup.id === id))
        : this.selectedThreadGroup.threadList.map(thread => thread.id);
      threadList = this.selectedThreadGroup.threadList.filter(thread => threadIdList.includes(thread.id));
    } else if (type === 'thread') {
      // 対称のスレッド
      idList = idList.length > 0 ? idList : [this.selectedThreadGroup.threadList[this.tabIndex].id];
      threadList = this.selectedThreadGroup.threadList.filter(thread => idList.includes(thread.id));
    } else if (type === 'messageGroup') {
      threadList = idList.map(id => this.selectedThreadGroup.threadList.find(thread => thread.id === this.messageService.messageGroupMas[id].threadId)).filter(thread => thread) as Thread[];
    } else if (type === 'message') {
      // 未検証なのでまだ使わない
      // threadList = idList.map(id => this.selectedThreadGroup.threadList.find(thread => thread.id === this.messageService.messageGroupMas[this.messageService.messageMas[id].messageGroupId].threadId)).filter(thread => thread) as Thread[];
      throw new Error('Not implemented');
    } else if (type === 'contentPart') {
      // threadList = idList.map(id => this.selectedThreadGroup.threadList.find(thread => thread.id === this.messageService.messageGroupMas[this.messageService.messageMas[this.messageService.contentPartMas[id].messageId].messageGroupId].threadId)).filter(thread => thread) as Thread[];
      throw new Error('Not implemented');
    } else {
      throw new Error('Not implemented');
    }

    for (const thread of threadList) {
      const tailMessageGroup = this.messageService.messageGroupMas[this.messageGroupIdListMas[thread.id].at(-1)!];
      const modelName = thread.inDto.args.model ?? '';
      const model = this.chatService.modelMap[modelName];
      const args = thread.inDto.args;

      // バリデーションエラー
      if (!args.model) {
        throw new Error('Model is not set');
      } else if (this.tokenObj.totalTokens > model.maxInputTokens) {
        this.snackBar.open(`トークンサイズオーバーです。「${modelName}」への入力トークンは ${model.maxInputTokens}以下にしてください。`, 'close', { duration: 3000 });
        throw new Error(`トークンサイズオーバーです。「${modelName}」への入力トークンは ${model.maxInputTokens}以下にしてください。`);
      } else if (args.isGoogleSearch && !this.chatService.modelMap[args.model].isGSearch) {
        this.snackBar.open(`Google検索統合は Gemini 系統以外では使えません。`, 'close', { duration: 3000 });
        args.isGoogleSearch = false;
        throw new Error(`Google search is not available for ${args.model}.`);
      } else if (tailMessageGroup.role === 'assistant' && this.inputArea.content[0].text.length === 0 && toolCallCommandList === undefined) { // toolCallCommandがある場合はツールからの入力とみなす
        if (this.inputArea.content.length > 1) {
          this.snackBar.open(`ファイルだけでは送信できません。何かメッセージを入力してください。`, 'close', { duration: 3000 });
          throw new Error('ファイルだけでは送信できません。何かメッセージを入力してください。');
        } else {
          this.snackBar.open(`メッセージを入力してください。`, 'close', { duration: 3000 });
          // throw new Error('メッセージを入力してください。');
        }
      }

      // 継続系
      if (modelName.startsWith('claude-') && (thread.inDto.args.temperature || 0) > 1) {
        this.snackBar.open(`claude はtempertureを0～1.0の範囲で使ってください。`, 'close', { duration: 3000 });
        thread.inDto.args.temperature = 1;
      } else { }
      const turnCount = Math.floor(this.messageGroupIdListMas[thread.id].length / 2);
      if (turnCount / 7 > 1 && turnCount % 7 % 2 === 0 && this.tokenObj.totalTokens > 16384) {
        // 7問い合わせごとにアラート出す
        this.snackBar.open(`チャット内のやり取りが長引いてきました。話題が変わった際は左上の「新規チャット」から新規チャットを始めることをお勧めします。\n（チャットが長くなるとAIの回答精度が落ちていきます）`, 'close', { duration: 6000 });
      } else { }
    }

    // this.isLock = true;
    // ロックチェックを修正
    for (const thread of threadList) {
      if (this.isThreadLocked(thread.id)) {
        this.snackBar.open(`メッセージ受信中のスレッドがあります。途中でやめる場合は右下の✕ボタンでメッセージをキャンセルしてください。`, 'close', { duration: 3000 });
        throw new Error(`メッセージ受信中のスレッドがあります。`);
      }
    }
    // 対象スレッドをロック
    threadList.forEach(thread => this.threadLocks[thread.id] = true);

    // 初回送信後はプレースホルダをデフォルトのものに戻す。
    this.placeholder = this.defaultPlaceholder;

    // キャッシュ使う場合はキャッシュ期限をcacheTtlInSecondsまで伸ばす
    const inDto = threadList[0].inDto;
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

    _paq.push(['trackEvent', 'AIチャット', 'メッセージ送信', threadList.length]);

    return this.saveAndBuildThreadGroup().pipe(
      switchMap(messageGroupIds =>
        safeForkJoin(messageGroupIds.filter(messageGroupId => {
          if (type === 'threadGroup') {
            return true;
          } else if (type === 'thread') {
            return true;
            return idList.includes(this.messageService.messageGroupMas[messageGroupId].threadId);
          } else if (type === 'messageGroup') {
            return idList.includes(messageGroupId); // 対象のやつだけに絞り込む
            // } else if (type === 'message') {  // 未検証なのでまだ使わない
            //   return idList.includes(this.messageService.messageMas[messageGroupId].messageGroupId);
            // } else if (type === 'contentPart') {
            //   const flag = idList.map(id => this.messageService.contentPartMas[id].messageId).map(messageId => this.messageService.messageMas[messageId].messageGroupId).includes(messageGroupId);
            //   // console.log(`flag=${flag} idList=${idList} messageGroupId=${messageGroupId}`);
            //   return flag;
          } else {
            throw new Error('Not implemented');
          }
        }).map((messageGroupId, index) =>
          // contentPartの切り分けが失敗しまくっている。。。
          this.chatService.chatCompletionObservableStreamByProjectModel(threadList[index].inDto.args, 'messageGroup', messageGroupId, toolCallCommandList)
            .pipe(
              tap(resDto => {
                // console.log('response-------------------------');
                // console.log(resDto);
                // キャッシュを更新する
                // 初回の戻りを受けてからメッセージリストにオブジェクトを追加する。こうしないとエラーの時にもメッセージが残ってしまう。

                // TODO toolの場合のmeta編集をしておかないといけない。でもこの整形色々なところで書いていて冗長なのでどこかにまとめたい。
                resDto.messageGroupList.forEach(messageGroup => {
                  messageGroup.messages.forEach(message => {
                    message.contents.forEach(contentPart => {
                      if (contentPart.type === ContentPartType.TOOL) {
                        // ツールの場合、ツールの内容をセットする
                        // ツールの場合、ツールの内容をセットする
                        contentPart.toolCallGroup = { toolCallList: JSON.parse(contentPart.text as string) };
                        // this.messageService.contentPartMas[contentPart.id] = contentPart;
                      } else { }
                    });
                  });

                  // 新規メッセージを追加？
                  this.messageService.applyMessageGroup(messageGroup);
                  this.chatStreamSubscriptionList[this.selectedThreadGroup.id] = this.chatStreamSubscriptionList[this.selectedThreadGroup.id] || [];
                  messageGroup.isExpanded = true;
                  messageGroup.messages.map(message => {
                    if (message.observer) {
                      this.chatStreamSubscriptionList[this.selectedThreadGroup.id].push(message.observer.subscribe(this.chatStreamHander(message)));
                      console.log(`Message ID before chat completion: ${message.id}`);
                    } else { }
                  });
                });
                // 一番下まで下げる
                this.textBodyElem().forEach(elem => DomUtils.scrollToBottomIfNeededSmooth(elem.nativeElement));
                this.rebuildThreadGroup();
                this.autoscroll = true;
                this.beforeScrollTop = -1;
                console.log(this.messageGroupIdListMas);
              }),
              catchError(error => {
                // エラー時も必ず各スレッドのロックを解除する
                threadList.forEach(thread => this.threadLocks[thread.id] = false);
                return throwError(() => error);
              })
            ),
        )).pipe(tap(text => {
          // console.log(`pipe---------------------${text}`);
          // メッセージID紐づけ。
          this.rebuildThreadGroup();

          // 入力ボックスのサイズを戻す。
          setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);
          // setTimeout(() => {
          //   this.textBodyElem().forEach(elem => DomUtils.scrollToBottomIfNeededSmooth(elem.nativeElement));
          // }, 100);
        })),
      ),
    );
  }

  scrollRange = -1;
  autoscroll = false;
  beforeScrollTop = -1;
  /**
   * チャットのレスポンスストリームを捌くハンドラ
   * @param message
   * @returns
   */
  chatStreamHander(message: MessageForView): Partial<Observer<OpenAI.ChatCompletionChunk>> | ((value: OpenAI.ChatCompletionChunk) => void) {
    return {
      next: _next => {
        // ここのChatStreamにはContentPartが付与されているはず
        const next = _next as OpenAI.ChatCompletionChunk & { contentPart?: ContentPart };
        // console.dir(next);

        let content: ContentPart;
        next.choices.forEach(choice => {

          content = message.contents[message.contents.length - 1];

          if (choice.delta) {
            // 通常の中身
            if (choice.delta.content && !['tool', 'info', 'command', 'input'].includes(choice.delta.role || '')) {
              const text = choice.delta.content;
              content.text += text;
              // console.log(`content=${choice.delta.content}`);
            } else { }

            // tool_info
            if (choice.delta.role as any === 'info') {
              if (content.type === ContentPartType.TOOL) {

              } else {
                if (content.text) {
                  // textだったらブレイクする
                  const contentPart = this.messageService.initContentPart(message.id, '');
                  contentPart.type = ContentPartType.TOOL;
                  message.contents.push(contentPart);
                  this.messageService.addMessageContentPartDry(contentPart.id, contentPart);
                  content = contentPart;
                } else {
                  // 既存のcontentを使う
                  content.type = ContentPartType.TOOL;
                }
              }

              // console.log('tool_call', tool_call);
              // 最初の1行のみidが振られているので、それを使ってtoolCallを作る。
              const toolCallId = (choice.delta as { tool_call_id: string }).tool_call_id;
              const infoBody = JSON.parse(choice.delta.content || '{}') as ToolCallInfoBody;
              const info = { type: ToolCallType.INFO, body: infoBody, toolCallId } as ToolCallInfo;
              if (content.toolCallGroup) {
              } else {
                // content.toolCallGroup = { id: next.contentPart.id, toolCallList: [] };
                content.toolCallGroup = { toolCallList: [] };
              }
              const ary = JSON.parse(content.text || '[]');
              ary.push(info);
              content.text = JSON.stringify(ary);

              // const toolCallGroupId = next.contentPart.linkId || '';
              const toolCallGroupId = '';
              content.toolCallGroup.toolCallList.push({ type: ToolCallType.INFO, body: infoBody, seq: content.toolCallGroup.toolCallList.length, toolCallGroupId, toolCallId });
              // content.id = next.contentPart.id;
            } else {/** infoじゃないのは無視 */ }

            // tool_calls
            if (choice.delta.tool_calls && choice.delta.tool_calls.length > 0) {
              choice.delta.tool_calls.forEach(tool_call => {
                // console.dir(choice.delta, { depth: null });
                // 先頭行以外はtool_call.idがundefined
                if (tool_call.id) {
                  const content = message.contents.findLast(content => content.type === ContentPartType.TOOL);
                  if (content && content.type === ContentPartType.TOOL) {
                    if (content.toolCallGroup) {
                      content.toolCallGroup.toolCallList.push({ type: ToolCallType.CALL, body: tool_call as ToolCallCallBody, seq: content.toolCallGroup.toolCallList.length, toolCallGroupId: '', toolCallId: tool_call.id });
                    } else { throw new Error('toolCallGroup is not set'); } // ここに来るのはおかしいのでエラーにする
                  } else { throw new Error('content is not tool'); } // ここに来るのはおかしいのでエラーにする
                } else {
                  // 2行目以降はidが無いのでcontentを使う
                  if (tool_call.function) {
                    const content = message.contents.findLast(content => content.type === ContentPartType.TOOL);
                    if (content && content.toolCallGroup) {
                      // tool_call_idは無いので、単純に最後のtoolCallを取得してargumentsを追加する
                      const toolCall = content.toolCallGroup.toolCallList.findLast(toolCall => toolCall.type === ToolCallType.CALL) as ToolCallCall;
                      if (toolCall) {
                        toolCall.body.function.arguments += tool_call.function.arguments || '';
                      } else { throw new Error('content is not tool'); } // ここに来るのはおかしいのでエラーにする
                    } else { throw new Error('content is not tool'); } // ここに来るのはおかしいのでエラーにする
                  } else { throw new Error('content is not tool'); } // ここに来るのはおかしいのでエラーにする
                }
              });
            } else { /** tool_callsが無ければ何もしない */ }

            // tool_result
            if (['tool', 'command', 'input'].includes(choice.delta.role || '')) {
              const tool_call_id = (choice.delta as { tool_call_id: string }).tool_call_id;
              const content = message.contents.find(content => content.type === ContentPartType.TOOL);
              if (content && content.toolCallGroup) {
                // console.log('tool_result', choice.delta);
                const toolCall = choice.delta as ToolCallBody;
                if ('tool' === choice.delta.role) {
                  const toolCall = choice.delta as ToolCallResultBody;
                  // content.meta.result = choice.delta;
                  // content.meta.call.function.arguments = JSON.stringify(JSON.parse(content.meta.call.function.arguments), null, 2);
                  // content.meta.result.content = JSON.stringify(JSON.parse(content.meta.result.content), null, 2);
                  // content.text = JSON.stringify(content.meta);
                  content.toolCallGroup.toolCallList.push({
                    type: ToolCallType.RESULT,
                    body: choice.delta as ToolCallResultBody,
                    seq: content.toolCallGroup.toolCallList.length,
                    toolCallGroupId: 'content.toolCallGroup.id',//content.toolCallGroup.id,
                    // toolCallGroupId: content.toolCallGroup.id,
                    toolCallId: toolCall.tool_call_id,
                  });
                } else {
                  // tool以外はmetaに格納
                  content.toolCallGroup.toolCallList.push({
                    type: choice.delta.role as ToolCallType,
                    body: choice.delta as any,
                    seq: content.toolCallGroup.toolCallList.length,
                    toolCallGroupId: 'content.toolCallGroup.id',
                    // toolCallGroupId: content.toolCallGroup.id,
                    toolCallId: (toolCall as { tool_call_id: string }).tool_call_id,
                  });
                }
              } else {
                throw new Error('content is not tool');
              } // ここに来るのはおかしいのでエラーにする
            } else {/** infoじゃないのは無視 */ }
          } else {/** deltaが無いものはないような気もするけど、、 */ }

          // Google検索結果のメタデータをセットする
          const groundingMetadata = (choice as any).groundingMetadata;
          if (groundingMetadata) {
            const contentPart = this.messageService.initContentPart(message.id, JSON.stringify({ groundingMetadata }));
            contentPart.type = ContentPartType.META;
            contentPart.meta = { groundingMetadata };
            if (contentPart.meta && contentPart.meta.groundingMetadata && contentPart.meta.groundingMetadata.searchEntryPoint && contentPart.meta.groundingMetadata.searchEntryPoint.renderedContent) {
              // リンクを新しいタブで開くようにする
              contentPart.meta.groundingMetadata.searchEntryPoint.renderedContent = this.sanitizer.bypassSecurityTrustHtml(contentPart.meta.groundingMetadata.searchEntryPoint.renderedContent.replace(/<a /g, '<a target="_blank" '));
            } else { }
            message.contents.push(contentPart);
            this.messageService.addMessageContentPartDry(contentPart.id, contentPart);
          } else {
            if (choice.finish_reason) {
              // // 整形（ここでやるのもイマイチだが、、、）
              // if (content.type === ContentPartType.TOOL && content.meta && content.meta.call && content.meta.call.function) {
              //   content.meta.call.function.arguments = JSON.stringify(JSON.parse(content.meta.call.function.arguments), null, 2);
              // } else { }
              const contentPart = this.messageService.initContentPart(message.id, '');
              contentPart.type = ContentPartType.TEXT;
              message.contents.push(contentPart);
              this.messageService.addMessageContentPartDry(contentPart.id, contentPart);
            }
          }
        });

        this.cdr.detectChanges();
        message.status = MessageStatusType.Editing;
        this.bitCounter++;
        if (this.autoscroll) {
          // 一回でも上スクロールしてたらオートスクロールをオフ。
          const threadIndex = this.selectedThreadGroup.threadList.map(thread => thread.id).indexOf(this.messageService.messageGroupMas[message.messageGroupId].threadId);
          this.textBodyElem().forEach((elem, index) => {
            // tab表示中は非表示タブの中身は消えているので0版をターゲットとする
            if (index === threadIndex || this.userService.chatTabLayout && index === 0) {
              requestAnimationFrame(() => {
                const scrollTop = elem.nativeElement.scrollTop;
                if (scrollTop > 0) {
                  // console.log(this.beforeScrollTop, scrollTop);
                  if (this.beforeScrollTop <= scrollTop) {
                    this.beforeScrollTop = scrollTop;
                    if (this.userService.chatTabLayout === 'tabs') {
                      this.anchor().at(-1)?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                      this.chatPanelGroupElem()?.at(-1)?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    DomUtils.scrollToBottomIfNeededSmooth(elem.nativeElement);
                  } else {
                    this.autoscroll = false;
                  }
                }
              });
            } else { }
          });
        } else { }
      },
      error: error => {
        this.chatErrorHandler(message, error);
        this.chatAfterHandler(message); // observableはPromise.then/catch/finallyのfinallyとは違って、エラーになったらcompleteは呼ばれないので自分で呼ぶ。
      },
      complete: () => {
        // textなのに中身がないものは削除する。
        message.contents = message.contents.filter(content => !(content.type === ContentPartType.TEXT && !content.text));
        // console.dir(message.contents);
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
    // console.log(`after----------------`);
    this.autoscroll = false;
    const threadId = this.messageService.messageGroupMas[message.messageGroupId].threadId;
    const threadGroup = this.threadGroupList.find(threadGroup => threadGroup.threadList.find(thread => thread.id === threadId));
    if (threadGroup) {
      // TODO DANGER this.を使っているのでスレッドグループ行き来したときに混ざってないか心配。。。
      this.threadLocks[threadId] = false;
      delete this.chatStreamSubscriptionList[threadGroup.id];
      if (this.selectedThreadGroup.id === threadGroup.id) {
        // new-threadだった時はチャットが完了したらURL動かしておく。
        this.router.navigate(['chat', threadGroup.projectId, threadGroup.id]);
      } else { }
    } else { }
    this.isLock = false;
    message.status = MessageStatusType.Loaded;
    message.label = message.contents.filter(content => content.type === 'text').map(content => content.text).join('\n').substring(0, 250);
    this.bulkNext();
    setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);
  }

  // エラーハンドラー
  chatErrorHandler(message: MessageForView, error: Error): void {
    // ERROR
    // 原因不明のエラーです
    // "ClientError: [VertexAI.ClientError]: got status: 429 Too Many Requests. {\"error\":{\"code\":429,\"message\":\"Resource exhausted. Please try again later. Please refer to https://cloud.google.com/vertex-ai/generative-ai/docs/quotas#error-code-429 for more details.\",\"status\":\"RESOURCE_EXHAUSTED\"}}"
    // "ClientError: [VertexAI.ClientError]: got status: 400 Bad Request. {\"error\":{\"code\":400,\"message\":\"The document has no pages.\",\"status\":\"INVALID_ARGUMENT\"}}"
    try {
      const contentPart = this.messageService.initContentPart(message.id, JSON.stringify(error));
      message.contents.push(contentPart);
      this.messageService.addMessageContentPartDry(contentPart.id, contentPart);
      contentPart.type = ContentPartType.ERROR;
      this.cdr.detectChanges();
    } catch (err) { }

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
    _paq.push(['trackEvent', 'AIチャット', 'メッセージキャンセル', this.selectedThreadGroup.threadList.length]);
    this.selectedThreadGroup.threadList.forEach(thread => {
      if (this.chatStreamSubscriptionList[this.selectedThreadGroup.id]) {
        this.threadLocks[thread.id] = false;
        setTimeout(() => { this.textAreaElem().nativeElement.focus(); }, 100);
        this.chatStreamSubscriptionList[this.selectedThreadGroup.id].forEach(s => s.unsubscribe());
      }
    });
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
      // console.log(this.messageGroupIdListMas[thread.id].at(-1));
      const inDto: ChatInputArea[] = [];
      let tailMessageGroupId = '';
      this.messageGroupIdListMas[thread.id].map(messageGroupId => {
        const messageGroup = this.messageService.messageGroupMas[messageGroupId];
        if (messageGroupId.startsWith('dummy-') && messageGroup && messageGroup.messages) {
          messageGroup.messages.map(message => {
            inDto.push({
              role: messageGroup.role,
              messageGroupId: messageGroup.id,
              content: message.contents.filter(content => content.text).map(content => {
                return {
                  type: content.type,
                  text: content.text,
                  fileId: content.linkId,
                } as ChatContent;
              }),
            });
          });
        } else {
          tailMessageGroupId = messageGroupId;
        }
      });
      if (this.inputArea.content[0].text) {
        inDto.push(this.inputArea);
      } else { }
      return this.chatService.countTokensByProjectModel(inDto, 'messageGroup', tailMessageGroupId);
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
    this.textAreaElem() && setTimeout(() => { DomUtils.textAreaHeighAdjust(this.textAreaElem().nativeElement); }, 0);
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

    const disabledModels = [];
    for (const thread of threadGroup.threadList) {
      // threadGroup.threadList
      if (thread.inDto.args.model) {
        if (this.chatService.modelMap[thread.inDto.args.model].isEnable) {
        } else {
          disabledModels.push(thread.inDto.args.model);
        }
      }
    }
    // this.dialog.open(DialogComponent, { data: { title: 'alert', message: `現在 ${disabledModels.join('、')}は使えません。他のモデルを使ってください。`, options: ['Close'] } });

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
      return this.saveAndBuildThreadGroup().pipe(switchMap(
        // トリガーを引く
        messageGroupId => this.chatService.createCacheByProjectModel(
          thread.inDto.args.model ?? '', messageGroupId[0], 'messageGroup',
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
    _paq.push(['trackEvent', 'AIチャット画面操作', 'パネルの一括開閉', this.allExpandCollapseFlag]);
    // this.chatSystemPanelList
    this.chatPanelList().forEach(chat => {
      if (this.allExpandCollapseFlag) {
        chat.exPanel().open();
      } else {
        chat.exPanel().close();
      }
    });
    this.cdr.detectChanges();
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

  removeThread(targetThread: Thread): void {
    const threadGroup = this.selectedThreadGroup;
    const thread = threadGroup.threadList.find(_thread => _thread.id === targetThread.id);
    if (thread && threadGroup.threadList.length > 1) {
      this.dialog.open(DialogComponent, { data: { title: '削除', message: `このスレッドを削除しますか？\n「${thread.inDto.args.model}」`, options: ['削除', 'キャンセル'] } }).afterClosed().subscribe({
        next: next => {
          if (next === 0) {
            threadGroup.threadList.splice(threadGroup.threadList.indexOf(thread), 1);
            if (thread.id.startsWith('dummy-')) {
              // ダミーの場合はAPIには送る必要が無い。
            } else {
              this.threadService.upsertThreadGroup(threadGroup.projectId, threadGroup).subscribe({
                next: next => {
                },
                error: error => {
                  this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
                },
              });
            }
          } else { /** 削除キャンセル */ }
        }
      });
    } else {
      // TODO 選択中のスレッドグループじゃないやつを消そうとしてる。現在はこれはエラー。
      this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
    }
  }

  removeMessageGroup(messageGroup: MessageGroupForView): void {
    this.getChaindedMessageGroupList(messageGroup).forEach(messageGroup => {
      if (this.isThreadLocked(messageGroup.threadId)) {
        this.snackBar.open(`現在処理中のため削除できません。`, 'close', { duration: 3000 });
        return;
      } else { }
      (messageGroup.id.startsWith('dummy-') ? this.saveAndBuildThreadGroup() : of([])).subscribe({
        next: next => {
          if (messageGroup.role === 'system' || !messageGroup.previousMessageGroupId) {
            return;
          } else { }
          if (!this.messageService.messageGroupMas[messageGroup.previousMessageGroupId]) return;

          // あえてOutOfBoundsさせる
          messageGroup.selectedIndex = messageGroup.messages.length;

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
            },
          });
        },
        error: error => {
          this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
        },
      });
    });
  }

  toolExec(obj: { contentPart: ContentPart, toolCallCommandList: ToolCallCommand[] }): void {
    console.log(obj);
    this.messageService.updateTimestamp('message-group', this.messageService.messageMas[obj.contentPart.messageId].messageGroupId).subscribe({
      next: next => {
        this.rebuildThreadGroup();
        this.onChange();
        const messageGroupId = this.messageService.messageMas[obj.contentPart.messageId].messageGroupId;
        this.send('messageGroup', [messageGroupId], obj.toolCallCommandList).subscribe();
      },
      error: error => {
        this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
      },
    });
  }

  /**
   * 指定されたメッセージグループのリンクチェインを取得する
   * @param messageGroup
   * @returns
   */
  getChaindedMessageGroupList(messageGroup: MessageGroupForView, offset: number = 0): MessageGroupForView[] {
    const targetMessageGrouplist = [];
    if (this.userService.chatTabLayout === 'tabs') {
      // tabモードの時は単独
      targetMessageGrouplist.push(messageGroup);
    } else {
      const index = this.messageGroupIdListMas[messageGroup.threadId].findIndex(messageGroupId => messageGroupId === messageGroup.id);
      if (!this.linkChain[index + offset]) { // linkChainの位置をoffsetで無理矢理ずらす。selectIndexが1個下のやつのインデックスになっていて画面の見た目と合わないからこういった無理矢理なことをしている。
        // linkChain=falseの場合は自分だけ
        targetMessageGrouplist.push(messageGroup);
      } else {
        // linkChain=trueの場合は全て
        Object.keys(this.messageGroupIdListMas).forEach(threadId => {
          const syncMessageGroup = this.messageService.messageGroupMas[this.messageGroupIdListMas[threadId][index]];
          if (syncMessageGroup) {
            targetMessageGrouplist.push(syncMessageGroup);
          } else {
            // ない場合は何もしなくてよい
          }
        });
      }
    }
    return targetMessageGrouplist;
  }

  editSystem(thread: Thread): void {
    console.log(thread.inDto.args)
    if (this.linkChain[0]) {
      this.selectedThreadGroup.threadList.forEach(_thread => {
        if (_thread.id === thread.id) {
        } else {
          // 他のスレッドにコピーする。
          _thread.inDto.args.tool_choice = thread.inDto.args.tool_choice;
          _thread.inDto.args.parallel_tool_calls = thread.inDto.args.parallel_tool_calls;
        }
      });
    } else {
      // リンクしていないときは無視
    }
  }
  editChat(messageGroup: MessageGroupForView): void {
    const targetMessageGroupList = this.getChaindedMessageGroupList(messageGroup);
    const syncTargetMessageGroupList = targetMessageGroupList.filter(_messageGroup => _messageGroup !== messageGroup);

    // 複数ある場合はシンクロさせる
    if (syncTargetMessageGroupList.length > 0) {
      syncTargetMessageGroupList.forEach(syncMessageGroup => {
        syncMessageGroup.messages.forEach((message, mIndex) => {
          message.contents.forEach((content, cIndex) => {
            if (cIndex < messageGroup.messages[mIndex].contents.length) {
              content.type = messageGroup.messages[mIndex].contents[cIndex].type;
              content.text = messageGroup.messages[mIndex].contents[cIndex].text;
              content.meta = messageGroup.messages[mIndex].contents[cIndex].meta;
              content.linkId = messageGroup.messages[mIndex].contents[cIndex].linkId;
              content.tokenCount = messageGroup.messages[mIndex].contents[cIndex].tokenCount;
            } else {
              content.id = undefined as any; // 無理矢理消す
            }
          });
          if (mIndex < messageGroup.messages.length) {
            message.cacheId = messageGroup.messages[mIndex].cacheId;
            message.label = messageGroup.messages[mIndex].label;
          } else {
            message.id = undefined as any; // 無理矢力消す
          }
        });
        syncMessageGroup.role = messageGroup.role;
        syncMessageGroup.type = messageGroup.type;
        syncMessageGroup.selectedIndex = messageGroup.selectedIndex;
      });
    } else {
      // 1つだけの場合はそのまま編集
    }

    // ここからは編集処理
    let fineCounter = targetMessageGroupList.length;
    const after = (messageGroup?: MessageGroupForView): void => {
      fineCounter--;
      if (fineCounter === 0) {
        this.rebuildThreadGroup();
        this.onChange();
        setTimeout(() => this.textAreaElem().nativeElement.focus(), 0);
      } else { }
    }
    const afterProc = {
      next: next => {
        after(next);
      },
      error: error => {
        this.snackBar.open(`メッセージ更新に失敗しました。`, 'close', { duration: 3000 });
        after();
        // TODO メッセージ戻す処理が必要。
      }
    } as Partial<Observer<MessageGroupForView>> | ((value: MessageGroupForView) => void) | undefined;
    for (const messageGroup of targetMessageGroupList) {
      // TODO 本当は次の送信までメッセージ保存したくないけどどうしようもないので一旦保存しておく。
      // 内容を変更した場合は別メッセージとして扱う。
      if (messageGroup.role === 'system') {
        if (messageGroup.messages[0].id.startsWith('dummy-')) {
        } else {
          // system：システムプロンプトはツリーを変えたくないので単純にedit
          safeForkJoin(messageGroup.messages.map(message => this.messageService.editMessageWithContents(message))).pipe(
            map(next => {
              // 戻ってきたもので元オブジェクトに更新を掛ける。
              next.forEach((message, index) => messageGroup.messages[index] = message);
              return messageGroup;
            }),
          ).subscribe(afterProc);
        }
      } else {
        this.messageService.upsertSingleMessageGroup(messageGroup).subscribe(afterProc);
      }
    }
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
    this.dialog.open(DialogComponent, { data: { title: 'チャット削除', message: `このチャットを削除しますか？\n「${threadGroup.title.replace(/\n/g, '')}」`, options: ['削除', 'キャンセル'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 0) {
          this.threadService.deleteThreadGroup(threadGroup.id).subscribe({
            next: next => {
              this.threadGroupList.splice(this.threadGroupList.indexOf(threadGroup), 1);
              this.threadGroupList = [...this.threadGroupList];
              if (threadGroup.id === this.selectedThreadGroup.id) {
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
              this.threadGroupList.splice(this.threadGroupList.indexOf(threadGroup), 1);
              this.threadGroupList = [...this.threadGroupList];
              if (threadGroup.id === this.selectedThreadGroup.id) {
                this.clear();
              } // 選択中のスレッドを移動した場合は選択解除
              this.snackBar.open(`チャットを移動しました。`, 'close', { duration: 3000 });
            },
          });
        },
        error: error => {
          console.error(error);
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
          ...this.bulkRunSetting,
          projectId: this.selectedProject.id,
        }
      }).afterClosed().subscribe({
        next: (next: BulkRunSettingData) => {
          // モーダル閉じたら実行かける
          if (next && next.contents.length > 0) {
            this.bulkRunSetting = next;
            if (next.mode === 'serial') {
              // 直列実行
              this.bulkNext();
            } else {
              // 並列実行
              Object.keys(this.messageGroupIdListMas).map(threadId => {
                const tailMessageGroupId = this.messageGroupIdListMas[threadId].at(-1);
                const messageGroup = this.messageService.initMessageGroup(threadId, tailMessageGroupId, 'user', []);
                messageGroup.previousMessageGroupId = tailMessageGroupId;
                messageGroup.messages = []; // ゴミmessageが作られているので消す
                next.contents.map((content, index) => {
                  const contents: ContentPart[] = [];
                  const message = this.messageService.initMessage(messageGroup.id, contents);
                  message.subSeq = index;
                  const text = next.promptTemplate.replace('${value}', content.text);
                  const contentPartText = this.messageService.initContentPart(message.id, text);
                  contentPartText.text = text;
                  contents.push(contentPartText);
                  if (content.type === 'text') {
                  } else if (content.type === 'file') {
                    const contentPartFile = this.messageService.initContentPart(message.id, content.text);
                    contentPartFile.type = content.type as ContentPartType;
                    contentPartFile.linkId = content.fileGroupId;
                    contents.push(contentPartFile);
                  }
                  message.contents = contents;
                  messageGroup.messages.push(message);
                });
                return this.messageService.applyMessageGroup(messageGroup);
              })
              this.rebuildThreadGroup();
              this.send().subscribe();
              this.bulkRunSetting.contents = [];
            }
          } else {
            // キャンセル
            this.bulkRunSetting.contents = [];
          }
        }
      });
    }
  }

  tabIndex = 0;
  scrollPositions: number[] = [];
  saveScrollPosition(tabIndex: number): void {
    const bodyElem = this.textBodyElem().at(tabIndex);
    if (bodyElem && bodyElem.nativeElement) {
      this.scrollPositions[tabIndex] = bodyElem.nativeElement.scrollTop || 0;
    } else { }
  }
  restoreScrollPosition(tabIndex: number): void {
    this.tabIndex = tabIndex;
    setTimeout(() => {
      const bodyElem = this.textBodyElem().at(tabIndex);
      if (bodyElem) {
        bodyElem.nativeElement.scrollTop = this.scrollPositions[tabIndex] || 0;
      } else { }
    }, 0);
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
          this.inputArea.content.push({ type: 'file', fileGroupId: content.fileGroupId, text: content.text });
        }
        this.send().subscribe();
      }
    } else { }
  }

  clear() {
    this.messageService.clear(); // ストック情報を全消ししておく。
    this.threadGroupChangeHandler(this.selectedProject, this.threadGroupList, 'new-thread');
    // this.rebuildThreadGroup();
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
