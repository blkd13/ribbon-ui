import { CommonModule } from '@angular/common';
import { AfterViewChecked, ChangeDetectorRef, Component, ElementRef, Input, OnInit, ViewChild, ViewEncapsulation, effect, inject, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { animate, style, transition, trigger } from '@angular/animations';
import { Observable, of, tap } from 'rxjs';
import OpenAI from 'openai';

import JSZip from 'jszip'; // JSZipのインポート
import { saveAs } from 'file-saver'; // Blobファイルのダウンロードのためのライブラリ

import { MessageService } from './../../services/project.service';
import { ChatService } from '../../services/chat.service';
import { DomUtils, safeForkJoin } from '../../utils/dom-utils';
import { ContentPart, ContentPartType, MessageForView, MessageGroupForView, Project } from '../../models/project-models';
import { Utils } from '../../utils';
import { MatMenuModule } from '@angular/material/menu';
import { ToolCallPart, ToolCallPartBody, ToolCallPartCommand, ToolCallPartCommandBody, ToolCallPartInfo, ToolCallPartType, ToolCallSet } from '../../services/tool-call.service';
import { MatDialog } from '@angular/material/dialog';
import { ToolCallCallResultDialogComponent } from '../tool-call-call-result-dialog/tool-call-call-result-dialog.component';
import { MatTabsModule } from '@angular/material/tabs';
import { UserService } from '../../services/user.service';
import { MarkdownService } from 'ngx-markdown';
import { ChatPanelZoomDialogComponent } from '../chat-panel-zoom-dialog/chat-panel-zoom-dialog.component';


@Component({
  selector: 'app-chat-panel-base',
  imports: [
    CommonModule, FormsModule,
    MatTooltipModule, MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule, MatProgressSpinnerModule, MatMenuModule,
  ],
  templateUrl: './chat-panel-base.component.html',
  styleUrl: './chat-panel-base.component.scss',
  // encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('fadeAnimation', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('200ms', style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms', style({ opacity: 0 }))
      ])
    ])
  ]
})
export class ChatPanelBaseComponent implements OnInit {

  // @Input() // status 0:未開始 1:実行中 2:完了
  // message!: MessageForView;

  readonly messageGroup = input.required<MessageGroupForView>();

  // 履歴選択を変更したときのシグナル受信用。別に個々の値を見てどうこうはしていない
  readonly selectedIndex = input<number>();

  // マルチスレッドの番号。2番目以降は従属的にふるまうようにしていた時代の名残。
  readonly index = input<number>();

  readonly bitCounter = input<number>();

  // チャット入力欄
  readonly textAreaElem = viewChild<ElementRef<HTMLTextAreaElement>>('textAreaElem');

  readonly textBodyElem = viewChild<ElementRef<HTMLDivElement>>('textBodyElem');

  readonly placeholder = input<string>();

  readonly exPanel = viewChild.required<MatExpansionPanel>('exPanel');

  readonly layout = input.required<'flex' | 'grid'>();

  mIndex = 0;
  message!: MessageForView;
  beforeScrollTop = -1;
  autoscroll = false;
  beforeText = '';
  isShowTool: boolean[] = [];

  readonly effectBitCounter = effect(() => {
    this.bitCounter();
    this.setMessageIndex(this.mIndex); // これが無いと復旧したときのmessageの実体が反映しない
    const content = (this.messageGroup().messages[0].contents.find(content => content.type === 'text') as OpenAI.ChatCompletionContentPartText);
    if (this.beforeText === content?.text) {
      // 変更なければ何もしない
    } else {
      // 変更あればスクロール
      setTimeout(() => this.scroll(), 1);
      this.beforeText = content?.text;
      this.cdr.detectChanges();
    }
  });

  readonly editEmitter = output<MessageGroupForView>({ alias: 'edit' });

  readonly removeEmitter = output<MessageGroupForView>({ alias: 'remove' });

  readonly cancelEmitter = output<MessageGroupForView>({ alias: 'cancel' });

