import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FileEntity, FileManagerService, FileUploadContent, FullPathFile } from './../../services/file-manager.service';
import { MessageService, ProjectService, TeamService, ThreadService } from './../../services/project.service';
import { concatMap, from, map, mergeMap, of, Subscription, switchMap, Observer } from 'rxjs';
import { ChangeDetectorRef, Component, ElementRef, NgZone, OnInit, QueryList, TemplateRef, ViewChild, ViewChildren, inject } from '@angular/core';
import { ChatPanelComponent } from '../../parts/chat-panel/chat-panel.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

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

import { saveAs } from 'file-saver'; // Blobファイルのダウンロードのためのライブラリ

import { CachedContent, ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionStreamInDto, SafetyRating, safetyRatingLabelMap } from '../../models/models';
import { ChatInputArea, ChatService, CountTokensResponse } from '../../services/chat.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, tap, toArray } from 'rxjs';
import { DomUtils, safeForkJoin } from '../../utils/dom-utils';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { ThreadDetailComponent } from '../../parts/thread-detail/thread-detail.component';
import { AuthService } from '../../services/auth.service';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { BaseEntity, ContentPart, ContentPartType, Message, MessageClusterType, MessageForView, MessageGroup, MessageGroupListResponseDto, MessageGroupResponseDto, MessageGroupType, MessageUpsertResponseDto, Project, ProjectVisibility, Team, TeamType, Thread, ThreadVisibility, UUID } from '../../models/project-models';
import { GService } from '../../services/g.service';
import { UserMarkComponent } from "../../parts/user-mark/user-mark.component";
import { BulkRunSettingComponent } from '../../parts/bulk-run-setting/bulk-run-setting.component';
import { Utils } from '../../utils';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule, ChatPanelComponent, FileDropDirective, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatSliderModule, MatMenuModule, MatDialogModule, MatRadioModule, MatSelectModule,
    MatSnackBarModule, MatDividerModule, MatCheckboxModule,
    DialogComponent,
    UserMarkComponent
  ],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss'
})
export class ChatComponent implements OnInit {

  // メッセージ表示ボックスのリスト
  @ViewChildren(ChatPanelComponent)
  chatPanelList!: QueryList<ChatPanelComponent>;

  // チャット入力欄
  @ViewChild('textAreaElem', { static: false })
  textAreaElem!: ElementRef<HTMLTextAreaElement>;

  // チャット表示欄
  @ViewChild('textBodyElem', { static: false })
  textBodyElem!: ElementRef<HTMLDivElement>;

  @ViewChild(FileDropDirective, { static: false })
  appFileDrop?: FileDropDirective;

  // スレッドリスト
  threadList: Thread[] = [];
  // 現在のスレッド
  selectedThread?: Thread;

  messageGroupListAll: MessageGroupResponseDto[] = [];
  messageGroupMap: Record<UUID, MessageGroupResponseDto> = {};
  messageList: MessageForView[] = [];
  messageMap: Record<UUID, MessageForView> = {};

  bitCounter = 0; // chatPanelにイベントを送るためだけのカウンタ

  // メッセージの枠を全部一気に開くか閉じるかのフラグ
  allExpandCollapseFlag = true;

  // キャッシュ保持時間（1時間）
  cacheTtlInSeconds = 60 * 60;

  inputArea: ChatInputArea = this.generateInitalInputArea();

  inDto!: ChatCompletionStreamInDto;

  /**
   * gemini は 1,000 [文字] あたりの料金
   * claude は 1,000 [トークン] あたりの料金
   * 入力、出力、128kトークン以上時の入力、128kトークン以上時の出力
   */
  priceMap: Record<string, number[]> = {
    'gemini-1.0-pro': [0.000125, 0.000375, 0.000125, 0.000375],
    'gemini-1.0-pro-vision': [0.000125, 0.000375, 0.000125, 0.000375],
    'gemini-1.5-flash': [0.000125, 0.000375, 0.00025, 0.00075],
    'gemini-1.5-flash-001': [0.000125, 0.000375, 0.00025, 0.00075],
    'gemini-1.5-flash-002': [0.000125, 0.000375, 0.00025, 0.00075],
    'gemini-1.5-pro': [0.00125, 0.00375, 0.0025, 0.0075],
    'gemini-1.5-pro-001': [0.00125, 0.00375, 0.0025, 0.0075],
    'gemini-1.5-pro-002': [0.00125, 0.00375, 0.0025, 0.0075],

    'gemini-flash-experimental': [0.000125, 0.000375, 0.00025, 0.00075],
    'gemini-pro-experimental': [0.00125, 0.00375, 0.0025, 0.0075],

    'claude-3-5-sonnet@20240620': [0.003, 0.015, 0.003, 0.015],
    'claude-3-5-sonnet-v2@20241022': [0.003, 0.015, 0.003, 0.015],

    'gpt-4o': [0.005, 0.015, 0.005, 0.015],
    'meta/llama3-405b-instruct-maas': [0.001, 0.015, 0.001, 0.015],
  };
  isCost = true;
  showThreadList = true;

  aloneTeam!: Team;
  defaultProject!: Project;
  sortType: number = 1;

  selectedProject!: Project;
  projectList: Project[] = [];
  teamMap: { [key: string]: Team } = {};
  isGoogleSearch = false;
  showInfo = true;

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
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  readonly ngZone: NgZone = inject(NgZone);
  placeholder = '';
  defaultPlaceholder = 'メッセージを入力...。Shift+Enterで改行。Ctrl+Enterで送信。Drag＆Drop、ファイル貼り付け。';
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

  routerChangeHandler(): void {
    this.activatedRoute.params.subscribe(params => {
      const { projectId, threadId } = params as { projectId: string, threadId: string };
      const project = this.projectList.find(project => project.id === projectId);
      if (this.selectedProject === project) {
        if (this.selectedThread?.id === threadId) {
          // なんもしない。
        } else {
          this.threadChangeHandler(project, this.threadList, threadId);
        }
      } else {
        if (project) {
          this.loadThreads(project).subscribe(
            threadList => {
              this.threadChangeHandler(project, threadList, threadId);
            }
          );
        } else {
          // guardが掛かってるのでnullになることはないはず。。
        }
      }
    });
  }

