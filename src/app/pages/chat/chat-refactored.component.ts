// import { Component, OnInit, inject, viewChild, viewChildren, ElementRef } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule, ReactiveFormsModule } from '@angular/forms';
// import { ActivatedRoute, Router, RouterModule } from '@angular/router';
// import { BehaviorSubject, of, switchMap, tap, forkJoin, filter, map } from 'rxjs';

// // Material Modules
// import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
// import { MatIconModule } from '@angular/material/icon';
// import { MatButtonModule } from '@angular/material/button';
// import { MatFormFieldModule } from '@angular/material/form-field';
// import { MatInputModule } from '@angular/material/input';
// import { MatTooltipModule } from '@angular/material/tooltip';
// import { MatSliderModule } from '@angular/material/slider';
// import { MatMenuModule } from '@angular/material/menu';
// import { MatDialog, MatDialogModule } from '@angular/material/dialog';
// import { MatRadioModule } from '@angular/material/radio';
// import { MatSelectModule } from '@angular/material/select';
// import { MatDividerModule } from '@angular/material/divider';
// import { MatCheckboxModule } from '@angular/material/checkbox';
// import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
// import { MatTabsModule } from '@angular/material/tabs';
// import { MatBadgeModule } from '@angular/material/badge';
// import { ScrollingModule } from '@angular/cdk/scrolling';

// // Services
// import { AuthService } from '../../services/auth.service';
// import { ChatService, ChatInputArea, CountTokensResponseForView } from '../../services/chat.service';
// import { AIModelManagerService } from '../../services/model-manager.service';
// import { ExtApiProviderService } from '../../services/ext-api-provider.service';
// import { ProjectService, TeamService, ThreadService, MessageService } from '../../services/core';
// import { FileManagerService, FullPathFile } from '../../services/file-manager.service';
// import { UserService } from '../../services/user.service';
// import { GService } from '../../services/g.service';
// import { ToolCallService } from '../../services/tool-call.service';

// // Components
// import { ChatCoreComponent } from './components/chat-core/chat-core.component';
// import { ThreadManagementComponent } from './components/thread-management/thread-management.component';
// import { ToolIntegrationComponent } from './components/tool-integration/tool-integration.component';
// import { UIStateComponent } from './components/ui-state/ui-state.component';
// import { FileManagementComponent } from './components/file-management/file-management.component';
// import { ChatPanelMessageComponent } from '../../parts/chat-panel-message/chat-panel-message.component';
// import { ChatPanelSystemComponent } from '../../parts/chat-panel-system/chat-panel-system.component';
// import { AppMenuComponent } from '../../parts/app-menu/app-menu.component';
// import { UserMarkComponent } from '../../parts/user-mark/user-mark.component';
// import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';

// // Directives
// import { FileDropDirective } from '../../parts/file-drop.directive';

// // Models
// import {
//   ThreadGroupForView,
//   Project,
//   Team,
//   TeamForView,
//   Thread,
//   ProjectVisibility,
//   TeamType,
//   MessageForView
// } from '../../models/project-models';

// // Utils
// import { DomUtils, safeForkJoin } from '../../utils/dom-utils';

// declare var _paq: any;

// @Component({
//   selector: 'app-chat-refactored',
//   imports: [
//     CommonModule, FormsModule, ReactiveFormsModule, RouterModule, FileDropDirective, DocTagComponent,
//     MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
//     MatSliderModule, MatMenuModule, MatDialogModule, MatRadioModule, MatSelectModule,
//     MatSnackBarModule, MatDividerModule, MatCheckboxModule, MatProgressSpinnerModule,
//     MatBadgeModule, MatTabsModule, ScrollingModule,
//     UserMarkComponent, ChatPanelMessageComponent, ChatPanelSystemComponent, AppMenuComponent,
//     ChatCoreComponent, ThreadManagementComponent, ToolIntegrationComponent, UIStateComponent, FileManagementComponent
//   ],
//   templateUrl: './chat.component.html',
//   styleUrl: './chat.component.scss'
// })
// export class ChatRefactoredComponent implements OnInit {
//   // ViewChild references
//   readonly chatCoreComponent = viewChild(ChatCoreComponent);
//   readonly threadManagementComponent = viewChild(ThreadManagementComponent);
//   readonly toolIntegrationComponent = viewChild(ToolIntegrationComponent);
//   readonly uiStateComponent = viewChild(UIStateComponent);
//   readonly fileManagementComponent = viewChild(FileManagementComponent);
//   readonly textAreaElem = viewChild.required<ElementRef<HTMLTextAreaElement>>('textAreaElem');

