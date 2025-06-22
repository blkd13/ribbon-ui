import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Observable, BehaviorSubject, of, switchMap, tap, catchError, map } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';

import { ThreadService, ProjectService, MessageService } from '../../../../services/core';
import { AuthService } from '../../../../services/auth.service';
import { DialogComponent } from '../../../../parts/dialog/dialog.component';
import { SaveThreadDialogComponent, SaveThreadData } from '../../../../parts/save-thread-dialog/save-thread-dialog.component';
import { Utils } from '../../../../utils';
import { safeForkJoin } from '../../../../utils/dom-utils';

import {
  Thread,
  ThreadGroup,
  ThreadGroupForView,
  ThreadGroupType,
  ThreadGroupVisibility,
  Project,
  MessageGroupForView,
  ProjectVisibility
} from '../../../../models/project-models';

@Component({
  selector: 'app-thread-management',
  template: `<!-- Template will be extracted from main component -->`,
  standalone: true
})
export class ThreadManagementComponent {
  @Input() selectedProject!: Project;
  @Input() threadGroupList: ThreadGroupForView[] = [];
  @Input() templateThreadGroupList: ThreadGroupForView[] = [];
  @Input() selectedThreadGroup$ = new BehaviorSubject<ThreadGroupForView>(null as any);
  
  @Output() threadGroupSelected = new EventEmitter<ThreadGroupForView>();
  @Output() threadGroupListUpdated = new EventEmitter<ThreadGroupForView[]>();
  @Output() templateListUpdated = new EventEmitter<ThreadGroupForView[]>();
  @Output() newThreadCreated = new EventEmitter<ThreadGroupForView>();

  readonly threadService = inject(ThreadService);
  readonly projectService = inject(ProjectService);
  readonly messageService = inject(MessageService);
  readonly authService = inject(AuthService);
  readonly dialog = inject(MatDialog);
  readonly snackBar = inject(MatSnackBar);
  readonly router = inject(Router);
  readonly activatedRoute = inject(ActivatedRoute);

  /**
   * スレッドグループリストの読み込み
   */
  loadThreadGroups(project: Project): Observable<ThreadGroupForView[]> {
    return this.threadService.getThreadGroupList(project.id).pipe(
      tap(threadGroupList => {
        // ノーマルスレッドグループとテンプレートを分離
        const normalThreadGroups = threadGroupList.filter(tg => tg.type === ThreadGroupType.Normal);
        const templateThreadGroups = threadGroupList.filter(tg => tg.type === ThreadGroupType.Template)
          .sort((a, b) => a.title.localeCompare(b.title));

        this.threadGroupList = normalThreadGroups;
        this.templateThreadGroupList = templateThreadGroups;
        
        this.threadGroupListUpdated.emit(this.threadGroupList);
        this.templateListUpdated.emit(this.templateThreadGroupList);
      })
    );
  }

  /**
   * 新規スレッドグループ作成
   */
  createNewThreadGroup(): Observable<ThreadGroupForView> {
    const newThreadGroup = this.threadService.genInitialThreadGroupEntity(this.selectedProject.id);
    
    return this.threadService.upsertThreadGroup(this.selectedProject.id, {
      title: '',
      description: '',
      visibility: ThreadGroupVisibility.Team,
      threadList: newThreadGroup.threadList
    }).pipe(
      tap(threadGroup => {
        this.threadGroupList.unshift(threadGroup);
        this.threadGroupListUpdated.emit(this.threadGroupList);
        this.newThreadCreated.emit(threadGroup);
      })
    );
  }

  /**
   * スレッドグループのクローン
   */
  cloneThreadGroup(threadGroupId: string): Observable<ThreadGroupForView> {
    const threadGroup = this.threadGroupList.find(tg => tg.id === threadGroupId);
    if (!threadGroup) {
      throw new Error('Thread group not found');
    }

    const { title, type, description } = threadGroup;
    
    return this.threadService.cloneThreadGroup(threadGroupId, {
      title: `Copy of ${title}`,
      type,
      description
    }).pipe(
      tap(clonedThreadGroup => {
        if (clonedThreadGroup.type === ThreadGroupType.Normal) {
          this.threadGroupList.unshift(clonedThreadGroup);
          this.threadGroupListUpdated.emit(this.threadGroupList);
        } else if (clonedThreadGroup.type === ThreadGroupType.Template) {
          this.templateThreadGroupList.unshift(clonedThreadGroup);
          this.templateThreadGroupList.sort((a, b) => a.title.localeCompare(b.title));
          this.templateListUpdated.emit(this.templateThreadGroupList);
        }
      })
    );
  }

