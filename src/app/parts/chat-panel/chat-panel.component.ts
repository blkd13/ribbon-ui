import { MessageService } from './../../services/project.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule, MatExpansionPanel } from '@angular/material/expansion';

import { ChatCompletionContentPart, ChatCompletionContentPartText } from '../../models/models';
import { ChatService } from '../../services/chat.service';
import { DomUtils } from '../../utils/dom-utils';
import { MarkdownComponent } from 'ngx-markdown';
import { DocTagComponent } from '../doc-tag/doc-tag.component';
import { ContentPart, ContentPartType, MessageForView, MessageGroup, MessageGroupResponseDto, MessageUpsertResponseDto } from '../../models/project-models';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, of, tap } from 'rxjs';
import { Utils } from '../../utils';

import JSZip from 'jszip'; // JSZipのインポート
import { saveAs } from 'file-saver'; // Blobファイルのダウンロードのためのライブラリ

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [
    CommonModule, FormsModule, DocTagComponent,
    MatTooltipModule, MarkdownComponent, MatIconModule, MatButtonModule, MatExpansionModule, MatSnackBarModule,
  ],
  templateUrl: './chat-panel.component.html',
  styleUrl: './chat-panel.component.scss'
})
export class ChatPanelComponent {

  // @Input() // status 0:未開始 1:実行中 2:完了
  // message!: MessageForView;

  @Input() // status 0:未開始 1:実行中 2:完了
  messageGroup!: MessageGroupResponseDto;

  @Input() // メッセージの順番
  index!: number;

  // チャット入力欄
  @ViewChild('textAreaElem')
  textAreaElem!: ElementRef<HTMLTextAreaElement>;

  @ViewChild('textBodyElem')
  textBodyElem!: ElementRef<HTMLDivElement>;

  @Input()
  title!: string;

  @Input()
  placeholder?: string;

  @ViewChild('exPanel')
  exPanel!: MatExpansionPanel;

  @Input()
  set bitCounter(bitCounter: number) {
    setTimeout(() => this.scroll(), 1);
  }

  @Output('edit')
  editEmitter: EventEmitter<MessageUpsertResponseDto> = new EventEmitter();

  @Output('removeDoc')
  removeDocEmitter: EventEmitter<number> = new EventEmitter();

  @Output('remove')
  removeEmitter: EventEmitter<MessageForView> = new EventEmitter();

  // Jsonの場合は```jsonで囲むための文字列
  brackets = { pre: '', post: '' };

  readonly chatService: ChatService = inject(ChatService);
  readonly messageService: MessageService = inject(MessageService);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
  }

  ngOnInit(): void {
    // // TODO スクローラを一番下に
    // this.message = this.messageGroup.messages[this.messageGroup.messages.length - 1] as any as MessageForView;
    // if (this.message.id.startsWith('dummy-')) {
    // } else {
    //   this.messageService.getMessageContentParts(this.message).subscribe({
    //     next: next => {
    //       console.log(next);
    //       this.message.contents = next;
    //     }
    //   });
    // }
  }

  scroll(): void {
    const content = (this.messageGroup.messages[this.messageGroup.selectedIndex].contents.find(content => content.type === 'text') as ChatCompletionContentPartText);
    if (content && (content.text.startsWith('{') || content.text.startsWith('['))) {
      this.brackets.pre = '```json\n';
      this.brackets.post = '\n```';
    }
    // 一番下にスクロール
    if (this.textBodyElem) {
      DomUtils.scrollToBottomIfNeeded(this.textBodyElem.nativeElement);
    } else { }
  }

  languageExtensions = {
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
                const ext = (this.languageExtensions as any)[headers[0]] || headers[0];
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
      }
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

  removeDoc($index: number): void {
    this.removeDocEmitter.emit($index);
  }

  remove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    if (this.messageGroup.role === 'system') {
      // systemは行消さずに中身消すだけにする。
      this.messageGroup.messages[this.messageGroup.selectedIndex].contents = [this.messageGroup.messages[this.messageGroup.selectedIndex].contents[0]];
      this.messageGroup.messages[this.messageGroup.selectedIndex].contents[0].type = ContentPartType.Text;
      this.messageGroup.messages[this.messageGroup.selectedIndex].contents[0].text = '';
      this.messageGroup.messages[this.messageGroup.selectedIndex].contents[0].fileId = undefined;
      this.exPanel.close();
    } else {
      this.removeEmitter.emit(this.messageGroup.messages[this.messageGroup.selectedIndex]);
    }
  }

  timeoutId: any;
  onKeyDown($event: KeyboardEvent): void {
    if ($event.key === 'Enter') {
      if ($event.ctrlKey) {
        // this.onSubmit();
        // ここでsubmitすると二重送信になるのでblurするだけで良い。
        this.textAreaElem.nativeElement.blur();
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
    this.messageService.upsertMessageWithContents(this.messageGroup.threadId, {
      messageClusterId: this.messageGroup.messageClusterId,
      messageGroupId: this.messageGroup.id,
      messageId: this.messageGroup.messages[this.messageGroup.selectedIndex].id,
      previousMessageId: this.messageGroup.previousMessageId,
      contents: this.messageGroup.messages[this.messageGroup.selectedIndex].contents,
      messageClusterType: this.messageGroup.messageClusterType,
      messageGroupType: this.messageGroup.messageGroupType,
      label: this.messageGroup.messages[this.messageGroup.selectedIndex].contents.filter(content => content.type === 'text').map(content => content.text).join('\n').substring(0, 250),
      role: this.messageGroup.role,
    }).subscribe({
      next: next => {
        this.messageGroup.messages.push(next.message);
        this.messageGroup.selectedIndex = this.messageGroup.messages.length - 1;
        this.editEmitter.emit(next);
      },
      error: error => {
        this.snackBar.open(`メッセージ更新に失敗しました。`, 'close', { duration: 3000 });
        // TODO メッセージ戻す処理が必要。
      }
    });
  }

  onChange(): void {
    // textareaの縦幅更新。遅延打ちにしないとvalueが更新されていない。
    setTimeout(() => { DomUtils.textAreaHeighAdjust(this.textAreaElem.nativeElement); }, 0);
  }

  height: string = 'auto';
  onLoad(): void {
  }

  onBlur($event: FocusEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.messageGroup.messages[this.messageGroup.selectedIndex].editing = 0;
  }

  setEdit($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    if (this.messageGroup.messages[this.messageGroup.selectedIndex].editing) {
    } else {
      this.exPanel.open();
      if (this.textBodyElem) {
        this.height = `${this.textBodyElem.nativeElement.clientHeight}px`;
      } else { }
    }
    this.messageGroup.messages[this.messageGroup.selectedIndex].editing = this.messageGroup.messages[this.messageGroup.selectedIndex].editing ? 0 : 1;
  }

  loadContent(): Observable<ContentPart[]> {
    if (this.messageGroup.messages[this.messageGroup.selectedIndex].id.startsWith('dummy-')) {
      // TODO いちいちこんな分岐入れるのはあり得ないので他の方法を考えるべき。
      return of([]);
    } else if (this.messageGroup.messages[this.messageGroup.selectedIndex].contents.length === 0) {
      return this.messageService.getMessageContentParts(this.messageGroup.messages[this.messageGroup.selectedIndex]).pipe(
        tap(contents => {
          this.messageGroup.messages[this.messageGroup.selectedIndex].contents = contents;
        }),
      );
    } else {
      // load済みのものを返す
      return of(this.messageGroup.messages[this.messageGroup.selectedIndex].contents);
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