//   // Core data
//   selectedThreadGroup$ = new BehaviorSubject<ThreadGroupForView>(null as any);
//   selectedThreadGroup!: ThreadGroupForView;
//   threadGroupList: ThreadGroupForView[] = [];
//   templateThreadGroupList: ThreadGroupForView[] = [];
  
//   selectedProject!: Project;
//   projectList: Project[] = [];
//   selectedTeam!: Team;
//   teamList: Team[] = [];
//   teamMap: { [key: string]: Team } = {};
//   teamForViewList: TeamForView[] = [];
  
//   inputArea: ChatInputArea = this.generateInitialInputArea();
//   messageGroupIdListMas: { [threadId: string]: string[] } = {};
  
//   // UI State
//   isLock = false;
//   isThreadGroupLoading = false;
//   threadLocks: { [threadId: string]: boolean } = {};
//   toolGroupStates: { [groupName: string]: boolean } = {};
//   toolGroupLoadingStates: { [groupName: string]: boolean } = {};
  
//   // Token counting
//   tokenCounting = false;
//   tokenObjList: CountTokensResponseForView[] = [];
//   tokenObjSummary: CountTokensResponseForView = {
//     id: 'Summary', totalTokens: 0, totalBillableCharacters: 0,
//     text: 0, image: 0, audio: 0, video: 0, cost: 0, model: 'Summary'
//   };
  
//   // UI State
//   allExpandCollapseFlag = true;
//   showThreadList = true;
//   showInfo = true;
//   linkChain: boolean[] = [true];
//   tabIndex = 0;

//   // Services
//   readonly authService = inject(AuthService);
//   readonly chatService = inject(ChatService);
//   readonly aiModelManagerService = inject(AIModelManagerService);
//   readonly extApiProviderService = inject(ExtApiProviderService);
//   readonly projectService = inject(ProjectService);
//   readonly teamService = inject(TeamService);
//   readonly threadService = inject(ThreadService);
//   readonly messageService = inject(MessageService);
//   readonly fileManagerService = inject(FileManagerService);
//   readonly userService = inject(UserService);
//   readonly toolCallService = inject(ToolCallService);
//   readonly g = inject(GService);
//   readonly dialog = inject(MatDialog);
//   readonly router = inject(Router);
//   readonly activatedRoute = inject(ActivatedRoute);
//   readonly snackBar = inject(MatSnackBar);

//   ngOnInit(): void {
//     this.initializeComponent();
//   }

//   private initializeComponent(): void {
//     document.title = 'AI';
    
//     // 初期化シーケンス
//     of(0).pipe(
//       switchMap(() => forkJoin([
//         this.loadTeams(),
//         this.aiModelManagerService.getAIModels(),
//         this.extApiProviderService.getApiProviders()
//       ])),
//       switchMap(() => this.loadProjects()),
//       switchMap(() => this.loadDefaultThreadGroup()),
//     ).subscribe(() => {
//       this.setupRouterHandler();
//     });

//     // テキストエリアの高さ調整タイマー
//     setInterval(() => {
//       const textAreaElem = this.textAreaElem();
//       if (textAreaElem?.nativeElement) {
//         DomUtils.textAreaHeighAdjust(textAreaElem.nativeElement);
//       }
//     }, 1000);
//   }

//   private setupRouterHandler(): void {
//     this.activatedRoute.params.subscribe(params => {
//       const { projectId, threadGroupId, tabIndex } = params as {
//         projectId: string, threadGroupId: string, tabIndex?: string
//       };
      
//       this.tabIndex = tabIndex ? parseInt(tabIndex) : 0;
//       const project = this.projectList.find(p => p.id === projectId);