  /**
   * スレッドグループの削除
   */
  deleteThreadGroup(threadGroup: ThreadGroupForView): Observable<void> {
    return this.dialog.open(DialogComponent, {
      data: {
        title: 'チャット削除',
        message: `このチャットを削除しますか？\n「${threadGroup.title.replace(/\n/g, '')}」`,
        options: ['キャンセル', '削除']
      }
    }).afterClosed().pipe(
      switchMap(result => {
        if (result === 1) {
          return this.threadService.deleteThreadGroup(threadGroup.id).pipe(
            tap(() => {
              if (threadGroup.type === ThreadGroupType.Normal) {
                const index = this.threadGroupList.indexOf(threadGroup);
                if (index >= 0) {
                  this.threadGroupList.splice(index, 1);
                  this.threadGroupListUpdated.emit(this.threadGroupList);
                }
              } else if (threadGroup.type === ThreadGroupType.Template) {
                const index = this.templateThreadGroupList.indexOf(threadGroup);
                if (index >= 0) {
                  this.templateThreadGroupList.splice(index, 1);
                  this.templateListUpdated.emit(this.templateThreadGroupList);
                }
              }
            })
          );
        }
        return of(undefined);
      }),
      map(() => void 0)
    );
  }

  /**
   * スレッドグループの保存
   */
  saveThreadGroup(threadGroup: ThreadGroup): Observable<ThreadGroupForView> {
    const originalThreadGroup = Utils.clone(threadGroup);
    
    return this.threadService.upsertThreadGroup(this.selectedProject.id, threadGroup).pipe(
      tap(savedThreadGroup => {
        if (originalThreadGroup.id.startsWith('dummy-')) {
          this.threadGroupList.unshift(savedThreadGroup);
          this.threadGroupListUpdated.emit(this.threadGroupList);
        }
        
        // スレッドIDの更新処理
        savedThreadGroup.threadList.forEach((thread, index) => {
          const originalThread = originalThreadGroup.threadList[index];
          if (originalThread) {
            // メッセージグループのthreadIdを更新
            // この処理は MessageService で行うべきかもしれません
          }
        });
      })
    );
  }

  /**
   * スレッドグループの移動
   */
  moveThreadGroupToProject(threadGroup: ThreadGroupForView, targetProject: Project): Observable<void> {
    // プロジェクト間での共有範囲チェック
    if (this.needsConfirmationForMove(threadGroup, targetProject)) {
      return this.confirmAndMove(threadGroup, targetProject);
    } else {
      return this.executeMove(threadGroup, targetProject);
    }
  }

  /**
   * テンプレートとして保存
   */
  saveAsTemplate(
    threadName: string,
    description: string,
    includeMessages: boolean,
    threadGroupId?: string
  ): Observable<ThreadGroupForView> {
    const selectedThreadGroup = this.selectedThreadGroup$.value;
    
    // 既存テンプレートの削除（更新の場合）
    const cleanup = threadGroupId 
      ? this.threadService.deleteThreadGroup(threadGroupId)
      : of(undefined);

    if (includeMessages) {
      return of(0).pipe(
        switchMap(() => cleanup),
        switchMap(() => this.threadService.cloneThreadGroup(selectedThreadGroup.id, {
          type: ThreadGroupType.Template,
          title: threadName,
          description: description
        })),
        switchMap(clonedGroup => 
          this.threadService.upsertThreadGroup(this.selectedProject.id, clonedGroup)
        ),
        tap(newTemplate => {
          this.updateTemplateList(newTemplate, threadGroupId);
        })
      );
    } else {
      return this.createTemplateWithoutMessages(threadName, description, cleanup);
    }
  }

  /**
   * テンプレート編集
   */
  editTemplate(threadGroup: ThreadGroup): Observable<ThreadGroupForView> {
    return this.dialog.open(SaveThreadDialogComponent, {
      data: {
        templateThreadGroupList: this.templateThreadGroupList,
        threadName: threadGroup.title,
        description: threadGroup.description,
        hasMessages: false,
        includeMessages: false,
        isRenameOnly: true,
      } as SaveThreadData,
    }).afterClosed().pipe(
      switchMap(params => {
        if (params) {
          const updateData = Utils.clone(threadGroup);
          updateData.title = params.threadName;
          updateData.description = params.description;
          
          return this.threadService.updateThreadGroupTitleAndDescription(
            threadGroup.projectId, 
            updateData
          ).pipe(
            tap(() => {
              threadGroup.title = params.threadName;
              threadGroup.description = params.description;
              this.snackBar.open(`「${params.threadName}」モードを更新しました。`, 'close', { duration: 3000 });
            })
          );
        }
        return of(threadGroup as ThreadGroupForView);
      })
    );
  }

