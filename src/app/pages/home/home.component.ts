import { from, mergeMap, of } from 'rxjs';
import { Component, ElementRef, OnInit, QueryList, ViewChild, ViewChildren, inject } from '@angular/core';
import { ChatPanelComponent } from '../../parts/chat/chat-panel.component';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionStreamInDto, Message, MessageForView, Thread } from '../../models/models';
import { ChatService, CountTokensResponse } from '../../services/chat.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, forkJoin, tap, toArray } from 'rxjs';
import { CommonModule } from '@angular/common';
import { DomUtils } from '../../utils/dom-utils';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { ThreadDetailComponent } from '../../parts/thread-detail/thread-detail.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { DialogComponent } from '../../parts/dialog/dialog.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ChatPanelComponent, FileDropDirective, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule, MatSliderModule,
    MatMenuModule, MatDialogModule,
    DialogComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  // chatPanelList = viewChild.required(ChatPanelComponent);

  // メッセージ表示ボックスのリスト
  @ViewChildren(ChatPanelComponent)
  chatPanelList!: QueryList<ChatPanelComponent>;

  // 
  @ViewChild('textAreaElem')
  textAreaElem!: ElementRef<HTMLTextAreaElement>;

  @ViewChild('textBodyElem')
  textBodyElem!: ElementRef<HTMLDivElement>;

  inputArea: MessageForView = { role: 'user', content: [{ type: 'text', text: '' }] };
  inDto: ChatCompletionStreamInDto = this.initInDto();

  // スレッドリスト
  threadList: Thread[] = [];
  // 現在のスレッド
  selectedThread: Thread | null = null;

  bitCounter = 0; // chatPanelにイベントを送るためだけのカウンタ

  // メッセージの枠を全部一気に開くか閉じるかのフラグ
  allExpandCollapseFlag = true;

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
    'gemini-1.5-pro': [0.00125, 0.00375, 0.0025, 0.0075],
    'gemini-1.5-pro-001': [0.00125, 0.00375, 0.0025, 0.0075],
    'claude-3-5-sonnet@20240620': [0.003, 0.015, 0.003, 0.015],
  };
  isCost = true;

  readonly authServce: AuthService = inject(AuthService);
  readonly chatServce: ChatService = inject(ChatService);
  readonly dbService: NgxIndexedDBService = inject(NgxIndexedDBService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);

  constructor() {
    this.dbService.getAll<Thread>('threadList').subscribe({
      next: next => {
        this.threadList = next;
        if (next.length) {
          next.sort((a, b) => b.timestamp - a.timestamp);
          this.selectThread(next[0]);
          // this.selectedThread = next[0];
          // this.inDto = JSON.parse(next[0].body);
          // this.onChange();
        } else {
          this.selectedThread = null;
        }
      }
    });
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
    this.selectedThread = null;
    this.inDto = this.initInDto();
    this.onChange();
    setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
  }

  initInDto(): ChatCompletionStreamInDto {
    const inDto = {
      args: Object.assign({
        messages: [
          { role: 'system', content: [{ type: 'text', text: 'assistant AI.' }], status: 2 } as Message,
        ],
        model: 'gemini-1.5-flash',
        // model: 'gemini-1.5-pro',
        temperature: 0.7,
        top_p: 1,
        max_tokens: 1024,
        stream: true,
      }, JSON.parse(localStorage.getItem('settings-v1.0') || '{}')),
    };
    return inDto;
  }

  files: FileList | null = null;
  isHovered = false;
  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    // const observables: Observable<ChatCompletionContentPartImage>[] = [];
    // const items = event.dataTransfer?.items;
    // if (items) {
    //   for (let i = 0; i < items.length; i++) {
    //     const item = items[i].webkitGetAsEntry();
    //     if (item && item.isDirectory) {
    //       observables.push(this.processFolder(item));
    //     }
    //   }
    // }
    // // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする。
    // this.tokenObj.totalTokens = -1;
    // forkJoin(observables).subscribe({
    //   next: next => {
    //     console.log(`onChange:${observables.length}`);
    //     this.onChange();
    //   }
    // });
  }
  processFolder(item: any): Observable<ChatCompletionContentPartImage> {
    return new Observable(observer => {
      this.traverseFileTree(item, observer);
    });
  }
  traverseFileTree(item: any, observer: any) {
    if (item.isFile) {
      item.file((file: File) => {
        console.log(`file=${file.name}`);
        const part = { type: 'image_url', image_url: { url: '', label: file.name } } as ChatCompletionContentPartImage;
        this.readFile(file, part).subscribe({
          next: next => {
            observer.next(part);
            observer.complete();
          }
        });
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      dirReader.readEntries((entries: any[]) => {
        from(entries).pipe(
          mergeMap(entry => this.processFolder(entry))
        ).subscribe({
          next: (file) => observer.next(file),
          complete: () => observer.complete()
        });
      });
    }
  }

  onFilesDropped(files: FileList) {
    const subjects = [];
    this.files = files;
    for (let i = 0; i < files.length; i++) {
      console.log(files[i].name);
      const part = { type: 'image_url', image_url: { url: '', label: files[i].name } } as ChatCompletionContentPartImage;
      subjects.push(this.readFile(files[i], part));
    }
    // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする。
    this.tokenObj.totalTokens = -1;
    forkJoin(subjects).subscribe({ next: next => this.onChange() });
  }

  readFile(file: File, part: ChatCompletionContentPartImage): Observable<string> {
    return new Observable<string>(observable => {
      const reader = new FileReader();
      reader.onload = (() => {
        const base64String = reader.result as string;
        const imagePart = part;
        // const extMap: Record<string, string[]> = {
        //   audio: ["mp3", "wav", "flac", "aac", "ogg", "wma", "m4a", "aiff", "alac", "opus", "amr", "mid", "midi", "ac3", "dts", "pcm", "aif", "au", "ra", "mp2", "mka", "tta"],
        //   image: ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "svg", "ico", "heic", "heif", "psd", "raw", "cr2", "nef", "orf", "sr2", "raf", "dng", "arw", "pef", "3fr", "rwl", "srw", "k25", "kdc", "dcr", "mos", "mef", "x3f", "erf", "nrw"],
        //   video: ["mp4", "mkv", "mov", "avi", "wmv", "flv", "webm", "mpeg", "mpg", "m4v", "3gp", "3g2", "ogg", "ogv", "mts", "m2ts", "ts", "mxf", "rm", "rmvb", "vob", "f4v", "divx", "xvid"],
        // };
        // const ext = file.name.replace(/.*\./g, '').toLowerCase();
        // const mediaType = Object.keys(extMap).find(mediaType => extMap[mediaType].includes(ext));
        // // imagePart.image_url.url = `data:${mediaType}/${ext};base64,${base64String}`;;
        imagePart.image_url.url = base64String;

        const contents = this.inputArea.content as ChatCompletionContentPart[];
        contents.push(part);
        observable.next(base64String);
        observable.complete();
      }).bind(this);
      reader.readAsDataURL(file);
    });
  }

  onFilesHovered(isHovered: boolean) {
    this.isHovered = isHovered;
  }

  onFileSelected(event: any) {
    this.onFilesDropped(event.target.files);
  }
  openFileDialog(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  createCache(): void {
    // 32768トークン以上ないとキャッシュ作成できない
    if (this.tokenObj.totalTokens < 32768) {
      alert(`コンテキストキャッシュを作るには 32,768 トークン以上必要です。\n現在${this.tokenObj.totalTokens} トークンしかありません。`);
      return;
    }
    const req = JSON.parse(JSON.stringify(this.inDto)) as ChatCompletionStreamInDto;
    const inputArea = JSON.parse(JSON.stringify(this.inputArea)) as Message;
    req.args.messages.push(inputArea);
    this.chatServce.createCache(req).subscribe({
      next: next => {
        // 
        this.inDto.args.messages.forEach(message => (message as MessageForView).cached = 1);
        this.inDto.args.cachedContent = next;
        this.save(this.selectedThread);
      }
    });
  }

  calcCost(): number {
    const charCount = (this.tokenObj.text + this.tokenObj.image + this.tokenObj.audio + this.tokenObj.video);
    const isLarge = this.tokenObj.totalTokens > 128000 ? 2 : 0;
    const cost = charCount / 1000 * this.priceMap[this.inDto.args.model || 'gemini-1.5-pro'][isLarge];
    return cost;
  }

  isLock = false;
  selectThread(thread: Thread): void {
    if (this.selectedThread) {
      this.save(this.selectedThread).subscribe({
        next: next => {
          this.selectedThread = thread;
          this.inDto = JSON.parse(thread.body);
          this.onChange();

          // this.allExpandCollapseFlag = true;
          // this.toggleAllExpandCollapse();
          // 一番下まで下げる
          setTimeout(() => { DomUtils.scrollToBottomIfNeeded(this.textBodyElem.nativeElement); }, 100);
        }
      });
    } else {
      this.selectedThread = thread;
      this.inDto = JSON.parse(thread.body);
      this.onChange();

      // this.allExpandCollapseFlag = true;
      // this.toggleAllExpandCollapse();
      // 一番下まで下げる
      setTimeout(() => { DomUtils.scrollToBottomIfNeeded(this.textBodyElem.nativeElement); }, 100);
    }
    setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
  }

  save(thread: Thread | null): Observable<Thread> {
    if (thread) {
      thread.timestamp = Date.now();
      // 整形用にディープコピー
      const inDto = JSON.parse(JSON.stringify(this.inDto)) as ChatCompletionStreamInDto;
      // inDto.args.messages = inDto.args.messages.map(obj => ({ role: obj.role, content: obj.content }));
      thread.body = JSON.stringify(inDto);
      return this.dbService.update('threadList', thread);
    } else {
      return this.dbService.add('threadList', {
        title: '',
        timestamp: Date.now(),
        description: '',
        body: JSON.stringify(this.inDto),
        isEdit: false,
      } as Thread).pipe(tap(thread => {
        this.selectedThread = thread;
        this.threadList.push(thread);
      }));
    }
  }

  renameThread($event: Event, thread: Thread, flag: boolean, $index: number): void {
    if (flag) {
      thread.isEdit = true;
      // 遅延でフォーカスさせる
      setTimeout(() => (document.getElementById(`thread-title-${$index}`) as HTMLInputElement)?.select(), 100);
    } else {
      thread.isEdit = false
      thread.title = thread.title || 'No name';
      this.save(thread).subscribe();
    }
  }

  duplicate($event: MouseEvent, thread: Thread): void {
    // this.stopPropagation($event);
    const dupli = JSON.parse(JSON.stringify(thread)) as Thread;
    dupli.isEdit = false;
    dupli.title = thread.title + '_copy';
    dupli.timestamp = Date.now();
    this.threadList.push(dupli);
  }

  send(): void {
    // this.cachedContents = {
    //   "name": "projects/458302438887/locations/us-central1/cachedContents/8300204481988001792",
    //   "model": "projects/gcp-cloud-shosys-ai-002/locations/us-central1/publishers/google/models/gemini-1.5-flash-001",
    //   "createTime": "2024-07-11T02:49:34.968254Z",
    //   "updateTime": "2024-07-11T02:49:34.968254Z",
    //   "expireTime": "2024-07-11T03:49:34.958554Z",
    // };

    // 入力エリアに何も書かれていない場合はスルーする
    if (this.inputArea.content[0].type === 'text' && this.inputArea.content[0].text) {
      this.inputArea.editing = 0;
      this.inDto.args.messages.push(this.inputArea);
    } else { }

    // 整形用にディープコピー
    const inDto = JSON.parse(JSON.stringify(this.inDto)) as ChatCompletionStreamInDto;
    inDto.args.messages = inDto.args.messages.filter(message => !(message as MessageForView).cached).map(obj => ({ role: obj.role, content: obj.content }));

    // 新スレッド化既存スレッドか
    (this.selectedThread ? of(this.selectedThread) : this.save(this.selectedThread)).subscribe({
      next: selectedThread => {
        this.selectedThread = selectedThread;
        if (selectedThread.title) {
        } else {
          // タイトルが無かったら入力分からタイトルを作る
          const inputText = inDto.args.messages
            .map(message => message.role + ': ' + this.chatServce.messageToText(message))
            .join('\n').substring(0, 4000); // あんま長くしても意味ないから4000で切っておく
          this.chatServce.chatCompletionObservableStream({
            args: {
              max_tokens: 40,
              model: 'gemini-1.5-flash', messages: [
                // { role: 'system', content: 'コピーライター' },
                { role: 'user', content: `この書き出しで始まるチャットにタイトルをつけてください。短く適当でいいです。タイトルだけを返してください。タイトル以外の説明などはつけてはいけません。\n\n\`\`\`markdown\n\n${inputText}\n\`\`\`` } as any
              ]
            }
          }).pipe(tap(text => selectedThread.title += text), toArray()).subscribe({
            next: next => {
              this.save(selectedThread).subscribe();
            }
          });
        }

        // 入力エリアをクリア
        this.inputArea = { role: 'user', content: [{ type: 'text', text: '' }], editing: 1, status: 2 } as Message;

        // レスポンス受け用オブジェクトを作っておく
        const res = { role: 'assistant', content: [{ type: 'text', text: '' }], status: 0 };

        let isFirst = true;
        this.isLock = true;

        // 終了後処理
        const afterFunc = (() => {
          // db更新
          this.save(selectedThread).subscribe();

          this.isLock = false;
          res.status = 2;
          setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
        }).bind(this);
        // 
        for (const a in [0]) {
          this.chatServce.chatCompletionObservableStream(inDto).subscribe({
            next: text => {
              if (isFirst) {
                this.inDto.args.messages.push(res as Message);
                isFirst = false;
              } else { }
              res.content[0].text += text;
              res.status = 1;
              this.bitCounter++;
              // console.log(res.content);
              // this.allExpandCollapseFlag = true;
              // this.toggleAllExpandCollapse();
              DomUtils.scrollToBottomIfNeeded(this.textBodyElem.nativeElement);
            },
            error: error => {
              // TODO エラーになったらオブジェクトを戻す。
              alert(`原因不明のエラーです\n${JSON.stringify(error)}`);
              // observableはPromise.then/catch/finallyのfinallyとは違って、エラーになったらcompleteは呼ばれないので自分で呼ぶ。
              afterFunc();
            },
            complete: () => {
              afterFunc();
            }
          });
        }

      },
    });
  }

  saveSettingsAsDefault(): void {
    const settings = {
      model: this.inDto.args.model,
      temperature: this.inDto.args.temperature,
      max_tokens: this.inDto.args.max_tokens,
    };
    localStorage.setItem('settings-v1.0', JSON.stringify(settings));
  }

  private timeoutId: any;
  onKeyDown($event: KeyboardEvent): void {
    setTimeout(() => {
      // textAreaの縦幅更新。遅延打ちにしないとvalueが更新されていない。
      const lineCount = this.textAreaElem.nativeElement.value.split('\n').length;
      this.textAreaElem.nativeElement.style.height = `${Math.min(15, Math.max(2, lineCount)) * 26 + 20}px`;
    }, 0);
    if ($event.key === 'Enter') {
      if ($event.shiftKey) {
        this.onChange();
      } else {
        this.send();
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
    const req = JSON.parse(JSON.stringify(this.inDto)) as ChatCompletionStreamInDto;
    const inputArea = JSON.parse(JSON.stringify(this.inputArea)) as Message;
    req.args.messages.push(inputArea);
    this.chatServce.countTokens(req).subscribe({
      next: next => this.tokenObj = next
    });
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

  removeDoc(content: ChatCompletionContentPart[], $index: number): void {
    content.splice($index, 1);
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.onChange(), 500);
  }
  removeMessage($index: number): void {
    // if (confirm(`削除しますか？`)) {
    //   this.inDto.args.messages.splice($index, 1);
    // } else { /** 削除キャンセル */ }
    this.inDto.args.messages.splice($index, 1);
    this.onChange();
  }

  removeThread($event: MouseEvent, $index: number, thread: Thread): void {
    // this.stopPropagation($event);
    this.dialog.open(DialogComponent, { data: { title: 'スレッド削除', message: `このスレッドを削除しますか？\n「${thread.title.replace(/\n/g, '')}」`, options: ['削除', 'キャンセル'] } }).afterClosed().subscribe({
      next: next => {
        if (next === 0) {
          this.dbService.deleteByKey('threadList', (thread as any).id).subscribe({
            next: next => {
              this.threadList.splice($index, 1)
              if (thread === this.selectedThread) {
                this.clearInDto()
              } else { }
            }
          })
        } else { /** 削除キャンセル */ }
      }
    });
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }

  logout(): void {
    this.authServce.logout();
    this.router.navigate(['/login']);
  }
}
