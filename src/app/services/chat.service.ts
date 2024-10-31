import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscriber, defer, finalize, first, forkJoin, from, map, switchMap, tap } from 'rxjs';
import { CachedContent, ChatCompletionStreamInDto, GenerateContentRequestForCache } from '../models/models';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageForView, MessageUpsertResponseDto } from '../models/project-models';

export interface ChatInputArea {
  role: 'system' | 'user' | 'assistant';
  content: ChatContent[];
  previousMessageId?: string;
  messageGroupId?: string;
}
export type ChatContent = ({ type: 'text', text: string } | { type: 'file', text: string, fileId: string });


/**
 * チャットサービス
 * ブラウザの同時コネクション数制限が6とかなので
 * イベントソースを毎回張るのではなくて1本にまとめる。
 * 
 * 認証情報はヘッダーに入れるため、new EventSource()ではなくXMLHttpRequestを使っている。
 */
@Injectable({ providedIn: 'root' })
export class ChatService {

  protected connectionId!: string

  protected messageIdStreamIdMap: { [messageId: string]: string[] } = {};

  // データストリーム監視用のマップ
  protected subjectMap: { [streamId: string]: Subject<string> } = {};

  // 作成したデータストリームのテキストを保持するマップ
  protected textMap: { [streamId: string]: string } = {};

  protected openAiApiKey: Subject<string> = new BehaviorSubject('');

  readonly http: HttpClient = inject(HttpClient);
  readonly authService: AuthService = inject(AuthService);

  // 100回連続でAPIキーを取得する (APIの性能を測る目的)
  // [...Utils.range(100)].forEach((index) => { this.getOpenAiApiKey().subscribe(); });
  // 
  // 1回だけAPIキーを取得する（サーバー経由せずに直接OpenAIにアクセスするためのAPIキーを取得する） → 結局ダイレクトにアクセスが最速（50msとか）。サーバー経由だと遅い1秒とか。
  // this.getOpenAiApiKey().subscribe();

  public getObserver(messageId: string): { text: string, observer: Subject<string> | null } {
    const streamIdList = this.messageIdStreamIdMap[messageId];
    if (streamIdList) {
      return {
        text: this.textMap[streamIdList[streamIdList.length - 1]],
        observer: this.subjectMap[streamIdList[streamIdList.length - 1]],
      };
    } else {
      return { text: '', observer: null, };
    }
  }

