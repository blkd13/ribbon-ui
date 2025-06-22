import { Component, EventEmitter, Input, Output, inject, viewChildren, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

import { DomUtils } from '../../../../utils/dom-utils';
import { UserService } from '../../../../services/user.service';
import { ChatPanelMessageComponent } from '../../../../parts/chat-panel-message/chat-panel-message.component';
import { MessageGroupForView, ThreadGroupForView } from '../../../../models/project-models';

@Component({
  selector: 'app-ui-state',
  template: `<!-- Template will be extracted from main component -->`,
  standalone: true
})
export class UIStateComponent {
  @Input() selectedThreadGroup!: ThreadGroupForView;
  @Input() messageGroupIdListMas: { [threadId: string]: string[] } = {};
  @Input() allExpandCollapseFlag = true;
  @Input() showThreadList = true;
  @Input() showInfo = true;
  @Input() linkChain: boolean[] = [true];
  @Input() tabIndex = 0;

  @Output() expandCollapseToggled = new EventEmitter<boolean>();
  @Output() threadListToggled = new EventEmitter<boolean>();
  @Output() infoToggled = new EventEmitter<boolean>();
  @Output() tabChanged = new EventEmitter<number>();
  @Output() scrollPositionChanged = new EventEmitter<{ tabIndex: number, position: number }>();

  readonly userService = inject(UserService);
  readonly router = inject(Router);
  readonly activatedRoute = inject(ActivatedRoute);

  // ViewChildren references (これらは親コンポーネントから渡される必要があります)
  chatPanelList = viewChildren<ChatPanelMessageComponent>(ChatPanelMessageComponent);
  textBodyElem = viewChildren<ElementRef<HTMLDivElement>>('textBodyElem');
  anchor = viewChildren<ElementRef<HTMLDivElement>>('anchor');

  scrollPositions: number[] = [];

  /**
   * 全メッセージパネルの展開/折りたたみ切り替え
   */
  toggleAllExpandCollapse(): void {
    this.allExpandCollapseFlag = !this.allExpandCollapseFlag;
    this.expandCollapseToggled.emit(this.allExpandCollapseFlag);

    this.chatPanelList().forEach(chat => {
      if (this.allExpandCollapseFlag) {
        chat.exPanel().open();
      } else {
        chat.exPanel().close();
      }
    });
  }

  /**
   * スレッドリスト表示切り替え
   */
  toggleThreadList(): void {
    this.showThreadList = !this.showThreadList;
    this.threadListToggled.emit(this.showThreadList);
  }

  /**
   * 情報パネル表示切り替え
   */
  toggleInfo(): void {
    this.showInfo = !this.showInfo;
    this.infoToggled.emit(this.showInfo);
  }

  /**
   * タブ変更時のスクロール位置保存
   */
  saveScrollPosition(tabIndex: number): void {
    const bodyElem = this.textBodyElem().at(tabIndex);
    if (bodyElem && bodyElem.nativeElement) {
      this.scrollPositions[tabIndex] = bodyElem.nativeElement.scrollTop || 0;
      this.scrollPositionChanged.emit({ tabIndex, position: this.scrollPositions[tabIndex] });
    }
  }

  /**
   * タブ変更時のスクロール位置復元
   */
  restoreScrollPosition(tabIndex: number): void {
    const threadId = (this.selectedThreadGroup && !this.selectedThreadGroup.id.startsWith('dummy-')) 
      ? this.selectedThreadGroup.id 
      : 'new-thread';
      
    this.router.navigate(['/chat', this.selectedThreadGroup?.projectId, threadId, { tabIndex }]);
    this.tabIndex = tabIndex;
    this.tabChanged.emit(tabIndex);
    
    setTimeout(() => {
      const bodyElem = this.textBodyElem().at(tabIndex);
      if (bodyElem) {
        bodyElem.nativeElement.scrollTop = this.scrollPositions[tabIndex] || 0;
      }
    }, 0);
  }

  /**
   * スムーズスクロールの実行
   */
  scrollToMessage(messageGroup: MessageGroupForView): void {
    if (!messageGroup || !this.selectedThreadGroup) return;

    const threadIndex = this.selectedThreadGroup.threadList
      .map(thread => thread.id)
      .indexOf(messageGroup.threadId);
      
    if (threadIndex < 0) return;

    let anchorIndex = this.calculateAnchorIndex(messageGroup, threadIndex);
    
    // 履歴を閉じる設定に応じた調整
    if (this.userService.historyCloseMode > 0) {
      anchorIndex = this.adjustForHistoryClose(messageGroup, anchorIndex);
    }

    const anchorElem = this.anchor().at(anchorIndex);
    if (anchorElem) {
      anchorElem.nativeElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  }

  /**
   * チェーンされたメッセージグループリストを取得
   */
  getChainedMessageGroupList(messageGroup: MessageGroupForView, offset: number = 0): MessageGroupForView[] {
    const targetMessageGroupList = [];
    
    if (this.userService.chatTabLayout === 'tabs') {
      // tabモードの時は単独
      targetMessageGroupList.push(messageGroup);
    } else {
      const index = this.messageGroupIdListMas[messageGroup.threadId]
        .findIndex(messageGroupId => messageGroupId === messageGroup.id);
        
      if (!this.linkChain[index + offset]) {
        // linkChain=falseの場合は自分だけ
        targetMessageGroupList.push(messageGroup);
      } else {
        // linkChain=trueの場合は全て
        Object.keys(this.messageGroupIdListMas).forEach(threadId => {
          const syncMessageGroupId = this.messageGroupIdListMas[threadId][index];
          if (syncMessageGroupId) {
            // MessageServiceから取得する必要があります
            // targetMessageGroupList.push(this.messageService.messageGroupMas[syncMessageGroupId]);
          }
        });
      }
    }
    
    return targetMessageGroupList;
  }

  /**
   * 指定されたメッセージグループの展開状態を同期
   */
  syncExpansionState(isExpanded: boolean, pIndex: number, tIndex: number, messageGroup: MessageGroupForView): void {
    this.selectedThreadGroup.threadList.forEach((thread, index) => {
      if (tIndex === index) {
        // 自分は何もしない
      } else {
        const messageGroupId = this.messageGroupIdListMas[thread.id]?.[pIndex];
        if (messageGroupId) {
          // MessageServiceから取得して状態を設定する必要があります
          // const targetMessageGroup = this.messageService.messageGroupMas[messageGroupId];
          // if (targetMessageGroup) {
          //   targetMessageGroup.isExpanded = isExpanded;
          // }
        }
      }
    });
  }

  /**
   * メッセージ表示時の自動スクロール制御
   */
  handleMessageScroll(messageGroup: MessageGroupForView): void {
    let isScrollFired = false;
    
    setTimeout(() => {
      requestAnimationFrame(() => {
        const message = messageGroup.messages[0];
        const threadIndex = this.selectedThreadGroup.threadList
          .map(thread => thread.id)
          .indexOf(messageGroup.threadId);
          
        let anchorIndex = this.calculateAnchorIndex(messageGroup, threadIndex);
        
        // 履歴を閉じる設定の処理
        if (this.userService.historyCloseMode > 0) {
          anchorIndex = this.adjustForHistoryClose(messageGroup, anchorIndex);
        }

        const anchorElem = this.anchor().at(anchorIndex);
        if (anchorElem && !isScrollFired) {
          isScrollFired = true;
          anchorElem.nativeElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }
      });
    }, 100);
  }

  /**
   * テキストエリアの高さ調整
   */
  adjustTextAreaHeight(textArea: HTMLTextAreaElement): void {
    DomUtils.textAreaHeighAdjust(textArea);
  }

  /**
   * リンクチェーンの状態を取得
   */
  isLinkedAtIndex(index: number): boolean {
    return this.linkChain[index] || false;
  }

  /**
   * リンクチェーンの状態を設定
   */
  setLinkChainAtIndex(index: number, linked: boolean): void {
    this.linkChain[index] = linked;
  }

  private calculateAnchorIndex(messageGroup: MessageGroupForView, threadIndex: number): number {
    if (this.userService.chatTabLayout === 'tabs') {
      // タブ表示の場合
      let anchorIndex = 0;
      for (let iThread = 0; iThread <= threadIndex; iThread++) {
        anchorIndex += this.messageGroupIdListMas[this.selectedThreadGroup.threadList[iThread].id].length - 1;
      }
      return anchorIndex - 1;
    } else {
      // リスト表示の場合
      return this.messageGroupIdListMas[this.selectedThreadGroup.threadList[threadIndex].id]
        .indexOf(messageGroup.id);
    }
  }

  private adjustForHistoryClose(messageGroup: MessageGroupForView, anchorIndex: number): number {
    // 履歴を閉じる設定に応じた処理
    let adjustedIndex = anchorIndex;
    
    for (let i = 0; i < this.userService.historyCloseMode; i++) {
      // 前のメッセージグループを取得して閉じる処理
      // この実装はMessageServiceとの連携が必要です
      adjustedIndex--;
    }
    
    return Math.max(0, adjustedIndex);
  }

  /**
   * ページタイトルの更新
   */
  updatePageTitle(title?: string): void {
    document.title = `AI : ${title || this.selectedThreadGroup?.title || '(no title)'}`;
  }

  /**
   * UI状態のリセット
   */
  resetUIState(): void {
    this.allExpandCollapseFlag = true;
    this.tabIndex = 0;
    this.scrollPositions = [];
    this.linkChain = [true];
  }
}