  private needsConfirmationForMove(threadGroup: ThreadGroupForView, targetProject: Project): boolean {
    // 共有範囲やチームが異なる場合は確認が必要
    return this.getProjectVisibility(targetProject) !== this.getProjectVisibility(this.selectedProject) ||
           targetProject.teamId !== this.selectedProject.teamId;
  }

  private getProjectVisibility(project: Project): ProjectVisibility {
    // 一人チームはDefaultと見做す
    return project.visibility === ProjectVisibility.Team ? ProjectVisibility.Team : project.visibility;
  }

  private confirmAndMove(threadGroup: ThreadGroupForView, targetProject: Project): Observable<void> {
    const visibilityLabels = {
      Default: '個人用デフォルト',
      Team: 'チーム',
      Login: 'ログインユーザー全員',
      Public: '無制限',
    };

    return this.dialog.open(DialogComponent, {
      data: {
        title: 'Alert',
        message: `共有範囲の異なるプロジェクトに送ります。\n[${visibilityLabels[this.selectedProject.visibility]}]${this.selectedProject.label}->[${visibilityLabels[targetProject.visibility]}]${targetProject.label}\nよろしいですか？`,
        options: ['キャンセル', 'OK']
      }
    }).afterClosed().pipe(
      switchMap(result => {
        if (result === 1) {
          return this.executeMove(threadGroup, targetProject);
        }
        return of(undefined);
      }),
      map(() => void 0)
    );
  }

  private executeMove(threadGroup: ThreadGroupForView, targetProject: Project): Observable<void> {
    return this.threadService.moveThreadGroup(threadGroup.id, targetProject.id).pipe(
      switchMap(() => this.loadThreadGroups(this.selectedProject)),
      tap(() => {
        const index = this.threadGroupList.indexOf(threadGroup);
        if (index >= 0) {
          this.threadGroupList.splice(index, 1);
          this.threadGroupListUpdated.emit(this.threadGroupList);
        }
        this.snackBar.open('チャットを移動しました。', 'close', { duration: 3000 });
      }),
      map(() => void 0)
    );
  }

  private createTemplateWithoutMessages(
    threadName: string,
    description: string,
    cleanup: Observable<any>
  ): Observable<ThreadGroupForView> {
    const selectedThreadGroup = this.selectedThreadGroup$.value;
    
    const threadGroup = {
      ...selectedThreadGroup,
      title: threadName,
      description: description,
      type: ThreadGroupType.Template,
      threadList: selectedThreadGroup.threadList.map(thread => ({
        ...Utils.clone(thread),
        inDto: {
          ...thread.inDto,
          args: {
            ...thread.inDto.args,
            cachedContent: undefined,
          }
        }
      }))
    } as ThreadGroup;

    return of(0).pipe(
      switchMap(() => cleanup),
      switchMap(() => this.threadService.upsertThreadGroup(threadGroup.projectId, threadGroup)),
      switchMap(savedThreadGroup => {
        // システムプロンプトを保存
        return this.saveSystemPrompts(savedThreadGroup).pipe(
          map(() => savedThreadGroup)
        );
      }),
      tap(newTemplate => {
        this.updateTemplateList(newTemplate);
      })
    );
  }

  private saveSystemPrompts(savedThreadGroup: ThreadGroupForView): Observable<any> {
    const systemMessageGroups = this.getSystemMessageGroups();
    
    const forInsert = Utils.clone(systemMessageGroups);
    forInsert.forEach((messageGroup, index) => {
      this.prepareMessageGroupForInsert(messageGroup, savedThreadGroup.threadList[index].id);
    });

    return safeForkJoin(forInsert.map(messageGroup =>
      this.messageService.upsertSingleMessageGroup(messageGroup)
    ));
  }

  private getSystemMessageGroups(): MessageGroupForView[] {
    // システムメッセージグループを取得する実装
    return [];
  }

  private prepareMessageGroupForInsert(messageGroup: MessageGroupForView, threadId: string): void {
    // メッセージグループを挿入用に準備する実装
    messageGroup.threadId = threadId;
    // その他の必要な準備処理
  }

  private updateTemplateList(newTemplate: ThreadGroupForView, replaceId?: string): void {
    if (replaceId) {
      const replaceIndex = this.templateThreadGroupList.findIndex(tg => tg.id === replaceId);
      if (replaceIndex >= 0) {
        this.templateThreadGroupList[replaceIndex] = newTemplate;
      }
    } else {
      this.templateThreadGroupList.unshift(newTemplate);
    }
    
    this.templateThreadGroupList.sort((a, b) => a.title.localeCompare(b.title));
    this.templateListUpdated.emit(this.templateThreadGroupList);
  }
}