//       if (this.selectedProject === project) {
//         if (this.selectedThreadGroup.id !== threadGroupId) {
//           this.handleThreadGroupChange(project, this.threadGroupList, threadGroupId);
//         }
//       } else if (project) {
//         this.handleProjectChange(project, threadGroupId);
//       }
//     });
//   }

//   // ==================== Event Handlers ====================

//   /**
//    * チャット送信
//    */
//   onSendChat(): void {
//     this.chatCoreComponent()?.sendChat('threadGroup', [], undefined).subscribe({
//       next: () => {
//         this.rebuildThreadGroup();
//         this.onChange();
//       },
//       error: (error) => {
//         console.error('Chat send error:', error);
//       }
//     });
//   }

//   /**
//    * ファイルドロップ処理
//    */
//   onFilesDropped(files: FullPathFile[]): void {
//     this.fileManagementComponent()?.onFilesDropped(files);
//   }

//   /**
//    * スレッドグループ選択
//    */
//   onThreadGroupSelected(threadGroup: ThreadGroupForView): void {
//     this.selectedThreadGroup = threadGroup;
//     this.selectedThreadGroup$.next(threadGroup);
//     this.router.navigate(['chat', threadGroup.projectId, threadGroup.id]);
//   }

//   /**
//    * ツールグループ状態変更
//    */
//   onToolGroupStateChanged(event: { groupName: string, enabled: boolean }): void {
//     this.toolGroupStates[event.groupName] = event.enabled;
//     this.rebuildThreadGroup();
//     this.onChange();
//   }

//   /**
//    * UI状態変更
//    */
//   onExpandCollapseToggled(expanded: boolean): void {
//     this.allExpandCollapseFlag = expanded;
//   }

//   /**
//    * ロック状態変更
//    */
//   onLockStateChanged(locked: boolean): void {
//     this.isLock = locked;
//   }

//   /**
//    * トークンカウント状態変更
//    */
//   onTokenCountingChanged(counting: boolean): void {
//     this.tokenCounting = counting;
//   }

//   // ==================== Core Methods ====================

//   private generateInitialInputArea(): ChatInputArea {
//     return { role: 'user', content: [{ type: 'text', text: '' }], messageGroupId: '' };
//   }

//   private loadTeams() {
//     return this.teamService.getTeamList().pipe(
//       tap(teamList => {
//         this.teamList = teamList;
//         this.teamMap = Object.fromEntries(teamList.map(team => [team.id, team]));
//       })
//     );
//   }

//   private loadProjects() {
//     return this.projectService.getProjectList().pipe(
//       tap(projectList => {
//         this.projectList = projectList;
//         this.buildTeamForViewList(projectList);
//       })
//     );
//   }

//   private loadDefaultThreadGroup() {
//     const defaultProject = this.projectList.find(p => p.visibility === ProjectVisibility.Default);
//     if (!defaultProject) return of([]);

//     return this.threadService.getThreadGroupList(defaultProject.id).pipe(
//       map(threadGroupList => threadGroupList.filter(tg => tg.type === 'Default')),
//       tap(defaultThreadGroups => {
//         // デフォルトスレッドグループの処理
//       })
//     );
//   }

//   private handleProjectChange(project: Project, threadGroupId: string): void {
//     this.selectedTeam = this.teamMap[project.teamId];
//     this.selectedProject = project;
//     this.isThreadGroupLoading = true;

//     this.threadManagementComponent()?.loadThreadGroups(project).subscribe({
//       next: (threadGroupList) => {
//         this.isThreadGroupLoading = false;
//         this.threadGroupList = threadGroupList;
//         this.handleThreadGroupChange(project, threadGroupList, threadGroupId);
//       },
//       error: (error) => {
//         this.isThreadGroupLoading = false;
//         console.error(error);
//       }
//     });
//   }

//   private handleThreadGroupChange(project: Project, threadGroupList: ThreadGroupForView[], threadGroupId: string): void {
//     if (threadGroupId === 'new-thread') {
//       this.createNewThread();
//     } else {
//       const threadGroup = threadGroupList.find(tg => tg.id === threadGroupId);
//       if (threadGroup) {
//         this.loadExistingThread(threadGroup);
//       } else {
//         this.clear();
//       }
//     }
//   }