  threadChangeHandler(project: Project, threadList: Thread[], threadId: string): void {
    if (threadId === 'new-thread') {
      this.selectedProject = project;
      this.clearInDto();
      // home->chat経由で初期値指定されているときは初期値入れる。
      if (this.g.share['home->chat'] && this.g.share['home->chat'].static) {
        const args = this.g.share['home->chat'];
        this.messageList[0].contents[0].text = args.static.systemPrompt;
        this.placeholder = args.static.placeholder;
        this.inDto.args.model = args.model || this.inDto.args.model;
        this.isGoogleSearch = (args.tools as { googleSearchRetrieval: any }[] || []).find(tool => tool.googleSearchRetrieval) ? true : false;
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
          } else {
            this.send();
          }
        } else {
        }
        this.g.share['home->chat'] = {}; // 消す
      } else if (this.g.share['mattermost->chat'] && this.g.share['mattermost->chat'].contents) {
        const contents = this.g.share['mattermost->chat'].contents as ChatCompletionContentPart[];
        this.messageList[0].contents[0].text = 'チャットを要約してください。';
        safeForkJoin<ChatCompletionContentPart | FileEntity>(contents.map(content => {
          if (content.type === 'text') {
            return of(content);
          } else {
            return this.fileManagerService.uploadFiles({
              projectId: this.selectedProject.id, contents: [
                { filePath: content.image_url.label || '', base64Data: content.image_url.url }
              ]
            }).pipe(map(ret => ret.results[0]));
          }
        })).subscribe(retList => {
          const messageGroup = this.messageService.initMessageUpsertDto(
            threadId, {
            role: this.inputArea.role,
            previousMessageId: this.messageGroupListAll[this.messageGroupListAll.length - 1].id,
          });

          this.messageGroupListAll.push(messageGroup);
          this.messageGroupMap[messageGroup.id] = messageGroup;
          // 新規メッセージグループを作る
          this.inputArea.previousMessageId = messageGroup.id;
          // 先頭10個分のチャットからラベル起こし。
          const label = contents.map(content => content.type === 'text' ? content.text : '').filter((_, i) => i < 10).join('\n').substring(0, 250);
          const message: MessageForView = this.messageService.initMessage(messageGroup.id);
          message.label = label;

          messageGroup.messages.push(message);
          this.messageList.push(message);
          this.messageMap[message.id] = message;

          retList.forEach(ret => {
            const contentPart = this.messageService.initContentPart(message.id);
            if ('type' in ret && ret.type === 'text') {
              contentPart.text = ret.text;
            } else {
              // ret
              const file = ret as any as FileEntity;
              contentPart.type = ContentPartType.File;
              contentPart.text = file.filePath;
              contentPart.fileId = file.id;
            }
          });
          this.saveAndBuildThread().subscribe({
            next: next => this.onChange()
          });
        });
        this.g.share['mattermost->chat'] = {}; // 消す
      }
      this.cdr.detectChanges();
    } else {
      if (this.selectedThread && this.selectedThread.id === threadId) {
      } else {
        // デフォルト系のロード完了。スレッドがあればそれを選択
        const thread = threadList.find(thread => thread.id === threadId);
        if (thread) {
          this.selectedProject = project;
          this.selectThread(project.id, thread).subscribe({
            next: next => {
              // cdrを書けないとエラーになる。複雑になり過ぎた。。
              this.cdr.detectChanges();
            }
          });
        } else {
          this.selectedProject = project;
          this.clearInDto();
          this.cdr.detectChanges();
        }
      }
    }
  }

  sortThread(threadList: Thread[]): void {
    // 本来はlastUpdateでソートしたかったが、何故か時刻が更新されていないので。
    if (this.sortType === 1) {
      // 時刻順（新しい方が上に来る）
      threadList.sort((a, b) => b.updatedAt < a.updatedAt ? -1 : 1);
    } else {
      // 名前順（Aが上に来る）
      threadList.sort((a, b) => b.title < a.title ? 1 : -1);
    }
  }

  cacheMap: { [key: string]: CachedContent } = {};
  loadThreads(project: Project): Observable<Thread[]> {
    return this.threadService.getThreadList(project.id).pipe(tap(threadList => {
      this.threadList = threadList;
      this.threadList.forEach(thread => {
        if (thread.inDto.args.cachedContent) {
          this.cacheMap[thread.id] = thread.inDto.args.cachedContent;
        } else { };
      });
      this.sortThread(this.threadList);
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
        this.teamMap = teamList.reduce((prev, curr) => {
          prev[curr.id] = curr;
          return prev;
        }, {} as { [key: string]: Team });
      })
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

  export(threadIndex: number): void {
    if (threadIndex < 0) {
      this.dbService.getAll('threadList').subscribe(obj => {
        const text = JSON.stringify(obj);
        const blob = new Blob([text], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'threadList.json';
        a.click();
        window.URL.revokeObjectURL(url);
      });
    } else {
      const text = JSON.stringify(this.threadList[threadIndex]);
      const blob = new Blob([text], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thread-${threadIndex}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  }

  clearInDto(): void {
    this.selectedThread = undefined;
    this.inDto = this.initInDto();
    this.onChange();
    this.router.navigate(['chat', this.selectedProject.id, 'new-thread']);
    this.cdr.detectChanges();
    setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
  }

  initInDto(): ChatCompletionStreamInDto {
    const inDto = {
      args: Object.assign({
        // model: 'gemini-1.5-flash',
        model: 'gemini-1.5-pro',
        temperature: 0.7,
        top_p: 1,
        max_tokens: 8192,
        stream: true,
      }, JSON.parse(localStorage.getItem('settings-v1.0') || '{}')),
    };
    this.isGoogleSearch = (inDto.args as any).isGoogleSearch;

    this.messageGroupListAll = [this.generateInitialMessageGroup()];
    this.inputArea = this.generateInitalInputArea();
    this.initializeThread(this.messageGroupListAll);
    const lastMessage = this.getLatestMessage(this.messageGroupListAll);
    this.inputArea.previousMessageId = lastMessage.id;
    if (this.previousMessageIdMap[lastMessage.id]) {
      this.previousMessageIdMap[lastMessage.id].selectedIndex = this.previousMessageIdMap[lastMessage.id].messages.length;
      this.inputArea.messageGroupId = this.previousMessageIdMap[lastMessage.id].id;
    }
    this.rebuildMessageList();
    return inDto;
  }

  generateInitalInputArea(): ChatInputArea {
    return { role: 'user', content: [{ type: 'text', text: '' }], previousMessageId: '', messageGroupId: '' };
  }

  generateInitialMessageGroup(): MessageGroupResponseDto {
    const defaultSystemPrompt = 'アシスタントAI';
    const defaultRole = 'system';

    const messageGroup = this.messageService.initMessageUpsertDto(this.selectedThread?.id || '');

    const message = this.messageService.initMessage(messageGroup.id);
    message.label = defaultSystemPrompt.substring(0, 250);

    const contentPart = this.messageService.initContentPart(message.id);
    contentPart.text = defaultSystemPrompt;

    messageGroup.role = defaultRole;
    messageGroup.label = message.label;

    message.contents.push(contentPart);
    messageGroup.messages.push(message);
    return messageGroup;
  }

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

  editNameThreadId: string = '';

  calcCost(): number {
    const charCount = (this.tokenObj.text + this.tokenObj.image + this.tokenObj.audio + this.tokenObj.video);
    const isLarge = this.tokenObj.totalTokens > 128000 ? 2 : 0;
    const cost = charCount / 1000 * this.priceMap[this.inDto.args.model || 'gemini-1.5-pro'][isLarge];
    return cost;
  }

  getLatestMessage(messageGroups: MessageGroupResponseDto[]): MessageForView {
    let latestMessage: MessageForView | undefined = undefined;
    let latestDate: Date | undefined = undefined;
    let latestSeq: number | undefined = undefined;
    for (const group of messageGroups) {
      for (const message of group.messages) {
        const messageDate = new Date(message.lastUpdate);
        if (!latestDate || messageDate > latestDate) {
          latestDate = messageDate;
          latestMessage = message;
        }
        // const messageSeq = message.seq;
        // if (!latestSeq || messageSeq > latestSeq) {
        //   latestSeq = messageSeq;
        //   latestMessage = message;
        // }
      }
    }
    // エラー
    if (latestMessage) { } else { throw Error('Message not found'); }
    return latestMessage;
  }

  selectLatest(messageGroup: MessageGroupResponseDto): number {
    const ary = messageGroup.messages;
    if (ary.length === 0) {
      // throw new Error("Array is empty");
      messageGroup.selectedIndex = 0;
      return 0;
    }
    let latestIndex = 0;
    // updateだと途中でキャッシュ作ると逆転するのでcreateを使う。
    let latestDate = ary[0].createdAt;
    for (let i = 1; i < ary.length; i++) {
      if (ary[i].createdAt > latestDate) {
        latestDate = ary[i].createdAt;
        latestIndex = i;
      }
    }
    messageGroup.selectedIndex = latestIndex;
    return latestIndex;
  }

  rootMessageGroup!: MessageGroupResponseDto;
  previousMessageIdMap: Record<UUID, MessageGroupResponseDto> = {};
  initializeThread(messageGroups: MessageGroupResponseDto[]): void {
    this.messageGroupListAll = messageGroups;

    // MessageGroupResponseDto の selectedIndex を設定する
    messageGroups.forEach(this.selectLatest);

    // previoudMessageId（一個前のメッセージID）が無いもをRootとして取り出しておく。
    const rootMessageGroup = messageGroups.find(messageGroup => !messageGroup.previousMessageId);
    if (rootMessageGroup) {
      this.rootMessageGroup = rootMessageGroup;
    } else {
      throw new Error('Root not found');
    }

    // ID, MessageForView のモデル化
    this.messageMap = messageGroups.reduce((prev, curr) => {
      curr.messages.forEach(message => prev[message.id] = message);
      return prev;
    }, {} as Record<UUID, MessageForView>);

    // ID, MessageGroupResponseDto のモデル化
    this.messageGroupMap = messageGroups.reduce((prev, curr) => {
      prev[curr.id] = curr;
      return prev;
    }, {} as Record<UUID, MessageGroupResponseDto>);

    // ツリーを作る
    this.previousMessageIdMap = messageGroups.reduce((prev, curr) => {
      if (curr.previousMessageId) {
        if (prev[curr.previousMessageId]) {
          // ツリー構造としてmessagePreviousIDが被るのはおかしい。分岐はmessageGroupで行われるべきであって。
          // throw Error('Model error');
          // おかしいけどなってしまったものは仕方ないのでそのまま動かす。
          // TODO 後でモデル側も更新するようにする。
          curr.messages.unshift(...prev[curr.previousMessageId].messages);
          curr.selectedIndex = curr.messages.length - 1;
          console.log(`curr.selectedIndex=${curr.selectedIndex}`);
          prev[curr.previousMessageId] = curr;
        } else {
          prev[curr.previousMessageId] = curr;
        }
      } else { /** rootは無視 */ }
      return prev;
    }, {} as Record<UUID, MessageGroupResponseDto>);
  }

  rebuildMessageList(): void {
    // 表示するメッセージ一覧
    this.messageList = [];
    if (this.rootMessageGroup.messages[this.rootMessageGroup.selectedIndex]) {
      // 先頭にルートを設定
      this.messageList.push(this.rootMessageGroup.messages[this.rootMessageGroup.selectedIndex]);
    } else {
      return;
    }
    while (true) {
      const message = this.messageList[this.messageList.length - 1];
      // 先行後続マップ
      const messageGroup = this.previousMessageIdMap[message.id];
      if (messageGroup) {
        // inputAreaに相当する場合はselectedIndexがOutOfBoundしてるのでselectedMessageがnullになるはず。
        const selectedMessage = messageGroup.messages[messageGroup.selectedIndex];
        if (selectedMessage) {
          // 選択メッセージリスト
          this.messageList.push(selectedMessage);
        } else {
          // 選択メッセージが無い = inputAreaなので打ち止め
          break;
        }
      } else {
        break;
      }
    }

    // TODO inputAreaの更新。こここんな無理矢理だった微妙。。。他で包括的にやらなくていいんだっけ？
    this.inputArea.previousMessageId = this.messageList[this.messageList.length - 1].id;

    // キャッシュ有無判定
    if (!this.inDto
      || !this.inDto.args.cachedContent
      || (this.inDto.args.cachedContent && new Date(this.inDto.args.cachedContent.expireTime) < new Date())) {
      // キャッシュ有効期限が切れているのでキャッシュを消しておく。
      this.messageList.forEach(message => message.cacheId = undefined);
    }
  }

  saveMessage(threadId: string, message: MessageForView): Observable<MessageUpsertResponseDto> {
    let messageGroup = this.messageGroupMap[message.messageGroupId];
    // if (messageGroup) {
    // } else {
    //   messageGroup = { id: '', previousMessageId: '', } as any;
    // }
    return this.messageService.upsertMessageWithContents(threadId, {
      messageClusterId: messageGroup.messageClusterId,
      messageClusterType: messageGroup.messageClusterType || MessageClusterType.Single, // TODO 今nullになってしまうとエラーになるので。。。
      messageGroupId: messageGroup.id,
      messageId: message.id,
      previousMessageId: messageGroup.previousMessageId,
      role: messageGroup.role,
      label: message.label,
      messageGroupType: messageGroup.messageGroupType || MessageGroupType.Single,
      contents: message.contents,
    }).pipe(tap({
      next: next => {
        if (message.id && message.id.startsWith('dummy-')) {
          // IDが附番されたのでモデル更新しておく
          this.messageMap[next.message.id] = this.messageMap[message.id];
          delete this.messageMap[message.id]

          // contentのIDも附番する。でも中身はもとからあるのやらない。
          message.contents.forEach((content, index) => content.id = next.contentParts[index].id);

          // dummyを参照していた人々の更新
          if (this.previousMessageIdMap[message.id]) {
            this.previousMessageIdMap[next.message.id] = this.previousMessageIdMap[message.id];
            this.previousMessageIdMap[next.message.id].previousMessageId = next.message.id;
            delete this.previousMessageIdMap[message.id]
          }

          // dummyを参照していた人々の更新
          if (this.inputArea.previousMessageId === message.id) {
            this.inputArea.previousMessageId = next.message.id;
          }

        } else {/** dummy以外のものは画面側オブジェクトが最新なので反映する必要はない。 */ }
        if (message.messageGroupId && message.messageGroupId.startsWith('dummy-')) {
          // IDが附番されたのでモデル更新しておく
          this.messageGroupMap[next.messageGroup.id] = this.messageGroupMap[messageGroup.id];
          delete this.messageGroupMap[messageGroup.id]

          // 子供の更新
          messageGroup.messages.forEach(message => message.messageGroupId = next.messageGroup.id);

        } else {/** dummy以外のものは画面側オブジェクトが最新なので反映する必要はない。 */ }

        // id 発番されてないやつもいるので上書き
        message.id = next.message.id;
        messageGroup.id = next.messageGroup.id;
      }
    }));
  }

  isLock = false;
  selectedDanmen: string = '';
  selectThread(projectId: string, thread: Thread): Observable<any> {
    // 既存スレッド選択中に別スレッドを選択した場合、前回まで選択していたスレッドを保存する。（フォーカス外れたタイミングで保存する感じ）
    // if (location.pathname.endsWith(thread.id)) {
    // } else {
    //   return of(null);
    // }
    this.router.navigate(['chat', projectId, thread.id]);
    const beforeSelectedThread = this.selectedThread;
    // 選択中スレッドを変更
    this.selectedThread = thread;
    this.inDto = thread.inDto;

    this.isGoogleSearch = ((thread.inDto.args as any).tools as { googleSearchRetrieval: any }[] || []).find(tool => tool.googleSearchRetrieval) ? true : false;

    // TODO DANGER 何か良からぬことが起きている。selectedThreadが書き換わるはずないのに書き換わってしまうので仕方なくthreadListと切り離す。しかもこれが起きるのは本番モードだけという、、、
    // this.selectedThread = JSON.parse(JSON.stringify(thread));

    this.cdr.detectChanges();
    return safeForkJoin([
      (beforeSelectedThread && thread !== beforeSelectedThread && this.selectedDanmen !== JSON.stringify(beforeSelectedThread))
        ? this.save(this.selectedThread)
        : of(this.selectedThread),
      this.messageService.getMessageGroupList(thread.id).pipe(
        tap(resDto => {
          this.selectedDanmen = JSON.stringify(this.selectedThread);
          // スレッド初期化
          this.initializeThread(resDto.messageGroups);
          const lastMessage = this.getLatestMessage(resDto.messageGroups);
          this.inputArea.previousMessageId = lastMessage.id;
          if (this.previousMessageIdMap[lastMessage.id]) {
            this.previousMessageIdMap[lastMessage.id].selectedIndex = this.previousMessageIdMap[lastMessage.id].messages.length;
            this.inputArea.messageGroupId = this.previousMessageIdMap[lastMessage.id].id;
          }
          this.rebuildMessageList();
          this.onChange();

          // 5件以上だったら末尾2件を開く。5件未満だったら全部開く。
          this.allExpandCollapseFlag = this.messageList.length < 5;
        }),
        switchMap(resDto => safeForkJoin(
          this.messageList.slice().reverse()
            .filter(message => !message.id.startsWith('dummy-'))
            .filter((message, index) => index < (this.allExpandCollapseFlag ? 10 : 2))
            .map(message => this.messageService.getMessageContentParts(message))
        )),
        tap(tapRes => {

          // 実行中のメッセージがあったら復旧する
          Object.keys(this.messageMap).forEach(messageId => {
            const resDto = this.chatServce.getObserver(messageId);
            if (resDto && resDto.observer) {
              // 別ページから復帰した場合に再開する。
              const responseMessage = this.messageList[this.messageList.length - 1];
              responseMessage.contents[0].text = resDto.text;
              this.chatStreamSubscription = resDto.observer.subscribe(this.chatStreamHander(responseMessage));
            } else { }
          });

          // 一番下まで下げる
          setTimeout(() => { DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); }, 500);

          // this.router.navigate(['chat', this.selectedProject.id, thread.id], { relativeTo: this.activatedRoute });
          setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);

          document.title = `AI : ${this.selectedThread?.title || 'Ribbon UI'}`;
        }),
        map(ret => null)
      )
    ]);
  }

  save(thread?: Thread): Observable<Thread> {
    if (thread) {
      // isGoogleSearchの読み替え
      (this.inDto.args as any).tools = this.isGoogleSearch ? [{ googleSearchRetrieval: {} }] : [];

      // 選択中スレッドを保存
      const { title, description, visibility } = thread;
      return (thread.id && !thread.id.startsWith('dummy-') ? // idの有無で既存か新規か分ける
        this.threadService.updateThread(thread.id, { title, description, visibility, inDtoJson: JSON.stringify(thread.inDto) }) :
        this.threadService.createThread(this.selectedProject.id, { title, description, visibility, inDtoJson: JSON.stringify(thread.inDto) })
      );
    } else {
      // ここのロジックは変な気がする。threadがnullの時ってsendの時だけだが、そこでcreateさせるのが正しいのか？
      return this.threadService.createThread(this.selectedProject.id, { title: '　', description: '', visibility: ThreadVisibility.Team, inDtoJson: JSON.stringify(this.inDto) }).pipe(tap(thread => {
        this.selectedThread = thread;
        this.inDto = this.selectedThread.inDto;
        this.threadList.unshift(thread);
        this.sortThread(this.threadList);
      }));
    }
  }

  renameThread($event: Event, thread: Thread, flag: boolean, $index: number): void {
    if (flag) {
      this.editNameThreadId = thread.id;
      // 遅延でフォーカスさせる
      setTimeout(() => (document.getElementById(`thread-title-${$index}`) as HTMLInputElement)?.select(), 100);
    } else {
      this.editNameThreadId = '';
      thread.title = thread.title || 'No name';
      this.save(thread).subscribe();
    }
  }

  duplicate($event: MouseEvent, thread: Thread): void {
    this.dialog.open(DialogComponent, { data: { title: 'スレッド複製', message: `未実装です`, options: ['Close'] } });
    // これはサーバー側で実装した方が良いやつ。
    // // this.stopPropagation($event);
    // const dupli = JSON.parse(JSON.stringify(thread)) as Thread;
    // dupli.title = thread.title + '_copy';
    // this.threadList.push(dupli);
  }

  /**
   * スレッドを保存、メッセージの組み立て。
   * トリガとなるメッセージIDを配信。
   */
  saveAndBuildThread(): Observable<string> {
    // 初回送信なので、スレッドを作るところから動かす
    const thread = this.selectedThread
      ? this.save(this.selectedThread) // 二回目以降はメタパラメータを保存するだけ。
      : this.save(this.selectedThread).pipe( // 初回送信の場合は色々動かす。
        // selectedThreadに反映
        tap(thread => {
          this.selectedThread = thread;
          // URL切替
          this.router.navigate(['chat', this.selectedProject.id, thread.id]);
        }),
        // initialのメッセージオブジェクト群（主にシステムプロンプト）をDB登録
        switchMap(thread => {
          // 最初のリクエストをnullで初期化
          let previousResult: MessageUpsertResponseDto[] | undefined = undefined;
          // safeForkJoin(this.messageGroupListAll.map(group =>
          //   safeForkJoin(group.messages.map(message => this.saveMessage(thread.id, message)))
          // ))
          // 処理開始
          return from(this.messageGroupListAll.map((obj, idx) => ({ obj, idx }))).pipe(
            concatMap(({ obj, idx }) => {
              return of(null).pipe(
                concatMap(() => {
                  // 前のリクエストの結果を現在のリクエストに含める
                  if (idx > 0 && previousResult) {
                    obj.previousMessageId = previousResult[previousResult.length - 1].message.id;
                    this.previousMessageIdMap[obj.previousMessageId] = obj;
                  } else { }
                  return safeForkJoin(
                    obj.messages.map(message => this.saveMessage(thread.id, message))
                  ).pipe(
                    tap(res => {
                      // 現在の結果を保存して、次のリクエストで使用
                      previousResult = res;
                    })
                  );
                })
              );
            }),
            // 全てのリクエストの結果を配列として返す
            toArray(),
            tap(upsertResponseList => {
              // inputAreaのpreviousMessageIdを更新しておく。
              if (previousResult) {
                this.inputArea.previousMessageId = previousResult[previousResult.length - 1].message.id;
              } else { }
            }),
          );
        }),
        // 後続で使うようにthreadに戻しておく
        map(upsertResponseList => this.selectedThread as Thread),
      );
    return thread.pipe(
      tap(thread => {
        // 二回目以降だろうとタイトルが何も書かれていなかったら埋める。
        // タイトル自動設定ブロック
        if (thread.title && thread.title.trim() && thread.title !== '　') {
          // タイトルが設定済みだったら何もしない
        } else {
          // タイトルが無かったら入力分からタイトルを作る。この処理は待つ必要が無いので投げっ放し。
          const presetText = this.messageList.map(message => message.contents.filter(content => content.type === 'text').map(content => content.text)).join('\n');
          const inputText = this.inputArea.content.filter(content => content.type === 'text').map(content => content.text).join('\n');
          const mergeText = `${presetText}\n${inputText}`.substring(0, 1024);
          this.chatServce.chatCompletionObservableStreamNew({
            args: {
              max_tokens: 40,
              model: 'gemini-1.5-flash', messages: [
                { role: 'user', content: `この書き出しで始まるチャットにタイトルをつけてください。短く適当でいいです。タイトルだけを返してください。タイトル以外の説明などはつけてはいけません。\n\n\`\`\`markdown\n\n${mergeText}\n\`\`\`` } as any
              ]
            }
          }).subscribe({
            next: next => {
              next.observer.pipe(tap(text => thread.title += text), toArray()).subscribe({
                next: next => this.save(thread).subscribe()
              });
            },
          });
        }
      }),
      switchMap(thread => {
        // 入力エリアに何も書かれていない場合はスルーして直前のmessageIdを返す。
        if (this.inputArea.content[0].type === 'text' && this.inputArea.content[0].text) {
          const message = this.messageService.initMessage(this.inputArea.messageGroupId || '');
          message.label = this.inputArea.content.filter(content => content.type === 'text').map(content => content.text).join('\n').substring(0, 250);
          this.inputArea.content.forEach(content => {
            const contentPart = this.messageService.initContentPart(message.id);
            contentPart.type = content.type as ContentPartType;
            contentPart.text = content.text;
            contentPart.fileId = contentPart.type === 'file' ? (content as { fileId: string }).fileId : undefined;
            message.contents.push(contentPart);
          });

          if (this.inputArea.messageGroupId && this.messageGroupMap[this.inputArea.messageGroupId]) {
            // 既存グループへの追加
          } else {
            // 新規メッセージグループを作る
            const messageGroup = this.messageService.initMessageUpsertDto(thread.id, { role: this.inputArea.role, previousMessageId: this.inputArea.previousMessageId });
            this.messageGroupListAll.push(messageGroup);
            this.messageGroupMap[messageGroup.id] = messageGroup;
            if (messageGroup.previousMessageId) {
              this.previousMessageIdMap[messageGroup.previousMessageId] = messageGroup;
            } else { }
            // メッセージと紐づけ
            message.messageGroupId = messageGroup.id;
          }
          // this.inputArea.editing = 0;
          // inputAreaをDB保存。
          return this.saveMessage(thread.id, message).pipe(
            tap(upsertResponse => {
              // 
              this.messageGroupMap[upsertResponse.messageGroup.id].messages.push(upsertResponse.message);
              // 入力エリアをクリア
              this.inputArea = this.generateInitalInputArea();
              //再構成
              this.rebuildMessageList();
              setTimeout(() => {
                DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement); // 高さ調整
                DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
              }, 0);
            }),
            map(upsertResponse => upsertResponse.message.id),
          )
        } else {
          return of(this.messageList[this.messageList.length - 1].id); // 末尾にあるメッセージが発火トリガー
        }
      }),
      // 発射準備完了。発射トリガーとなるメッセージIDを返す。とりあえずログ出力もしておく。
      tap(messageId => console.log('Message ID before chat completion:', messageId)),
    );
  }

  setSelect(group: MessageGroupResponseDto, delta: number): void {
    group.selectedIndex += delta;
    this.rebuildMessageList();
    this.onChange();
  }

  changeModel(): void {
    if (this.inDto.args.model) {
      if (this.inDto.args.model.startsWith('claude-')) {
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${this.inDto.args.model} は海外リージョン（europe-west1:Belgium）を利用します。\n個人情報は絶対に入力しないでください。`, options: ['Close'] } });
      } else if (this.inDto.args.model.startsWith('meta/')) {
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${this.inDto.args.model} は海外リージョン（us-central1）を利用します。\n個人情報は絶対に入力しないでください。`, options: ['Close'] } });
      } else if (this.inDto.args.model.endsWith('-experimental')) {
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `${this.inDto.args.model} は海外リージョン（us-central1）を利用します。\n実験的なモデルのため結果が正確でない可能性があります。`, options: ['Close'] } });
      }
    } else { }
  }

  chatStreamSubscription?: Subscription;

  /**
   * 推論開始トリガーを引く
   */
  send(): void {
    // バリデーションエラー
    if (!this.inDto.args.model) {
      return;
    } else if (this.inDto.args.model.startsWith('gemini-1.0') && this.tokenObj.totalTokens > 32766) {
      this.snackBar.open(`トークンサイズオーバーです。 32,766以下にしてください。`, 'close', { duration: 3000 });
      return;
    } else if (this.inDto.args.model.startsWith('gpt-') && (this.inDto.args.max_tokens || 0) > 4096) {
      this.snackBar.open(`${this.inDto.args.model} の maxTokens は上限4,096です。`, 'close', { duration: 3000 });
      this.inDto.args.max_tokens = Math.min(this.inDto.args.max_tokens || 0, 4096);
      return;
    } else if (this.inDto.args.model.startsWith('meta/llama3') && (this.inDto.args.max_tokens || 0) > 4096) {
      this.snackBar.open(`${this.inDto.args.model} の maxTokens は上限4,096です。`, 'close', { duration: 3000 });
      this.inDto.args.max_tokens = Math.min(this.inDto.args.max_tokens || 0, 4096);
      return;
    } else if (this.messageGroupMap[this.messageList[this.messageList.length - 1].messageGroupId].role === 'assistant' && this.inputArea.content[0].text.length === 0) {
      if (this.inputArea.content.length > 1) {
        this.snackBar.open(`ファイルだけでは送信できません。何かメッセージを入力してください。`, 'close', { duration: 3000 });
      } else {
        this.snackBar.open(`メッセージを入力してください。`, 'close', { duration: 3000 });
      }
      return;
    } else if (this.isGoogleSearch && !this.inDto.args.model.startsWith('gemini-1.5')) {
      this.snackBar.open(`Google検索統合は Gemini-1.5 系統以外では使えません。`, 'close', { duration: 3000 });
      this.isGoogleSearch = false;
      return;
    } else {
    }

    // 継続系
    if (this.inDto.args.model.startsWith('claude-') && (this.inDto.args.temperature || 0) > 1) {
      this.snackBar.open(`claude はtempertureを0～1.0の範囲で使ってください。`, 'close', { duration: 3000 });
      this.inDto.args.temperature = 1;
    } else { }
    if ((this.messageList.length % 2) % 7 === 0 && this.tokenObj.totalTokens > 16384) {
      // 7問い合わせごとにアラート出す
      this.snackBar.open(`スレッド内のやり取りが長引いてきました。話題が変わった際は左上の「新規スレッド」から新規スレッドを始めることをお勧めします。\n（スレッドが長くなるとAIの回答精度が落ちていきます）`, 'close', { duration: 6000 });
    } else { }

    // this.isGoogleSearch = (args.tools as { googleSearchRetrieval: any }[] || []).find(tool => tool.googleSearchRetrieval) ? true : false;
    if (this.isGoogleSearch) {
      (this.inDto.args as any).tools = [{ googleSearchRetrieval: {} }];
    } else { }

    this.isLock = true;

    // 初回送信後はプレースホルダをデフォルトのものに戻す。
    this.placeholder = this.defaultPlaceholder;

    // キャッシュ使う場合はキャッシュ期限をcacheTtlInSecondsまで伸ばす
    if (this.selectedThread && this.inDto.args.cachedContent) {
      const expireTime = new Date(this.inDto.args.cachedContent.expireTime);
      const currentTime = new Date();
      const differenceInMilliseconds = expireTime.getTime() - currentTime.getTime();

      if (differenceInMilliseconds > this.cacheTtlInSeconds * 1000) {
        // If expire time is more than 10 minutes ahead, return it as is
      } else {
        // If expire time is within 10 minutes, update it to 10 minutes from now
        this.chatServce.updateCacheByProjectModel(this.selectedThread.id, { ttl: { seconds: this.cacheTtlInSeconds, nanos: 0 } }).subscribe({
          next: next => {
            // console.log(next);
            // キャッシュ更新はDB側で登録済みなのでこっちはinDtoに入れるだけにする。
            this.inDto.args.cachedContent = next;
          }
        });
      }
    } else { }

    // if (this.selectedThread) {
    //   this.selectedThread.inDto.args.cachedContent = this.cacheMap[this.selectedThread.id];
    // }
    // メッセージを組み立ててから末尾のmessageIdに火をつける。
    this.saveAndBuildThread().pipe(
      switchMap(messageId => this.chatServce.chatCompletionObservableStreamByProjectModel(messageId)),
    ).subscribe({
      next: resDto => {

        // 初回の戻りを受けてからメッセージリストにオブジェクトを追加する。こうしないとエラーの時にもメッセージが残ってしまう。
        let messageGroup = this.previousMessageIdMap[resDto.meta.messageGroup.previousMessageId || ''];
        if (messageGroup) {
        } else {
          // サーバー側で生成されたメッセージグループをこっちがわに構成する。
          messageGroup = resDto.meta.messageGroup;
          messageGroup.messages = messageGroup.messages || [];
          messageGroup.selectedIndex = 0;
          if (messageGroup.previousMessageId) {
            this.previousMessageIdMap[messageGroup.previousMessageId] = messageGroup;
          }
          this.messageGroupListAll.push(messageGroup);
          this.messageGroupMap[messageGroup.id] = messageGroup;
        }
        // レスポンス受け用オブジェクト
        const responseMessage = resDto.meta.message;

        messageGroup.messages.push(responseMessage);
        this.messageMap[responseMessage.id] = responseMessage;
        responseMessage.contents = resDto.meta.contentParts as any;

        // メッセージID紐づけ。
        this.inputArea.previousMessageId = resDto.meta.message.id;
        this.rebuildMessageList();

        // 入力ボックスのサイズを戻す。
        setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
        setTimeout(() => {
          DomUtils.scrollToBottomIfNeededSmooth(this.textBodyElem.nativeElement); // 下端にスクロール
        }, 100);

        this.chatStreamSubscription = resDto.observer.subscribe(this.chatStreamHander(responseMessage));
      },
      error: error => {
        this.chatErrorHandler(error);
      }
    });
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
        message.status = 1;
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
    this.chatStreamSubscription = undefined;
    this.isLock = false;
    message.status = 2;
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
    if (this.chatStreamSubscription) {
      this.isLock = false;
      setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
      this.chatStreamSubscription.unsubscribe();
    } else {
    }
    this.chatStreamSubscription = undefined;
  }

  saveSettingsAsDefault(): void {
    const settings = {
      model: this.inDto.args.model,
      temperature: this.inDto.args.temperature,
      max_tokens: this.inDto.args.max_tokens,
      isGoogleSearch: this.isGoogleSearch,
    };
    localStorage.setItem('settings-v1.0', JSON.stringify(settings));
  }

  private timeoutId: any;
  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ($event.shiftKey) {
        this.onChange();
      } else if ($event.ctrlKey) {
        this.send();
      } else {
        this.onChange();
      }
    } else {
      // 最後のキー入力から1000秒後にonChangeが動くようにする。1000秒経たずにここに来たら前回のタイマーをキャンセルする
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => this.onChange(), 1000);
    }
  }

  charCount = 0;
  tokenObj: CountTokensResponse = { totalTokens: 0, totalBillableCharacters: 0, text: 0, image: 0, audio: 0, video: 0 };
  onChange(): void {
    this.charCount = 0;
    this.tokenObj.totalTokens = -1;
    const messageList = this.messageList.filter(message => message.id.startsWith('dummy-') && !message.cacheId).map(message => ({
      role: this.messageGroupMap[message.messageGroupId].role,
      content: message.contents.map(content => ({
        type: content.type, text: content.text, fileId: content.fileId,
      }))
    })) as ChatInputArea[];
    messageList.push(this.inputArea);
    this.chatServce.countTokensByProjectModel(messageList, this.inputArea.previousMessageId?.startsWith('dummy-') ? '' : this.inputArea.previousMessageId).subscribe({
      next: next => this.tokenObj = next
    });
    // textareaの縦幅更新。遅延打ちにしないとvalueが更新されていない。
    this.textAreaElem && setTimeout(() => { DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement); }, 0);
  }

  contextCacheControl(thread?: Thread): void {
    if (thread || this.selectedThread) {
      // キャッシュがあれば削除する。
      if (this.inDto.args.cachedContent) {
        this.inDto.args.cachedContent = undefined;
        this.messageList.forEach(message => message.cacheId = undefined);
        if (thread) {
          this.chatServce.deleteCacheByProjectModel(thread.id).subscribe({
            next: next => {
              console.log(next);
              this.save(thread).subscribe({
                next: next => {
                  this.rebuildMessageList();
                  this.onChange();
                }
              });
            }
          });
        }
        return;
      } else { }
    } else {
      // スレッドナシの場合は継続
    }

    // 32768トークン以上ないとキャッシュ作成できない
    if (this.tokenObj.totalTokens < 32768) {
      this.dialog.open(DialogComponent, { data: { title: 'alert', message: `コンテキストキャッシュを作るには 32,768 トークン以上必要です。\n現在 ${this.tokenObj.totalTokens} トークンしかありません。`, options: ['Close'] } });
      return;
    } else if (!this.inDto.args.model?.endsWith('-001') && !this.inDto.args.model?.endsWith('-002')) {
      this.dialog.open(DialogComponent, { data: { title: 'alert', message: `コンテキストキャッシュは末尾が「-001」か「-002」となっているモデルでしか利用できません。\n -002系がおすすめです。`, options: ['Close'] } });
      return;
    } else if (this.messageList.length === 0 || (!this.messageList.find(message => this.messageGroupMap[message.messageGroupId].role === 'user' && message.contents.find(content => content.type === 'text')) && !this.inputArea.content[0].text.length)) {
      // ファイルだけだとダメ。テキスト入力が必須。
      this.dialog.open(DialogComponent, { data: { title: 'alert', message: `コンテキストキャッシュはファイルだけでは作成できません。短くても必ずテキストメッセージを入力してください。`, options: ['Close'] } });
      return;
    }

    this.isLock = true;
    this.saveAndBuildThread().pipe(switchMap(
      // トリガーを引く
      messageId => this.chatServce.createCacheByProjectModel(
        this.inDto.args.model || '', messageId,
        { ttl: { seconds: this.cacheTtlInSeconds, nanos: 0 } },
      )
    )).subscribe({
      next: next => {

        this.inDto.args.cachedContent = next;
        if (this.selectedThread) {
          // this.cacheMap[this.selectedThread.id] = next;
          // TODO DANGER selectedThreadとinDto.argsが不一致になっている。これは致命的によくなさそう。。
          this.selectedThread.inDto.args.cachedContent = next;
          this.inDto = this.selectedThread.inDto;
        }
        this.isLock = false;
        this.save(this.selectedThread).subscribe(next => {
          this.messageList.forEach(message => message.cacheId = next.id);
          this.rebuildMessageList();
          this.onChange();
          this.snackBar.open(`メッセージがキャッシュされました。`, 'close', { duration: 3000 });
        });
      },
      error: error => {
        this.snackBar.open(`ERROR: ${JSON.stringify(error)}`, 'close', { duration: 30000 });
        this.isLock = false;
      }
    });
  }

  // TODO ここは本来関数バインドでやるべきではない。1秒タイマーとかでやるべき。
  isCacheLive(thread?: Thread): boolean {
    if (thread) { } else { return false; }
    const cache = thread.inDto.args.cachedContent;
    const isLive = (cache && cache.expireTime && new Date(cache.expireTime) > new Date()) ? true : false;
    if (!isLive && cache) {
      if (thread) {
        // 時間経過でキャッシュが有効期限切れになったら消しておく。
        thread.inDto.args.cachedContent = undefined;
        thread.inDto.args.messages?.forEach(message => message.cacheId = undefined);
        // this.chatServce.deleteCacheByProjectModel(this.selectedThread.id).subscribe({
        //   next: next => {
        //     this.save(this.selectedThread).subscribe(next => {
        //       this.rebuildMessageList(this.messageGroupListAll);
        //       this.onChange();
        //     });
        //   }
        // });
      } else { }
    } else { }
    return isLive;
  }

  openThreadMenu(thread: Thread): void {
    this.dialog.open(ThreadDetailComponent, { data: { thread } });
  }

  toggleAllExpandCollapse(): void {
    this.allExpandCollapseFlag = !this.allExpandCollapseFlag;
    this.chatPanelList.forEach(chat => {
      if (this.allExpandCollapseFlag) {
        chat.exPanel.open();
      } else {
        chat.exPanel.close();
      }
    });
  }

  // TODO anyはダメ
  removeDoc(content: any[], $index: number): void {
    content[$index].id && this.messageService.deleteContentPart(content[$index].id).subscribe();
    content.splice($index, 1);
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.onChange(), 500);
  }

  removeMessage(message: MessageForView): void {
    // あえてOutOfBoundsさせる
    this.messageGroupMap[message.messageGroupId].selectedIndex = this.messageGroupMap[message.messageGroupId].messages.length;
    if (this.messageGroupMap[message.messageGroupId].role === 'user') {
      if (this.messageGroupMap[message.messageGroupId].previousMessageId && this.selectedThread) {
        const prevMessage = this.messageMap[this.messageGroupMap[message.messageGroupId].previousMessageId || ''];
        this.messageService.updateTimestamp(this.selectedThread.id, prevMessage).subscribe({
          next: next => {
            // メッセージのタイムスタンプを更新するだけ。
            message.updatedAt = next.updatedAt;
            this.inputArea.messageGroupId = this.messageGroupMap[message.messageGroupId].id;
            this.rebuildMessageList();
            this.onChange();
          },
          error: error => {
            this.snackBar.open(`エラーが起きて削除できませんでした。`, 'close', { duration: 3000 });
          }
        });
      }
    } else if (this.messageGroupMap[message.messageGroupId].role === 'assistant') {
      // assistantを削除するとはつまりリトライのこと
      this.rebuildMessageList();
      this.inputArea.content[0].text = '';
      this.send();
    } else if (this.messageGroupMap[message.messageGroupId].role === 'system') {
      // systemはchange相当
    }
  }

  editChat(resDto: MessageUpsertResponseDto): void {
    if (this.messageMap[resDto.message.id]) {
      // 既存メッセージそのままの場合。
    } else if (this.messageGroupMap[resDto.messageGroup.id]) {
      // 既存グループへの新メッセージ追加
      this.messageMap[resDto.message.id] = resDto.message;
      this.inputArea.previousMessageId = resDto.message.id;
      this.inputArea.messageGroupId = '';
      this.rebuildMessageList();
      this.textAreaElem.nativeElement.focus();
    } else {
      // 新規グループで新規メッセージ
      // ここはない？
    }
    this.onChange();
  }

  contentsDownload($event: MouseEvent, $index: number, thread: Thread): void {
    this.messageService.downloadContent(thread.id).subscribe({
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

  removeThread($event: MouseEvent, $index: number, thread: Thread): void {
    // this.stopPropagation($event);
    this.dialog.open(DialogComponent, { data: { title: 'スレッド削除', message: `このスレッドを削除しますか？\n「${thread.title.replace(/\n/g, '')}」`, options: ['削除', 'キャンセル'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 0) {
          this.threadService.deleteThread(thread.id).subscribe({
            next: next => {
              this.threadList.splice($index, 1)
              if (thread === this.selectedThread) {
                this.clearInDto()
              } else { }
              this.sortThread(this.threadList);
            }
          });
        } else { /** 削除キャンセル */ }
      }
    });
  }

  sendThreadToProject(project: Project, thread: Thread): void {

    const exec = (() => {
      this.threadService.moveThread(thread.id, project.id).subscribe({
        next: next => {
          // 選択中のスレッドを移動した場合は選択解除
          if (thread === this.selectedThread) { this.clearInDto(); }
          this.loadThreads(this.selectedProject).subscribe();
        },
        error: error => {
          this.snackBar.open(`更新エラーです。\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
        }
      });
    }).bind(this);

    // if (thread === this.selectedThread) {
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

  bulkRunSetting: {
    mode: 'serial' | 'parallel',
    promptTemplate: string,
    contents: ({ type: 'text', text: string } | { type: 'file', text: string, fileId: string })[]
  } = {
      mode: 'serial',
      promptTemplate: `ありがとうございます。\nでは次は"\${value}"をお願いします。`,
      contents: [],
    };
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
        this.send();
      }
    } else { }
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