  readonly toolExecEmitter = output<{ contentPart: ContentPart, toolCallPartCommandList: ToolCallPartCommand[] }>({ alias: 'toolExec' });

  readonly fileSelectionUpdateEmitter = output<MessageGroupForView>({ alias: 'fileSelectionUpdate' });

  readonly removeMessageEmitter = output<MessageForView>({ alias: 'removeMessage' });

  readonly removeContentEmitter = output<ContentPart>({ alias: 'removeContent' });

  readonly expandedEmitter = output<boolean>({ alias: 'expanded' });

  readonly readyEmitter = output<boolean>({ alias: 'ready' });

  // Jsonの場合は```jsonで囲むための文字列
  bracketsList: { pre: '' | '```json\n', post: '' | '\n```' }[][] = [];
  blankBracket: { pre: '' | '```json\n', post: '' | '\n```' } = { pre: '', post: '' };

  isLoading = false;

  isInteractive(): boolean {
    // TODO ここは遅くなる元なのであってはならない。
    let flag = false;
    this.messageGroup().messages
      .map(message => message.contents.filter(content => content.type === 'tool'))
      .forEach(contents => {
        if (contents.length === 0) return;
        try {
          const toolCallList = JSON.parse(contents[contents.length - 1].text || '[]') as ToolCallSet[];
          flag = flag || !!toolCallList.find(toolCall => toolCall.info.isInteractive && toolCall.commandList.length === 0 && !this.executedToolCallIdSet.has(toolCall.toolCallId));
        } catch (err) {
          // JSON parse失敗したら無視
          console.log(contents[contents.length - 1].text);
          console.log('JSON parse error', err);
        }
      });
    // console.log(flag);
    return flag;
  }