//   private createNewThread(): void {
//     this.messageService.clear();
//     this.selectedThreadGroup = this.threadService.genInitialThreadGroupEntity(this.selectedProject.id);
    
//     // システムプロンプトの追加
//     this.selectedThreadGroup.threadList.forEach((thread, index) => {
//       const contentPart = this.messageService.initContentPart(
//         'dummy-contentPart-' + Date.now() + '-' + Math.random(),
//         this.getDefaultSystemPrompt(index)
//       );
//       this.messageService.addSingleMessageGroupDry(thread.id, undefined, 'system', [contentPart]);
//     });

//     this.rebuildThreadGroup();
//     this.toolIntegrationComponent()?.initializeToolGroupStates();
//     this.inputArea = this.generateInitialInputArea();

//     setTimeout(() => this.textAreaElem().nativeElement.focus(), 100);
//     document.title = 'AI: new thread';
//   }

//   private loadExistingThread(threadGroup: ThreadGroupForView): void {
//     this.selectedThreadGroup = threadGroup;
//     this.isThreadGroupLoading = true;

//     this.messageService.loadAndInitThreadGroup(threadGroup.id).pipe(
//       tap(() => {
//         this.rebuildThreadGroup();
//         this.toolIntegrationComponent()?.initializeToolGroupStates();
//         this.isThreadGroupLoading = false;
        
//         setTimeout(() => this.textAreaElem().nativeElement.focus(), 100);
//         document.title = `AI : ${threadGroup.title || '(no title)'}`;
//       })
//     ).subscribe({
//       error: (error) => {
//         this.isThreadGroupLoading = false;
//         console.error(error);
//       }
//     });
//   }

//   private rebuildThreadGroup(): { [threadId: string]: string[] } {
//     this.messageGroupIdListMas = this.messageService.rebuildThreadGroup(
//       this.messageService.messageGroupMas
//     );
//     return this.messageGroupIdListMas;
//   }

//   private buildTeamForViewList(projectList: Project[]): void {
//     const tmpTeamMap: { [teamId: string]: TeamForView } = {};
//     this.teamForViewList = [];
    
//     projectList.forEach(project => {
//       const team = tmpTeamMap[project.teamId];
//       if (team) {
//         team.projects.push(project);
//       } else {
//         tmpTeamMap[project.teamId] = this.teamMap[project.teamId] as TeamForView;
//         tmpTeamMap[project.teamId].projects = [project];
//         this.teamForViewList.push(tmpTeamMap[project.teamId]);
//       }
//     });
//   }

//   private getDefaultSystemPrompt(index: number): string {
//     return this.chatService.defaultSystemPrompt || 'You are a helpful assistant.';
//   }

//   private onChange(): void {
//     // トークンカウント処理を FileManagementComponent に委譲
//     this.tokenCounting = true;
    
//     safeForkJoin(this.selectedThreadGroup.threadList.map(thread => {
//       const inDto: ChatInputArea[] = [];
//       let tailMessageGroupId = '';
      
//       this.messageGroupIdListMas[thread.id].forEach(messageGroupId => {
//         const messageGroup = this.messageService.messageGroupMas[messageGroupId];
//         if (messageGroupId.startsWith('dummy-') && messageGroup?.messages) {
//           messageGroup.messages.forEach(message => {
//             inDto.push({
//               role: messageGroup.role,
//               messageGroupId: messageGroup.id,
//               content: message.contents.filter(content => content.text).map(content => ({
//                 type: content.type,
//                 text: content.text,
//                 linkId: content.linkId,
//               })),
//             });
//           });
//         } else {
//           tailMessageGroupId = messageGroupId;
//         }
//       });
      
//       if (this.inputArea.content[0].text || this.inputArea.content.length > 1) {
//         inDto.push(this.inputArea);
//       }
      
//       return this.chatService.countTokensByProjectModel(inDto, 'messageGroup', tailMessageGroupId);
//     })).subscribe({
//       next: (results) => {
//         this.processTokenCountResults(results);
//         this.tokenCounting = false;
//       }
//     });

//     // テキストエリアの高さ調整
//     setTimeout(() => {
//       const textArea = this.textAreaElem();
//       if (textArea) {
//         DomUtils.textAreaHeighAdjust(textArea.nativeElement);
//       }
//     }, 0);
//   }

