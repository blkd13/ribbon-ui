import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscriber, defer, finalize, first, forkJoin, from, map, switchMap, tap } from 'rxjs';
import { CachedContent, ChatCompletionStreamInDto, Message, MessageForView } from '../models/models';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { Utils } from '../utils';
import { v4 as uuidv4 } from 'uuid';

/**
 * チャットサービス
 * ブラウザの同時コネクション数制限が6とかなので
 * イベントソースを毎回張るのではなくて1本にまとめる。
 * 
 * 認証情報はヘッダーに入れるため、new EventSource()ではなくXMLHttpRequestを使っている。
 */
@Injectable({ providedIn: 'root' })
export class ChatService {

  protected clientId!: string

  // データストリーム監視用のマップ
  protected subscriberMap: { [key: string]: Subscriber<string> } = {};

  protected subjectMap: { [key: string]: Subject<string> } = {};

  // 作成したデータストリームのテキストを保持するマップ
  protected textMap: { [key: string]: string } = {};

  protected openAiApiKey: Subject<string> = new BehaviorSubject('');

  constructor(private http: HttpClient, private authService: AuthService) {
    // 100回連続でAPIキーを取得する (APIの性能を測る目的)
    // [...Utils.range(100)].forEach((index) => { this.getOpenAiApiKey().subscribe(); });
    // 
    // 1回だけAPIキーを取得する（サーバー経由せずに直接OpenAIにアクセスするためのAPIキーを取得する） → 結局ダイレクトにアクセスが最速（50msとか）。サーバー経由だと遅い1秒とか。
    // this.getOpenAiApiKey().subscribe();
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
        observer.next(this.clientId);
        observer.complete();
      } else {
        const xhr = new XMLHttpRequest();
        // チャットスレッド用にUUIDを生成
        this.clientId = uuidv4();
        // ここはhttpclientを通さないからインターセプターが効かないので自分でパス設定する
        xhr.open('GET', `${environment.apiUrl}/user/event?connectionId=${this.clientId}`, true);
        xhr.setRequestHeader('Accept', 'text/event-stream');
        xhr.setRequestHeader('Authorization', `Bearer ${this.authService.getToken()}`);
        let cursor = 0;
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.OPENED) {
            // onopen のロジック
            console.log('Connected on open');
          } else if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
            // ヘッダー受信時のロジック
            console.log('Connected on headers received');
            observer.next(this.clientId);
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
                      const data = JSON.parse(line) as { data: { threadId: string, content: string } };
                      this.subjectMap[data.data.threadId].next(data.data.content);
                      this.textMap[data.data.threadId] += data.data.content;
                    } catch (e) {
                      // json parse error. エラー吐いてとりあえず無視
                      console.log(line);
                      console.error(e);
                    }
                  } else if (line.startsWith('[DONE] ')) {
                    // 終了通知受信時
                    const threadId = line.split(' ')[1];

                    // // ログ出力
                    // console.log(this.textMap[threadId]);

                    // 終了通知
                    this.subjectMap[threadId].complete();

                    // 監視オブジェクトを削除
                    delete this.subjectMap[threadId];
                    // ストリームが存在しなくなったら、XHRを中断する
                    if (Object.keys(this.subjectMap).length === 0) {
                      xhr.abort();
                      // チャットスレッド用にUUIDを生成
                      this.clientId = uuidv4();
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
                  const threadId = line.split(' ')[0];
                  line = line.substring(threadId.length + 1);
                  console.error(line);
                  // エラー通知
                  this.subjectMap[threadId].error(line);

                  // 監視オブジェクトを削除
                  delete this.subjectMap[threadId];

                  // ストリームが存在しなくなったら、XHRを中断する
                  if (Object.keys(this.subjectMap).length === 0) {
                    xhr.abort();
                    // チャットスレッド用にUUIDを生成
                    this.clientId = uuidv4();
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
            observer.next(this.clientId);
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
  chatCompletionObservableStream(inDto: ChatCompletionStreamInDto): Observable<string> {
    return new Observable<string>((observer) => {
      // スレッド用にUUIDを生成
      const threadId = Utils.generateUUID();

      // 監視オブジェクトを登録
      this.subscriberMap[threadId] = observer;
      this.textMap[threadId] = '';

      // EventSourceを開く
      this.open().subscribe((result) => {
        this.http.post<string>(`/user/chat-completion?connectionId=${this.clientId}&threadId=${threadId}`,
          inDto,
          { headers: this.authService.getHeaders() }).subscribe({
            next: (result) => {
              // console.log(result);
              // Handle response
              // eventSourceのイベントハンドラで処理するので何もしない
            },
            error: (error) => {
              // Handle error
              console.error(error);
              observer.error(error);
            },
          });
      });
    });
  }


  /**
   * リクエストを投げる。戻りはEventSourceから来る
   * @param inDto 
   * @param taskId 
   * @returns 
   */
  chatCompletionObservableStreamNew(inDto: ChatCompletionStreamInDto): Observable<{
    clientId: string,
    threadId: string,
    meta: { message?: MessageForView, status: string },
    observer: Observable<string>
  }> {
    const threadId = uuidv4();
    // ストリーム受け取り用のSubjectを生成
    const subject = new Subject<string>();
    this.subjectMap[threadId] = subject;
    this.textMap[threadId] = '';
    const streamObservable = subject.asObservable();

    return this.open().pipe(
      switchMap(clientId => this.http.post<{ message?: MessageForView, status: string }>(
        `/user/chat-completion?connectionId=${clientId}&threadId=${threadId}`,
        inDto,
        { headers: this.authService.getHeaders() }
      )),
      map(meta => ({ clientId: this.clientId, threadId, meta, observer: streamObservable }))
    );
  }


  /**
   * 翻訳タスク用の固定リクエストフォーム
   * @param text 
   * @param targetLanguage 
   * @returns 
   */
  chatTranslateObservableStream(text: string, targetLanguage: 'English' | 'Japanese' = 'English'): Observable<string> {
    const reqDto: ChatCompletionStreamInDto = {
      args: {
        messages: [
          { role: 'system', content: `Translate to ${targetLanguage}` } as any,
          { role: 'user', content: [{ type: 'text', text }] },
        ],
        model: 'gemini-1.5-flash',
        temperature: 0,
        stream: true,
      },
    };
    return this.chatCompletionObservableStream(reqDto);
  }

  /**
   * VertexAI Gemini用トークン数カウントAPI
   */
  countTokens(inDto: ChatCompletionStreamInDto): Observable<CountTokensResponse> {
    return this.http.post<CountTokensResponse>(`/count-tokens`, inDto, { headers: this.authService.getHeaders() });
  }

  /**
   * VertexAI Gemini用コンテキストキャッシュ作成API
   */
  createCache(inDto: ChatCompletionStreamInDto): Observable<CachedContent> {
    return this.http.post<CachedContent>(`/user/create-cache`, inDto, { headers: this.authService.getHeaders() });
  }

  calcDuration(inDto: ChatCompletionStreamInDto): Observable<ChatCompletionStreamInDto> {
    return forkJoin(inDto.args.messages.map(message => {
      return forkJoin(message.content.map(part => {
        return new Observable<void>((observerBit) => {
          if (part.type === 'image_url') {
            const base64String = part.image_url.url;
            if (base64String.startsWith('data:audio/') || base64String.startsWith('data:video/')) {
              const media = document.createElement(base64String.startsWith('audio/') ? 'audio' : 'video');
              media.preload = 'metadata';
              media.onloadedmetadata = () => {
                if (part.type === 'image_url') {
                  part.image_url.second = media.duration;
                } else { }
                observerBit.next();
                observerBit.complete();
              }
              media.src = base64String;
            } else {
              observerBit.next();
              observerBit.complete();
            }
            // return part.image_url.second;
          } else {
            observerBit.next();
            observerBit.complete();
            // return part.text.length;
          }
        });
      })
      );
    })).pipe(map(() => inDto));
  }

  messageToText(message: Message): string {
    return (typeof message.content === 'string')
      ? message.content
      : message.content.map(obj => obj.type === 'text' ? obj.text : '').join('');
  }
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