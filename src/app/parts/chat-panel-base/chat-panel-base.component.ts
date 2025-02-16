import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, Input, OnInit, ViewEncapsulation, effect, inject, input, output, viewChild } from '@angular/core';
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
import { ContentPart, ContentPartType, MessageForView, MessageGroupForView } from '../../models/project-models';
import { Utils } from '../../utils';
import { MatMenuModule } from '@angular/material/menu';


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

  // チャット入力欄
  readonly textAreaElem = viewChild<ElementRef<HTMLTextAreaElement>>('textAreaElem');

  readonly textBodyElem = viewChild<ElementRef<HTMLDivElement>>('textBodyElem');

  readonly placeholder = input<string>();

  readonly exPanel = viewChild.required<MatExpansionPanel>('exPanel');

  readonly layout = input.required<'flex' | 'grid'>();

  beforeScrollTop = -1;
  autoscroll = false;
  beforeText = '';
  isShowTool: boolean[] = [];
  @Input()
  set bitCounter(bitCounter: number) {
    const content = (this.messageGroup().messages[0].contents.find(content => content.type === 'text') as OpenAI.ChatCompletionContentPartText);
    if (this.beforeText === content?.text) {
      // 変更なければ何もしない
    } else {
      // 変更あればスクロール
      setTimeout(() => this.scroll(), 1);
      this.beforeText = content?.text;
    }
  }

  readonly editEmitter = output<MessageGroupForView>({ alias: 'edit' });

  readonly removeEmitter = output<MessageGroupForView>({ alias: 'remove' });

  readonly toolExecEmitter = output<ContentPart>({ alias: 'toolExec' });

  readonly fileSelectionUpdateEmitter = output<MessageGroupForView>({ alias: 'fileSelectionUpdate' });

  readonly removeMessageEmitter = output<MessageForView>({ alias: 'removeMessage' });

  readonly removeContentEmitter = output<ContentPart>({ alias: 'removeContent' });

  readonly expandedEmitter = output<boolean>({ alias: 'expanded' });

  // Jsonの場合は```jsonで囲むための文字列
  bracketsList: { pre: '' | '```json\n', post: '' | '\n```' }[][] = [];
  blankBracket: { pre: '' | '```json\n', post: '' | '\n```' } = { pre: '', post: '' };

  isLoading = false;

  isRequireComfirm(): boolean {
    // TODO ここは遅くなる元なのであってはならない。
    this.messageGroup().messages.find(message => {
      return message.contents.find(content => {
        // if (content.type === 'tool') {
        //   console.log(content);
        // }
        return content.type === 'tool' && content.meta.info?.requireComfirm && !content.meta.result;
      })
    }) ? true : false;
    return this.messageGroup().messages.find(message => message.contents.find(content => content.type === 'tool' && content.meta.info?.requireComfirm && !content.meta.result)) ? true : false;
  }

  readonly chatService: ChatService = inject(ChatService);
  readonly messageService: MessageService = inject(MessageService);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
    // TODO シグナル式のやり方をとりあえず実装してみた。汚い気がするので後で直したい。シグナル使う必要無いと思う？？
    effect(() => {
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

  languageExtensions: Record<string, string> = {
    "typescript": "ts",
    "typescriptx": "tsx", // TypeScript with JSX
    "javascript": "js",
    "python": "py",
    "csharp": "cs",
    "ruby": "rb",
    "kotlin": "kt",
    "bash": "sh",           // Bash scripts typically use .sh
    "shell": "sh",          // General shell scripts
    "perl": "pl",
    "haskell": "hs",
    "rust": "rs",
    "objective-c": "m",
    "matlab": "m",
    "fortran": "f90",
    "pascal": "pas",
    "visualbasic": "vb",
    "elixir": "ex",
    "clojure": "clj",
    "erlang": "erl",
    "fsharp": "fs",
    "yaml": "yml",
    "markdown": "md",
    "vhdl": "vhd",
    "verilog": "v",
    "julia": "jl",
    "prolog": "pl",
    "ocaml": "ml",
    "scheme": "scm",
    "rexx": "rex",
    "smalltalk": "st",
    "powershell": "ps1"     // PowerShell scripts
  };

  downloadContent($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    let counter = 0;
    const zip = new JSZip();
    this.loadContent().subscribe({
      next: contents => {
        const textList = contents.map((content, index) => {
          if (content.type === 'text') {
            // 奇数インデックスがコードブロックなので、それだけ抜き出す。
            Utils.splitCodeBlock(content.text || '').filter((b, index) => index % 2 === 1).forEach(codeBlock => {
              const codeLineList = codeBlock.split('\n');
              let filename = `content-${counter}.txt`;
              const header = codeLineList.shift() || ''; // 先頭行を破壊的に抽出
              if (header.trim()) {
                const headers = header.trim().split(' ');
                const ext = this.languageExtensions[headers[0]] || headers[0];
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
      next: contents => {
        const text = contents.filter(content => content.type === 'text').map(content => content.text).join('\n');
        const textArea = document.createElement("textarea");
        textArea.style.cssText = "position:absolute;left:-100%";
        document.body.appendChild(textArea);
        textArea.value = text;
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
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

  toolExec($event: MouseEvent, content?: ContentPart): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    if (content) {
      this.toolExecEmitter.emit(content);
    } else { }
  }

  timeoutId: any;
  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ($event.ctrlKey) {
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
    // TODO 本当は次の送信までメッセージ保存したくないけどどうしようもないので一旦保存しておく。
    // 内容を変更した場合は別メッセージとして扱う。
    const messageGroup = this.messageGroup();
    if (messageGroup.role === 'system') {
      if (messageGroup.messages[0].id.startsWith('dummy-')) {
      } else {
        // system：システムプロンプトはツリーを変えたくないので単純にedit
        safeForkJoin(messageGroup.messages.map(message => this.messageService.editMessageWithContents(message))).subscribe({
          next: next => {
            // 戻ってきたもので元オブジェクトに更新を掛ける。
            next.forEach((message, index) => this.messageGroup().messages[index] = message);
            this.editEmitter.emit(this.messageGroup());
          },
          error: error => {
            this.snackBar.open(`メッセージ更新に失敗しました。`, 'close', { duration: 3000 });
            // TODO メッセージ戻す処理が必要。
          }
        });
      }
    } else {
      this.messageService.upsertSingleMessageGroup(messageGroup).subscribe({
        next: next => {
          this.editEmitter.emit(next);
        },
        error: error => {
          this.snackBar.open(`メッセージ更新に失敗しました。`, 'close', { duration: 3000 });
          // TODO メッセージ戻す処理が必要。
        }
      });
    }
  }

  fileSelectionUpdate(): void {
    this.fileSelectionUpdateEmitter.emit(this.messageGroup());
  }

  onChange(): void {
    // textareaの縦幅更新。遅延打ちにしないとvalueが更新されていない。
    setTimeout(() => { DomUtils.textAreaHeighAdjust(this.textAreaElem()!.nativeElement); }, 0);
  }

  height: string = 'auto';
  onLoad(): void {
  }

  onBlur($event: FocusEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.messageGroup().messages.forEach(message => message.editing = 0);
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

  loadContent(): Observable<ContentPart[]> {
    const messageGroup = this.messageGroup();
    if (messageGroup.messages[0].id.startsWith('dummy-')) {
      // TODO いちいちこんな分岐入れるのはあり得ないので他の方法を考えるべき。
      return of([]);
    } else if (messageGroup.messages[0].contents.length === 0) {
      const contentPart = this.messageService.initContentPart(messageGroup.messages[0].id, messageGroup.messages[0].label);
      messageGroup.messages[0].contents = [contentPart];
      this.isLoading = true;
      return this.messageService.getMessageContentParts(messageGroup.messages[0]).pipe(
        tap(contents => {
          this.messageGroup().messages[0].contents = contents;
          this.setBrackets();
          this.isLoading = false;
          this.exPanel().open();
        }),
      );
    } else {
      // load済みのものを返す
      this.setBrackets();
      // TODO exPanelが表示されてないとき？はexceptionが起きるのでtry/catchしておく。原因特定して対処したい。
      try { if (this.exPanel && this.exPanel()) this.exPanel().open(); } catch (err) { }
      return of(messageGroup.messages[0].contents);
    }
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