  /**
   * ChatGPTのSSEを参考に作った。
   * SSEを受け取ってスレッドID毎に選り分けて投げる
   * @returns 
   */
  private open(): Observable<string> {
    return new Observable<string>((observer) => {
      if (Object.keys(this.subjectMap).length > 1) {
        console.log('Already exists stream');
        observer.next(this.connectionId);
        observer.complete();
      } else {
        const xhr = new XMLHttpRequest();
        // チャットスレッド用にUUIDを生成
        this.connectionId = uuidv4();
        // ここはhttpclientを通さないからインターセプターが効かないので自分でパス設定する
        xhr.open('GET', `${environment.apiUrl}/user/event?connectionId=${this.connectionId}`, true);
        xhr.setRequestHeader('Accept', 'text/event-stream');
        // xhr.setRequestHeader('Authorization', `Bearer ${this.authService.getToken()}`);
        let cursor = 0;
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.OPENED) {
            // onopen のロジック
            console.log('Connected on open');
          } else if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
            // ヘッダー受信時のロジック
            console.log('Connected on headers received');
            observer.next(this.connectionId);
            observer.complete();
          } else if (xhr.readyState === XMLHttpRequest.LOADING) {
            // データ受信中のロジック（onmessage）
            if (xhr.responseText.endsWith('\n\n')) {
              xhr.responseText.slice(cursor).split('\n').forEach((line) => {
                if (line.startsWith('data: ')) {
                  line = line.replace(/^data: /gm, '');
                  if (line.startsWith('{') && line.endsWith('}')) {
                    // json object 受信時
                    try {
                      const data = JSON.parse(line) as { data: { streamId: string, content: string } };
                      this.subjectMap[data.data.streamId].next(data.data.content);
                      this.textMap[data.data.streamId] += data.data.content;
                    } catch (e) {
                      // json parse error. エラー吐いてとりあえず無視
                      console.log(line);
                      console.error(e);
                    }
                  } else if (line.startsWith('[DONE] ')) {
                    // 終了通知受信時
                    const streamId = line.split(' ')[1];

                    // // ログ出力
                    // console.log(this.textMap[streamId]);

                    // 終了通知
                    this.subjectMap[streamId].complete();

                    // 監視オブジェクトを削除
                    delete this.subjectMap[streamId];
                    // ストリームが存在しなくなったら、XHRを中断する
                    if (Object.keys(this.subjectMap).length === 0) {
                      xhr.abort();
                      // チャットスレッド用にUUIDを生成
                      this.connectionId = uuidv4();
                    } else {
                      // 何もしない
                    }
                  } else if (!line) {
                    // 空行の場合は無視
                  } else {
                    // その他のメッセージ受信時
                    console.log(line);
                  }
                } else if (line.startsWith('error: ')) {
                  line = line.replace(/^error: /gm, '');
                  const streamId = line.split(' ')[0];
                  line = line.substring(streamId.length + 1);
                  console.error(line);
                  // エラー通知
                  this.subjectMap[streamId].error(line);

                  // 監視オブジェクトを削除
                  delete this.subjectMap[streamId];

                  // ストリームが存在しなくなったら、XHRを中断する
                  if (Object.keys(this.subjectMap).length === 0) {
                    xhr.abort();
                    // チャットスレッド用にUUIDを生成
                    this.connectionId = uuidv4();
                  } else {
                    // 何もしない
                  }
                } else if (line) {
                  // その他のメッセージ受信時
                  console.log(line);
                } else {
                  // 空行の場合は無視
                }
              });
              cursor = xhr.responseText.length;
            } else {
              // \n\n で終わっていない場合は読み取り途中のためカーソルをそのままにしておく
              console.log('not end with \\n\\n');
            }
          } else if (xhr.readyState === XMLHttpRequest.DONE) {
            console.log('Connected on done');
            observer.next(this.connectionId);
            observer.complete();
            // リクエスト完了時のロジック（onerror または oncomplete）
            Object.entries(this.subjectMap).forEach(([key, value]) => {
              if (value.closed) {
              } else {
                // value.error();
                value.error('Connection closed');
              }
            });
          } else {
            console.log('Connected on else');
          }
        };
        xhr.send();
      }
    }).pipe(first());
  }

  /**
   * リクエストを投げる。戻りはEventSourceから来る
   * @param inDto 
   * @param taskId 
   * @returns 
   */
  // chatCompletionObservableStream(inDto: ChatCompletionStreamInDto): Observable<string> {
  //   return new Observable<string>((observer) => {
  //     // スレッド用にUUIDを生成
  //     const streamId = Utils.generateUUID();

  //     // 監視オブジェクトを登録
  //     // this.subscriberMap[streamId] = observer;
  //     this.textMap[streamId] = '';

  //     // EventSourceを開く
  //     this.open().subscribe((result) => {
  //       this.http.post<string>(`/user/chat-completion?connectionId=${this.connectionId}&streamId=${streamId}`,
  //         inDto,
  //         { headers: this.authService.getHeaders() }).subscribe({
  //           next: (result) => {
  //             // console.log(result);
  //             // Handle response
  //             // eventSourceのイベントハンドラで処理するので何もしない
  //           },
  //           error: (error) => {
  //             // Handle error
  //             console.error(error);
  //             observer.error(error);
  //           },
  //         });
  //     });
  //   });
  // }


  /**
   * リクエストを投げる。戻りはEventSourceから来る
   * @param inDto 
   * @param taskId 
   * @returns 
   */
  chatCompletionObservableStreamNew(inDto: ChatCompletionStreamInDto): Observable<{
    connectionId: string,
    streamId: string,
    meta: { message?: Message, status: string },
    observer: Observable<string>
  }> {
    const streamId = uuidv4();
    // ストリーム受け取り用のSubjectを生成
    const subject = new Subject<string>();
    this.subjectMap[streamId] = subject;
    this.textMap[streamId] = '';
    const streamObservable = subject.asObservable();

    return this.open().pipe(
      switchMap(connectionId => this.http.post<{ message?: MessageForView, status: string }>(
        `/user/chat-completion?connectionId=${connectionId}&streamId=${streamId}`,
        inDto,
        // { headers: this.authService.getHeaders() }
      )),
      map(meta => ({ connectionId: this.connectionId, streamId, meta, observer: streamObservable }))
    );
  }

  chatCompletionObservableStreamByProjectModel(messageId: string): Observable<{
    connectionId: string,
    streamId: string,
    observer: Observable<string>,
    meta: MessageUpsertResponseDto,
  }> {
    const streamId = uuidv4();
    // ストリーム受け取り用のSubjectを生成
    const subject = new Subject<string>();
    this.subjectMap[streamId] = subject;
    this.textMap[streamId] = '';
    const streamObservable = subject.asObservable();

    return this.open().pipe(
      switchMap(connectionId => this.http.post<MessageUpsertResponseDto>(
        `/user/v2/chat-completion?connectionId=${connectionId}&streamId=${streamId}&messageId=${messageId}`,
        {},
        // { headers: this.authService.getHeaders() }
      )),
      tap(resDto => {
        // メッセージIdマップを作っておくf
        if (this.messageIdStreamIdMap[resDto.message.id]) {
        } else {
          this.messageIdStreamIdMap[resDto.message.id] = [];
        }
        this.messageIdStreamIdMap[resDto.message.id].push(streamId);
      }),
      map(resDto => ({ connectionId: this.connectionId, streamId, meta: resDto, observer: streamObservable }))
    );
  }

  /**
   * 翻訳タスク用の固定リクエストフォーム
   * @param text 
   * @param targetLanguage 
   * @returns 
   */
  // chatTranslateObservableStream(text: string, targetLanguage: 'English' | 'Japanese' = 'English'): Observable<string> {
  //   const reqDto: ChatCompletionStreamInDto = {
  //     args: {
  //       messages: [
  //         { role: 'system', content: `Translate to ${targetLanguage}` } as any,
  //         { role: 'user', content: [{ type: 'text', text }] },
  //       ],
  //       model: 'gemini-1.5-flash',
  //       temperature: 0,
  //       stream: true,
  //     },
  //   };
  //   return this.chatCompletionObservableStreamNew(reqDto);
  // }

  /**
   * VertexAI Gemini用トークン数カウントAPI
   */
  countTokens(inDto: ChatCompletionStreamInDto): Observable<CountTokensResponse> {
    return this.http.post<CountTokensResponse>(`/count-tokens`, inDto);
  }

  countTokensByProjectModel(inDto: ChatInputArea[], messageId: string = ''): Observable<CountTokensResponse> {
    return this.http.post<CountTokensResponse>(`/user/v2/count-tokens?${messageId ? 'messageId=' + messageId : ''}`, inDto);
  }

  /**
   * VertexAI Gemini用コンテキストキャッシュ作成API
   */
  createCache(inDto: ChatCompletionStreamInDto): Observable<CachedContent> {
    return this.http.post<CachedContent>(`/user/create-cache`, inDto);
  }

  /**
   * VertexAI Gemini用コンテキストキャッシュ作成API
   */
  createCacheByProjectModel(model: string, messageId: string, inDto: GenerateContentRequestForCache): Observable<CachedContent> {
    return this.http.post<CachedContent>(`/user/v2/cache?model=${model}&${messageId ? 'messageId=' + messageId : ''}`, inDto);
  }

  updateCacheByProjectModel(threadId: string, inDto: GenerateContentRequestForCache): Observable<CachedContent> {
    return this.http.patch<CachedContent>(`/user/v2/cache?threadId=${threadId}`, inDto);
  }

  deleteCacheByProjectModel(threadId: string): Observable<CachedContent> {
    return this.http.delete<CachedContent>(`/user/v2/cache?threadId=${threadId}`);
  }

  // calcDuration(inDto: ChatCompletionStreamInDto): Observable<ChatCompletionStreamInDto> {
  //   return forkJoin(inDto.args.messages.map(message => {
  //     return forkJoin(message.content.map(part => {
  //       return new Observable<void>((observerBit) => {
  //         if (part.type === 'image_url') {
  //           const base64String = part.image_url.url;
  //           if (base64String.startsWith('data:audio/') || base64String.startsWith('data:video/')) {
  //             const media = document.createElement(base64String.startsWith('audio/') ? 'audio' : 'video');
  //             media.preload = 'metadata';
  //             media.onloadedmetadata = () => {
  //               if (part.type === 'image_url') {
  //                 part.image_url.second = media.duration;
  //               } else { }
  //               observerBit.next();
  //               observerBit.complete();
  //             }
  //             media.src = base64String;
  //           } else {
  //             observerBit.next();
  //             observerBit.complete();
  //           }
  //           // return part.image_url.second;
  //         } else {
  //           observerBit.next();
  //           observerBit.complete();
  //           // return part.text.length;
  //         }
  //       });
  //     })
  //     );
  //   })).pipe(map(() => inDto));
  // }
}
/**
 * Response returned from countTokens method.
 */
export declare interface CountTokensResponse {
  /**
   * The total number of tokens counted across all instances from the request.
   */
  totalTokens: number;
  /**
   * Optional. The total number of billable characters counted across all
   * instances from the request.
   */
  totalBillableCharacters?: number;

  text: number;
  audio: number;
  video: number;
  image: number;
}