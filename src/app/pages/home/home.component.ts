import { from, mergeMap, of } from 'rxjs';
import { Component, ComponentRef, ElementRef, QueryList, ViewChild, ViewChildren, viewChild } from '@angular/core';
import { ChatPanelComponent } from '../../parts/chat/chat-panel.component';
import { FormsModule } from '@angular/forms';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatMenu, MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ChatCompletionContentPart, ChatCompletionContentPartImage, ChatCompletionContentPartText, ChatCompletionStreamInDto, Message, Thread } from '../../models/models';
import { ChatService, CountTokensResponse } from '../../services/chat.service';
import { FileDropDirective } from '../../parts/file-drop.directive';
import { NgxIndexedDBService } from 'ngx-indexed-db';
import { Observable, forkJoin, tap, toArray } from 'rxjs';
import { CommonModule } from '@angular/common';
import { DomUtils } from '../../utils/dom-utils';
import { DocTagComponent } from '../../parts/doc-tag/doc-tag.component';
import { ThreadDetailComponent } from '../../parts/thread-detail/thread-detail.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ChatPanelComponent, FileDropDirective, DocTagComponent,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatTooltipModule, MatSliderModule,
    MatMenuModule, MatDialogModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {

  // chatPanelList = viewChild.required(ChatPanelComponent);
  @ViewChildren(ChatPanelComponent)
  chatPanelList!: QueryList<ChatPanelComponent>;

  @ViewChild('textAreaElem')
  textAreaElem!: ElementRef<HTMLTextAreaElement>;

  @ViewChild('textBodyElem')
  textBodyElem!: ElementRef<HTMLDivElement>;

  inputArea: Message & { editable?: number, status?: number } = { role: 'user', content: [{ type: 'text', text: '' }] };
  inDto: ChatCompletionStreamInDto = this.initInDto();

  threadList: Thread[] = [];
  selectedThread: Thread | null = null;

  bitCounter = 0; // chatPanelにイベントを送るためだけのカウンタ


  allExpandCollapseFlag = true;
  constructor(
    private chatServce: ChatService,
    private dbService: NgxIndexedDBService,
    private dialog: MatDialog
  ) {
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
  clearInDto(): void {
    this.selectedThread = null;
    this.inDto = this.initInDto();
    this.onChange();
  }

  initInDto(): ChatCompletionStreamInDto {
    return {
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
    }
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
        const imagePart = part as ChatCompletionContentPartImage;
        imagePart.image_url.url = base64String;

        const contents = this.inputArea.content as ChatCompletionContentPart[];
        contents.push(part);
        // console.log(reader.result);
        // readFile(file: File, part: ChatCompletionContentPartImage) {
        // part.image_url.url = `data:image/${metaInfo.type === 'jpg' ? 'jpeg' : metaInfo.type};base64,${data.toString('base64')}`;
        // this.onChange();
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
  }

  save(thread: Thread | null): Observable<Thread> {
    if (thread) {
      thread.timestamp = Date.now();
      // 整形用にディープコピー
      const inDto = JSON.parse(JSON.stringify(this.inDto)) as ChatCompletionStreamInDto;
      inDto.args.messages = inDto.args.messages.map(obj => ({ role: obj.role, content: obj.content }));
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
      setTimeout(() => document.getElementById(`thread-title-${$index}`), 100);
    } else {
      thread.isEdit = false
      thread.title = thread.title || 'No name';
      this.save(thread).subscribe();
    }
  }

  duplicate($event: MouseEvent, thread: Thread): void {
    this.stopPropagation($event);
    const dupli = JSON.parse(JSON.stringify(thread)) as Thread;
    dupli.isEdit = false;
    dupli.title = thread.title + '_copy';
    dupli.timestamp = Date.now();
    this.threadList.push(dupli);
  }

  send(): void {
    // 入力エリアに何も書かれていない場合はスルーする
    if (this.inputArea.content[0].type === 'text' && this.inputArea.content[0].text) {
      this.inputArea.editable = 0;
      this.inDto.args.messages.push(this.inputArea);
    } else { }

    // 整形用にディープコピー
    const inDto = JSON.parse(JSON.stringify(this.inDto)) as ChatCompletionStreamInDto;
    inDto.args.messages = inDto.args.messages.map(obj => ({ role: obj.role, content: obj.content }));

    // db更新
    this.save(this.selectedThread).subscribe({
      next: next => {
        if (next.title) {
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
          }).pipe(tap(text => next.title += text)).subscribe({
            next: next => {
              this.save(this.selectedThread).subscribe();
            }
          });
        }
      }
    });

    // 入力エリアをクリア
    this.inputArea = { role: 'user', content: [{ type: 'text', text: '' }], editable: 1, status: 2 } as Message;

    // レスポンス受け用オブジェクトを作っておく
    const res = { role: 'assistant', content: [{ type: 'text', text: '' }], status: 0 };
    this.inDto.args.messages.push(res as Message);
    this.isLock = true;


    for (const a in [0]) {
      this.chatServce.chatCompletionObservableStream(inDto).subscribe({
        next: text => {
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
        },
        complete: () => {
          // db更新
          this.save(this.selectedThread).subscribe();

          this.isLock = false;
          res.status = 2;
          setTimeout(() => { this.textAreaElem.nativeElement.focus(); }, 100);
        }
      });
    }
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
    if ($event.key === 'Enter') {
      if ($event.ctrlKey) {
        this.send();
      } else {
        // 改行のタイミングでトークンカウント
        this.onChange();
      }
    } else {
      // 最後のキー入力から1000秒後にonChangeが動くようにする。1000秒経たずにここに来たら前回のタイマーをキャンセルする
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => this.onChange(), 1000);
    }
  }

  charCount = 0;
  tokenObj: CountTokensResponse = { totalTokens: 0, totalBillableCharacters: 0 };
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
    this.stopPropagation($event);
    if (confirm(`このスレッドを削除しますか？\n${thread.title}`)) {
      this.dbService.deleteByKey('threadList', (thread as any).id).subscribe({
        next: next => {
          this.threadList.splice($index, 1);
          if (thread === this.selectedThread) {
            this.clearInDto();
          }
        }
      });
    } else { /** 削除キャンセル */ }
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