  executedToolCallIdSet: Set<string> = new Set<string>();
  toolExec($event: MouseEvent, flag: boolean, content?: ContentPart): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    if (content && content.type === 'tool') {
      try {
        const toolCallPartCommandList = (JSON.parse(content.text || '[]') as ToolCallSet[])
          .filter(tc => tc.info && tc.info.isInteractive && !this.executedToolCallIdSet.has(tc.toolCallId))
          .map(tc => ({ type: ToolCallPartType.COMMAND, body: { command: flag ? 'execute' : 'cancel' }, toolCallId: tc.toolCallId })) as ToolCallPartCommand[];
        // 実行/キャンセルに関わらず、指示済みのものはリストに追加
        toolCallPartCommandList.forEach(tc => this.executedToolCallIdSet.add(tc.toolCallId));
        this.toolExecEmitter.emit({ contentPart: content, toolCallPartCommandList });
      } catch (err) {
        console.log('toolExec error', err);
      }
    } else { }
  }

  jsonParseToArray(text: string): any[] {
    const obj = JSON.parse(text || '[]') as any[];
    return Array.isArray(obj) ? obj : [];
  }

  readonly userService: UserService = inject(UserService);
  readonly chatService: ChatService = inject(ChatService);
  readonly messageService: MessageService = inject(MessageService);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
    // TODO シグナル式のやり方をとりあえず実装してみた。汚い気がするので後で直したい。シグナル使う必要無いと思う？？
    effect(() => {
      this.setMessageIndex(this.mIndex);
      if (this.message.editing) {
        this.exPanel().open();
      } else { }
      if (this.messageGroup().isExpanded) {
        this.loadContent().subscribe();
      } else { }
    })
  }

  ngOnInit(): void {
    // // TODO スクローラを一番下に
    // const message = this.messageGroup.messages[this.messageGroup.messages.length - 1] as any as MessageForView;
    // if (message.id.startsWith('dummy-')) {
    // } else {
    //   this.messageService.getMessageContentParts(message).subscribe({
    //     next: next => {
    //       // console.log(next);
    //       message.contents = next;
    //     },
    //   });
    // }
    this.setBrackets();
  }
  setBrackets(): void {
    this.messageGroup().messages.forEach((message, mIndex) => {
      this.bracketsList[mIndex] = [];
      message.contents.forEach((content, cIndex) => {
        if (content
          && [ContentPartType.TEXT, ContentPartType.ERROR].includes(content.type)
          && content.text
          && (content.text.startsWith('{') || content.text.startsWith('['))
        ) {
          this.bracketsList[mIndex][cIndex] = { pre: '```json\n', post: '\n```' };
          // エラーの時はJSONを整形しておく
          if (content.type === ContentPartType.ERROR) {
            // 整形失敗しても気にしない
            try { content.text = JSON.stringify(JSON.parse(content.text), null, 2); } catch (err) { }
          } else { }
        } else {
          this.bracketsList[mIndex][cIndex] = this.blankBracket;
        }
      });
    });
  }

  setMessageIndex(index: number): void {
    this.mIndex = index;
    this.message = this.messageGroup().messages[this.mIndex];
  }

  scroll(): void {
    // this.setBrackets();
    // 冷静になるとこのパネル自体はスクロールしなくていいんじゃないかという気がする。
    // // 一番下にスクロール
    // const textBodyElem = this.textBodyElem();
    // if (textBodyElem) {
    //   if (this.autoscroll) {
    //     console.log(this.beforeScrollTop, textBodyElem.nativeElement.scrollTop);
    //     if (this.beforeScrollTop <= textBodyElem.nativeElement.scrollTop) {
    //       this.beforeScrollTop = textBodyElem.nativeElement.scrollTop;
    //       DomUtils.scrollToBottomIfNeededSmooth(textBodyElem.nativeElement);
    //     } else {
    //       this.autoscroll = false;
    //     }
    //   } else {
    //     // オートスクロール復活の適切なタイミングが無いからとりあえず下スクロールをトリガにする。
    //     if (this.beforeScrollTop > textBodyElem.nativeElement.scrollTop) {
    //       this.autoscroll = true;
    //     }
    //   }
    // } else { }
  }

  downloadContent($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    let counter = 0;
    const zip = new JSZip();
    this.loadContent().subscribe({
      next: contentsList => {
        contentsList.forEach(contents => {
          const textList = contents.map((content, index) => {
            if (content.type === 'text') {
              // 奇数インデックスがコードブロックなので、それだけ抜き出す。
              Utils.splitCodeBlock(content.text || '').filter((b, index) => index % 2 === 1).forEach(codeBlock => {
                const codeLineList = codeBlock.split('\n');
                let filename = `content-${counter}.txt`;
                const header = codeLineList.shift() || ''; // 先頭行を破壊的に抽出
                if (header.trim()) {
                  const headers = header.trim().split(' ');
                  const ext = this.messageService.languageExtensions[headers[0]] || headers[0];
                  filename = headers[1] || `content-${counter}.${ext}`;
                } else {
                  // plain block
                }
                // ZIPにファイルを追加
                zip.file(filename, codeLineList.join('\n'));
                counter++;
              });
            } else {
              // text以外のコンテンツは無視
              // TODO 本来はファイルとしてダウンロードさせるべきかも・・？
            }
          });
        });
        if (counter) {
          // ZIPファイルを生成し、ダウンロードする
          zip.generateAsync({ type: 'blob' }).then(content => {
            // Blobを利用してファイルをダウンロード
            saveAs(content, `ribbon-${Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS')}.zip`);
            this.snackBar.open(`ダウンロードが完了しました。`, 'close', { duration: 1000 });
          });
        } else {
          this.snackBar.open(`コードブロックが含まれていないので何もしません。`, 'close', { duration: 3000 });
        }
      },
    });
  }

  /**
   * テキストをクリップボードにコピーする
   */
  copyToClipboard($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.loadContent().subscribe({
      next: contentsList => {
        const textList = contentsList.map(contents => {
          return contents.map(content => {
            if (content.type === 'text') {
              return content.text;
            } else {
              return '';
            }
          }).join('\n');
        });
        const text = textList.join('\n');
        DomUtils.copyToClipboard(text);
        this.snackBar.open(`コピーしました。`, 'close', { duration: 1000 });
        // const text = contents.filter(content => content.type === 'text').map(content => content.text).join('\n');
        // const textArea = document.createElement("textarea");
        // textArea.style.cssText = "position:absolute;left:-100%";
        // document.body.appendChild(textArea);
        // textArea.value = text;
        // textArea.select();
        // document.execCommand("copy");
        // document.body.removeChild(textArea);
      },
    });
  }

  removeDoc(contentPart: ContentPart): void {
    this.removeContentEmitter.emit(contentPart);
  }

  remove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    // if (this.messageGroup.role === 'system') {
    //   // systemは行消さずに中身消すだけにする。
    //   this.messageGroup.messages[0].contents = [this.messageGroup.messages[0].contents[0]];
    //   this.messageGroup.messages[0].contents[0].type = ContentPartType.TEXT;
    //   this.messageGroup.messages[0].contents[0].text = '';
    //   this.messageGroup.messages[0].contents[0].fileId = undefined;
    //   this.exPanel.close();
    // } else {
    //   this.removeEmitter.emit(this.messageGroup);
    // }
    this.removeEmitter.emit(this.messageGroup());
  }
  cancel($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.cancelEmitter.emit(this.messageGroup());
  }

  timeoutId: any;
  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ((this.userService.enterMode === 'Ctrl+Enter' && $event.ctrlKey) || this.userService.enterMode === 'Enter') {
        // this.onSubmit();
        // ここでsubmitすると二重送信になるのでblurするだけで良い。
        this.textAreaElem()?.nativeElement.blur();
      } else {
      }
    } else {
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => this.onChange(), 1000);
    }
  }

  onSubmit(): void {
    this.editEmitter.emit(this.messageGroup());
  }

  fileSelectionUpdate(): void {
    this.fileSelectionUpdateEmitter.emit(this.messageGroup());
  }

  onChange(): void {
    // textareaの縦幅更新。遅延打ちにしないとvalueが更新されていない。
    setTimeout(() => { DomUtils.textAreaHeighAdjust(this.textAreaElem()!.nativeElement); }, 0);
  }

  readonly dialog: MatDialog = inject(MatDialog);
  openToolCallDialog($event: MouseEvent, toolCallSet: ToolCallSet): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    // console.log(content);
    this.dialog.open(ToolCallCallResultDialogComponent, {
      data: { toolCallGroupId: toolCallSet.toolCallGroupId, toolCallId: toolCallSet.toolCallId, index: 0 }
    });
  }

  height: string = 'auto';
  onLoad(): void {
  }

  onBlur($event: FocusEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.messageGroup().messages.forEach(message => message.editing = 0);
  }

  onZoom($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    if (this.messageGroup().messages.length > 0 && this.messageGroup().messages[0].contents.length > 0) {
      this.dialog.open(ChatPanelZoomDialogComponent, {
        data: { messageGroup: this.messageGroup() }
      });
    } else {
      this.loadContent(false).subscribe({
        next: contentsList => {
          this.dialog.open(ChatPanelZoomDialogComponent, {
            data: { messageGroup: this.messageGroup() }
          });
        }
      });
    }
  }

  setEdit($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    const messageGroup = this.messageGroup();
    if (messageGroup.messages[0].editing) {
      // this.onSubmit();
    } else {
      this.exPanel().open();
      const textBodyElem = this.textBodyElem();
      if (textBodyElem) {
        this.height = `${textBodyElem.nativeElement.clientHeight}px`;
      } else { }
    }
    messageGroup.messages.forEach(message => message.editing = message.editing ? 0 : 1);
  }

  getConsecutiveFiles(contents: ContentPart[], startIndex: number): ContentPart[] {
    const result = [];
    for (let i = startIndex; i < contents.length; i++) {
      if (contents[i].type !== 'text' && contents[i].type !== 'error') {
        result.push(contents[i]);
      } else {
        break;
      }
    }
    return result;
  }

  loadContent(autoOpenPanel: boolean = true): Observable<ContentPart[][]> {
    const messageGroup = this.messageGroup();
    return safeForkJoin(
      messageGroup.messages.map(message => {
        if (message.id.startsWith('dummy-')) {
          // TODO いちいちこんな分岐入れるのはあり得ないので他の方法を考えるべき。
          return of([]);
        } else if (message.contents.length === 0) {
          const contentPart = this.messageService.initContentPart(message.id, message.label);
          message.contents = [contentPart];
          this.isLoading = true;
          return this.messageService.getMessageContentParts(message).pipe(
            tap(contents => {
              message.contents = contents;
              this.setBrackets();
              this.isLoading = false;
              if (autoOpenPanel) {
                this.exPanel().open();
              } else { }
            }),
          );
        } else {
          // load済みのものを返す
          this.setBrackets();
          // TODO exPanelが表示されてないとき？はexceptionが起きるのでtry/catchしておく。原因特定して対処したい。
          try { if (this.exPanel && this.exPanel()) this.exPanel().open(); } catch (err) { }
          return of(message.contents);
        }
      })
    );
  }

  // チャット入力欄
  readonly mdElem = viewChild<ElementRef<HTMLTextAreaElement>>('mdElem');

  onReady($event: any, type: string): void {
    // console.log($event, type);
    this.convertSvgToImage();
    this.readyEmitter.emit(true);
  }

  convertSvgToImage() {
    const container = this.textBodyElem()?.nativeElement;
    if (container && !['Loading'].includes(this.message.status)) {
      const svgs = container.querySelectorAll('code.language-svg,code.language-xml,code.language-html,language-markdown');
      svgs.forEach(_svg => {
        const svg = (_svg as HTMLPreElement);
        const textContent = svg.textContent || '';
        if (/<svg[\s>]/i.test(textContent)) {
          // SVGをData URIに変換
          // const xml = new XMLSerializer().serializeToString(svg);
          const svg64 = btoa(decodeURIComponent(encodeURIComponent(svg.textContent || '')));
          const image64 = 'data:image/svg+xml;base64,' + svg64;

          // 新しい<img>要素を作成
          const img = document.createElement('img');
          img.src = image64;
          img.alt = svg.textContent || '';
          // img.width = svg.width.baseVal.value; // SVGのwidthを引き継ぐ
          // img.height = svg.height.baseVal.value; // SVGのheightを引き継ぐ

          // this.message.contents[0].text = `![画像](${image64})`;

          // SVGを<img>で置き換える
          svg.style.display = 'block';
          svg.style.height = '0';
          svg.style.width = '0';
          svg.style.overflow = 'hidden';
          svg.parentNode?.appendChild(img);
          // svg.parentNode?.replaceChild(img, svg);
        } else { }
      });
      const html = container.querySelectorAll('code.language-html');
      html.forEach(_html => {
        const html = (_html as HTMLPreElement);
        const textContent = html.textContent || '';
        if (/<html[\s>]/i.test(textContent)) {
          // iframe要素を作成
          const iframe = document.createElement('iframe');
          iframe.srcdoc = html.textContent || '';
          iframe.width = '100%';
          iframe.style.border = 'none';
          const maxHeight = 800;

          // iframeのload時にheightを調整する関数を設定
          iframe.onload = () => {
            try {
              // iframeのコンテンツの高さを取得して設定
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc) {
                // スクロール高さを取得
                const height = Math.min(iframeDoc.documentElement.scrollHeight, maxHeight);
                iframe.height = `${height}px`;

                // リサイズイベントを監視して高さを再調整（レスポンシブ対応）
                const resizeObserver = new ResizeObserver(() => {
                  const newHeight = Math.min(iframeDoc.documentElement.scrollHeight, maxHeight);
                  iframe.height = `${newHeight}px`;
                });
                resizeObserver.observe(iframeDoc.body);
              }
            } catch (e) {
              console.error('iframe height adjustment failed:', e);
              // エラー時はデフォルト高さを設定
              iframe.height = '500px';
            }
          };

          // 元のHTML要素を非表示にする
          html.style.display = 'block';
          html.style.height = '0';
          html.style.width = '0';
          html.style.overflow = 'hidden';
          html.parentNode?.appendChild(iframe);
        }
      });

    } else { }
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}


export enum ChatCardStatus {
  NotStarted = 0,
  Running = 1,
  Completed = 2,
}