//   private processTokenCountResults(results: any[]): void {
//     this.tokenObjSummary = {
//       id: 'Summary', totalTokens: 0, totalBillableCharacters: 0,
//       text: 0, image: 0, audio: 0, video: 0, cost: 0, model: 'Summary'
//     };
//     this.tokenObjList = [];

//     results.forEach((res, index) => {
//       const modelType = this.selectedThreadGroup.threadList[index].inDto.args.model.startsWith('gemini-') 
//         ? 'gemini-1.5-flash' 
//         : 'gpt-4o';
      
//       const tokenObj: CountTokensResponseForView = {
//         id: this.selectedThreadGroup.threadList[index].id,
//         totalTokens: 0, totalBillableCharacters: 0,
//         text: 0, image: 0, audio: 0, video: 0, cost: 0,
//         model: this.selectedThreadGroup.threadList[index].inDto.args.model
//       };

//       const countedTokenObj = res[0][modelType] || {
//         totalTokens: 0, totalBillableCharacters: 0,
//         text: 0, image: 0, audio: 0, video: 0
//       };

//       Object.assign(tokenObj, countedTokenObj);
//       tokenObj.cost = this.calcCost(tokenObj);
//       this.tokenObjList.push(tokenObj);

//       // サマリーに加算
//       this.tokenObjSummary.totalTokens += tokenObj.totalTokens;
//       this.tokenObjSummary.totalBillableCharacters! += tokenObj.totalBillableCharacters || 0;
//       this.tokenObjSummary.text += tokenObj.text;
//       this.tokenObjSummary.image += tokenObj.image;
//       this.tokenObjSummary.audio += tokenObj.audio;
//       this.tokenObjSummary.video += tokenObj.video;
//       this.tokenObjSummary.cost += tokenObj.cost;
//     });
//   }

//   private calcCost(tokenObject: CountTokensResponseForView): number {
//     const model = tokenObject.model;
//     const modelInfo = this.aiModelManagerService.modelMap[model];
    
//     if (!modelInfo) {
//       console.warn(`Model ${model} not found in modelMap.`);
//       return 0;
//     }

//     if (model.startsWith('gemini-1.5')) {
//       const charCount = (tokenObject.text + tokenObject.image + tokenObject.audio + tokenObject.video) 
//         || tokenObject.totalBillableCharacters || 0;
//       const isLarge = tokenObject.totalTokens > 128_000 ? 2 : 1;
//       return charCount / 1_000_000 * modelInfo.pricingHistory[0].inputPricePerUnit * isLarge;
//     } else if (model.startsWith('gemini-2')) {
//       const tokenCount = (tokenObject.text + tokenObject.image + tokenObject.audio + tokenObject.video) 
//         || tokenObject.totalTokens;
//       const isLarge = tokenObject.totalTokens > 200_000 ? 2 : 1;
//       return tokenCount / 1_000_000 * modelInfo.pricingHistory[0].inputPricePerUnit * isLarge;
//     } else {
//       const tokenCount = (tokenObject.text + tokenObject.image + tokenObject.audio + tokenObject.video) 
//         || tokenObject.totalTokens;
//       return tokenCount / 1_000_000 * modelInfo.pricingHistory[0].inputPricePerUnit;
//     }
//   }

//   private clear(): void {
//     this.messageService.clear();
//     this.handleThreadGroupChange(this.selectedProject, this.threadGroupList, 'new-thread');
//     this.router.navigate(['/chat', this.selectedProject.id, 'new-thread']);
//   }

//   // ==================== Keyboard Events ====================

//   onKeyDown(event: KeyboardEvent): void {
//     if (event.key === 'Enter') {
//       if (event.shiftKey) {
//         this.onChange();
//       } else if ((this.userService.enterMode === 'Ctrl+Enter' && event.ctrlKey) || 
//                  this.userService.enterMode === 'Enter') {
//         this.onSendChat();
//       } else {
//         this.onChange();
//       }
//     } else {
//       // デバウンス処理
//       clearTimeout(this.changeTimeoutId);
//       this.changeTimeoutId = setTimeout(() => this.onChange(), 1000);
//     }
//   }

//   private changeTimeoutId: any;
// }