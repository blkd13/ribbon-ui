import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscriber, defer, finalize, first, forkJoin, from, map, switchMap, tap } from 'rxjs';
import { OpenAI } from 'openai';

import { CachedContent, ChatCompletionCreateParamsWithoutMessages, ChatCompletionStreamInDto, GenerateContentRequestForCache } from '../models/models';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageForView, MessageGroupForView } from '../models/project-models';
import { Utils } from '../utils';
import { ToolCallPartCommand, ToolCallPartCommandBody, ToolCallService } from './tool-call.service';

export interface ChatInputArea {
  role: OpenAI.ChatCompletionRole;
  content: ChatContent[];
  // previousMessageGroupId?: string;
  messageGroupId?: string;
}
export type ChatContent = ({ type: 'text', text: string } | { type: 'file', text: string, fileGroupId: string });
// export interface ContentPart extends BaseEntity {
//   messageId: UUID;
//   type: ContentPartType;
//   seq: number;
//   text?: string;
//   fileId?: string;
// }
export type LlmModel = {
  tag: string;
  isEnable: boolean;
  class: string;
  maxTokens: number;
  maxInputTokens: number;
  isGSearch: boolean;
  isDomestic: boolean;
  isPdf: boolean;
  price: number[];
  id: string;
}

/**
 * チャットサービス
 * ブラウザの同時コネクション数制限が6とかなので
 * イベントソースを毎回張るのではなくて1本にまとめる。
 *
 * 認証情報はヘッダーに入れるため、new EventSource()ではなくXMLHttpRequestを使っている。
 */
@Injectable({ providedIn: 'root' })
export class ChatService {

  /**
   * gemini は 1,000 [文字] あたりの料金
   * claude は 1,000 [トークン] あたりの料金
   * 入力、出力、128kトークン以上時の入力、128kトークン以上時の出力
   */
  modelList: LlmModel[] = [
    { tag: '賢い', class: 'wiz', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: true, isDomestic: false, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-2.0-flash-001', },
    { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 8192, maxInputTokens: 2000000, isGSearch: true, isDomestic: true, isPdf: true, price: [0.00031250, 0.001250, 0.0006250, 0.002500], id: 'gemini-1.5-pro-002', },

    { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 8192, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-5-sonnet-20241022', },
    // { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 8192, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-5-sonnet-v2@20241022', },
    { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 128000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-7-sonnet-20250219', },
    { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 128000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-7-sonnet-thinking-20250219', },
    // { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 128000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-7-sonnet@20250219', },
    // { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 128000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-7-sonnet-thinking@20250219', },
    // { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 128000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-7-sonnet', },
    { tag: '賢い', class: 'wis', isEnable: true, maxTokens: 4096, maxInputTokens: 128000, isGSearch: false, isDomestic: true, isPdf: true, price: [0.00500000, 0.015000, 0.0050000, 0.015000], id: 'gpt-4o', },

    { tag: '賢遅', class: 'wis', isEnable: true, maxTokens: 100000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.01650000, 0.066000, 0.0165000, 0.066000], id: 'o1', },
    { tag: '賢遅', class: 'wis', isEnable: true, maxTokens: 100000, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00110000, 0.004400, 0.0011000, 0.004400], id: 'o3-mini', },

    { tag: '実験', class: 'exp', isEnable: true, maxTokens: 8192, maxInputTokens: 2000000, isGSearch: true, isDomestic: false, isPdf: true, price: [0.00012500, 0.000375, 0.0002500, 0.000750], id: 'gemini-2.0-pro-exp-02-05', },
    { tag: '実験', class: 'exp', isEnable: true, maxTokens: 64000, maxInputTokens: 1000000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-2.0-flash-thinking-exp-01-21', },

    { tag: '速い', class: 'min', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00003750, 0.000150, 0.0000750, 0.001500], id: 'gemini-2.0-flash-lite-preview-02-05', },

    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 2000000, isGSearch: true, isDomestic: true, isPdf: true, price: [0.00031250, 0.001250, 0.0006250, 0.002500], id: 'gemini-1.5-pro', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: true, isDomestic: true, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-1.5-flash', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 32768, isGSearch: true, isDomestic: true, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-1.5-flash-002', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: true, isDomestic: false, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-2.0-flash-exp', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: true, isDomestic: false, isPdf: true, price: [0.00012500, 0.000375, 0.0001250, 0.000375], id: 'gemini-exp-1206', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 32767, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-2.0-flash-thinking-exp-1219', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 32768, maxInputTokens: 128000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.01650000, 0.066000, 0.0165000, 0.066000], id: 'o1-preview', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: false, isDomestic: true, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-flash-experimental', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 2000000, isGSearch: false, isDomestic: true, isPdf: true, price: [0.00031250, 0.001250, 0.0006250, 0.002500], id: 'gemini-pro-experimental', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 32760, isGSearch: false, isDomestic: true, isPdf: true, price: [0.00012500, 0.000375, 0.0001250, 0.000375], id: 'gemini-1.0-pro', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 16384, isGSearch: false, isDomestic: true, isPdf: true, price: [0.00012500, 0.000375, 0.0001250, 0.000375], id: 'gemini-1.0-pro-vision', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 1000000, isGSearch: true, isDomestic: true, isPdf: true, price: [0.00001875, 0.000075, 0.0000375, 0.000750], id: 'gemini-1.5-flash-001', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 2000000, isGSearch: true, isDomestic: true, isPdf: true, price: [0.00031250, 0.001250, 0.0006250, 0.002500], id: 'gemini-1.5-pro-001', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 8192, maxInputTokens: 200000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00300000, 0.015000, 0.0030000, 0.015000], id: 'claude-3-5-sonnet@20240620', },
    { tag: '古い', class: 'old', isEnable: true, maxTokens: 4096, maxInputTokens: 8000, isGSearch: false, isDomestic: false, isPdf: true, price: [0.00100000, 0.015000, 0.0010000, 0.015000], id: 'meta/llama3-405b-instruct-maas', },
    // { tag: '独特', maxTokens: 4096, maxInputTokens: 8000, isDomestic:true,isGSearch:true,isPdf:true, price: [0.00100000, 0.015000, 0.0010000, 0.015000], id: 'meta/llama3-405b-instruct-maas', },
  ];
  modelMap: { [modelId: string]: LlmModel } = Object.fromEntries(this.modelList.map(model => [model.id, model]));

  defaultSystemPrompt = 'AI アシスタント';
  // defaultSystemPrompt = Utils.trimLines(`
  //   AI アシスタント

  //   ## 標準的な出力フォーマット

  //   この後、特に指示がない限り以下のフォーマットで出力してください。

  //   - markdown形式
  //   - ファイル出力する際はブロックの先頭にファイル名をフルパスで埋め込んでください（例：\`\`\`typescript src/app/filename.ts\n...\n\`\`\` ）
  //   - 数式を書く際はkatexが反応する形式で書いてください（例：$...$）。
  // `);

  protected connectionId!: string;

  protected messageIdStreamIdMap: { [messageId: string]: string[] } = {};

  // データストリーム監視用のマップ
  protected subjectMap: { [streamId: string]: Subject<OpenAI.ChatCompletionChunk> } = {};

  // 作成したデータストリームのテキストを保持するマップ
  protected textMap: { [streamId: string]: string } = {};

  protected openAiApiKey: Subject<string> = new BehaviorSubject('');

  readonly http: HttpClient = inject(HttpClient);
  readonly authService: AuthService = inject(AuthService);

  checkOkModels = new Set<string>();

  validateModelAttributes(modelList: string[]): { isNotPdf?: string[], isNotDomestic?: string[], message: string } {
    const ret: { isNotPdf?: string[], isNotDomestic?: string[], message: string } = { message: '' };
    const modelMas = Object.fromEntries(this.modelList.map(model => [model.id, model]));

    modelList.forEach(model => {
      // if (this.checkOkModels.has(model)) {
      //   // 既にアラート出したことのあるモデルは除外。
      //   return;
      // } else { }

      // Check if the model is not a PDF
      if (!modelMas[model].isPdf) {
        if (!ret.isNotPdf) {
          ret.isNotPdf = []; // Initialize the array if not already done
        } else { }
        ret.isNotPdf.push(model); // Add the model to isNotPdf
      } else { }

      // Check if the model is not domestic
      if (!modelMas[model].isDomestic) {
        if (!ret.isNotDomestic) {
          ret.isNotDomestic = []; // Initialize the array if not already done
        } else { }
        ret.isNotDomestic.push(model); // Add the model to isNotDomestic
      } else { }
      this.checkOkModels.add(model);
    });


    if (Object.keys(ret).length > 0) {
      let message = '';
      if (ret.isNotDomestic) {
        const modelList = ret.isNotDomestic.map(model => `・${model}`).join('\n');
        message += `以下のモデルは海外リージョンを利用します。\n個人情報は絶対に入力しないでください。\n${modelList}\n\n`;
      } else { }
      if (ret.isNotPdf) {
        const modelList = ret.isNotPdf.map(model => `・${model}`).join('\n');
        message += `以下のモデルはPDF/Word/PowerPointが未対応です。\nもし入れた場合は無視されますのでご認識ください。\nテキスト（各種ソースコード等）、画像(png/jpg/etc...）は利用できます。\n${modelList}\n\n`;
      } else { }
      ret.message = message;
    } else {
      // アラート不用
    }

    return ret; // Return the result object
  }

  // 100回連続でAPIキーを取得する (APIの性能を測る目的)
  // [...Utils.range(100)].forEach((index) => { this.getOpenAiApiKey().subscribe(); });
  //
  // 1回だけAPIキーを取得する（サーバー経由せずに直接OpenAIにアクセスするためのAPIキーを取得する） → 結局ダイレクトにアクセスが最速（50msとか）。サーバー経由だと遅い1秒とか。
  // this.getOpenAiApiKey().subscribe();

  public getObserver(messageId: string): { text: string, observer: Subject<OpenAI.ChatCompletionChunk> | null } {
    const streamIdList = this.messageIdStreamIdMap[messageId];
    if (streamIdList) {
      const streamId = `${streamIdList.at(-1)}|${messageId}`;
      return { text: this.textMap[streamId], observer: this.subjectMap[streamId], };
    } else {
      return { text: '', observer: null, };
    }
  }

  // 通信中かどうかのフラグ
  flag = false;

  /**
   * ChatGPTのSSEを参考に作った。
   * SSEを受け取ってスレッドID毎に選り分けて投げる
   * @returns
   */
  private open(flag: boolean): Observable<string> {
    return new Observable<string>((observer) => {
      if (!flag) {
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
                      const { data } = JSON.parse(line) as { data: { streamId: string, content: OpenAI.ChatCompletionChunk } };
                      this.subjectMap[data.streamId].next(data.content);
                      this.textMap[data.streamId] += data.content;
                    } catch (e) {
                      // json parse error. エラー吐いてとりあえず無視
                      console.log(line);
                      console.error(e);
                    }
                  } else if (line.startsWith('[DONE] ')) {

                    // 分割されたメッセージの結合
                    const lineSplit = line.split(' ');

                    // 終了通知受信時
                    const streamId = lineSplit[1];

                    // // ログ出力
                    // console.log(this.textMap[streamId]);

                    // 終了通知
                    this.subjectMap[streamId].complete();

                    // 監視オブジェクトを削除
                    delete this.subjectMap[streamId];
                    if (streamId.split('|').length > 1) {
                      delete this.subjectMap[streamId.split('|')[0]];
                    } else { }
                    // ストリームが存在しなくなったら、XHRを中断する
                    if (Object.keys(this.subjectMap).length === 0) {
                      this.flag = false;
                      // チャットスレッド用にUUIDを生成
                      this.connectionId = uuidv4();
                      xhr.abort();
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

                  // 分割されたメッセージの結合
                  const lineSplit = line.split(' ');

                  // エラー通知受信時
                  const streamId = lineSplit[0];

                  line = line.substring(streamId.length + 1);
                  console.error(line);
                  // エラー通知
                  this.subjectMap[streamId].error(line);

                  // 監視オブジェクトを削除
                  delete this.subjectMap[streamId];
                  if (streamId.split('|').length > 1) {
                    delete this.subjectMap[streamId.split('|')[0]];
                  } else { }

                  // ストリームが存在しなくなったら、XHRを中断する
                  if (Object.keys(this.subjectMap).length === 0) {
                    this.flag = false;
                    // チャットスレッド用にUUIDを生成
                    this.connectionId = uuidv4();
                    xhr.abort();
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
   * リクエストを投げる。戻りはEventSourceから来る。
   * タイトル設定用のメソッドなのでメッセージの実体を持つ。
   * @param inDto
   * @param taskId
   * @returns
   */
  chatCompletionObservableStreamNew(inDto: ChatCompletionStreamInDto): Observable<{
    connectionId: string,
    streamId: string,
    meta: { message?: Message, status: string },
    observer: Observable<OpenAI.ChatCompletionChunk>
  }> {
    const streamId = uuidv4();
    // ストリーム受け取り用のSubjectを生成
    const subject = new Subject<OpenAI.ChatCompletionChunk>();
    this.subjectMap[streamId] = subject;
    this.textMap[streamId] = '';
    const streamObservable = subject.asObservable();

    let flag = false;
    if (this.flag) {
      flag = false;
    } else {
      flag = true;
      this.flag = true;
    }
    return this.open(flag).pipe(
      switchMap(connectionId => this.http.post<{ message?: MessageForView, status: string }>(
        `/user/chat-completion?connectionId=${connectionId}&streamId=${streamId}`,
        inDto,
        // { headers: this.authService.getHeaders() }
      )),
      map(meta => ({ connectionId: this.connectionId, streamId, meta, observer: streamObservable }))
    );
  }

  // /**
  //  * リクエストを投げる。戻りはEventSourceから来る。
  //  * プロジェクトモデル用のメソッドなのでメッセージの実体を持たない（メッセージIDのみ）
  //  * @param inDto
  //  * @param taskId
  //  * @returns
  //  * @see chatCompletionObservableStreamByProjectModel
  //  */
  // chatCompletionObservableStreamByProjectModel000(
  //   args: ChatCompletionCreateParamsWithoutMessages,
  //   idType: 'message' | 'messageGroup' | 'thread' | 'threadGroup',
  //   id: string,
  // ): Observable<{
  //   connectionId: string,
  //   streamId: string,
  //   observer: Observable<string>,
  //   meta: MessageUpsertResponseDto[],
  // }> {
  //   const streamId = uuidv4();
  //   // ストリーム受け取り用のSubjectを生成
  //   const subject = new Subject<string>();
  //   this.subjectMap[streamId] = subject;
  //   this.textMap[streamId] = '';
  //   const streamObservable = subject.asObservable();
  //   return this.open().pipe(
  //     switchMap(connectionId => this.http.post<MessageUpsertResponseDto[]>(
  //       `/user/v2/chat-completion?connectionId=${connectionId}&streamId=${streamId}&type=${idType}&id=${id}`,
  //       { args },
  //       // { headers: this.authService.getHeaders() }
  //     )),
  //     tap(resDtoList => {
  //       resDtoList.forEach(resDto => {
  //         // メッセージIdマップを作っておく
  //         if (this.messageIdStreamIdMap[resDto.message.id]) {
  //         } else {
  //           this.messageIdStreamIdMap[resDto.message.id] = [];
  //         }
  //         this.messageIdStreamIdMap[resDto.message.id].push(streamId);
  //       });
  //     }),
  //     map(resDtoList => ({ args, connectionId: this.connectionId, streamId, meta: resDtoList, observer: streamObservable }))
  //   );
  // }

  /**
   * リクエストを投げる。戻りはEventSourceから来る。
   * プロジェクトモデル用のメソッドなのでメッセージの実体を持たない（メッセージIDのみ）
   * @param inDto
   * @param taskId
   * @returns
   * @see chatCompletionObservableStreamByProjectModel
   */
  chatCompletionObservableStreamByProjectModel(
    args: ChatCompletionCreateParamsWithoutMessages,
    idType: 'threadGroup' | 'thread' | 'messageGroup' | 'message' | 'contentPart',
    id: string,
    toolCallPartCommandList?: ToolCallPartCommand[],
  ): Observable<{
    connectionId: string,
    streamId: string,
    messageGroupList: MessageGroupForView[],
  }> {
    const streamId = uuidv4();

    // ストリーム開いてるか開いてないかで新たにストリーム開くかをコントロールするフラグ
    let flag = false;
    if (this.flag) {
      flag = false;
    } else {
      flag = true;
      this.flag = true;
    }

    // メッセージ用ストリームが来る前にタイトル用のストリームが閉じるとバグるので、ダミーとしてストリームを開いておく
    // つまり、ストリーム開いてるかの判定をするブロックの中でthis.subjectMapに登録しないと、つるっと抜ける可能性がある。
    const subject = new Subject<OpenAI.ChatCompletionChunk>();
    this.subjectMap[streamId] = subject;
    this.textMap[streamId] = '';
    return this.open(flag).pipe(
      switchMap(connectionId => this.http.post<MessageGroupForView[]>(
        `/user/v2/chat-completion?connectionId=${connectionId}&streamId=${streamId}&type=${idType}&id=${id}`,
        { args, toolCallPartCommandList },
        // { headers: this.authService.getHeaders() }
      )),
      map(messageGroupList => messageGroupList.map(messageGroup => {
        messageGroup.messages.forEach(message => {
          // ストリーム受け取り用のSubjectを生成
          const subject = new Subject<OpenAI.ChatCompletionChunk>();
          this.subjectMap[`${streamId}|${message.id}`] = subject;
          this.textMap[`${streamId}|${message.id}`] = '';
          // メッセージIdマップを作っておく
          if (this.messageIdStreamIdMap[message.id]) {
          } else {
            this.messageIdStreamIdMap[message.id] = [];
          }
          this.messageIdStreamIdMap[message.id].push(streamId);
          message.observer = subject.asObservable();
        });
        return messageGroup;
      })),
      map(messageGroupList => { return { connectionId: this.connectionId, streamId, messageGroupList } })
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

  countTokensByProjectModel(inDto: ChatInputArea[], type: 'message' | 'messageGroup', id: string = ''): Observable<CountTokensResponse> {
    let query = '';
    if (id.startsWith('dummy-')) {
      query = ``;
    } else if (type === 'message') {
      query = `&id=${id}`;
    } else if (type === 'messageGroup') {
      query = `&id=${id}`;
    }
    return this.http.post<CountTokensResponse>(`/user/v2/count-tokens?type=${type}${query}`, inDto);
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
  createCacheByProjectModel(model: string, id: string, type: 'messageGroup', inDto: GenerateContentRequestForCache): Observable<CachedContent> {
    let query = '';
    if (id.startsWith('dummy-')) {
      query = ``;
      // } else if (type === 'message') {
      //   query = `&id=${id}`;
    } else if (type === 'messageGroup') {
      query = `&id=${id}`;
    }
    return this.http.post<CachedContent>(`/user/v2/cache?model=${model}&type=${type}${query}`, inDto);
  }

  updateCacheByProjectModel(threadGroupId: string, inDto: GenerateContentRequestForCache): Observable<CachedContent> {
    return this.http.patch<CachedContent>(`/user/v2/cache?threadGroupId=${threadGroupId}`, inDto);
  }

  deleteCacheByProjectModel(threadGroupId: string): Observable<CachedContent> {
    return this.http.delete<CachedContent>(`/user/v2/cache?threadGroupId=${threadGroupId}`);
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

  presetDefs: PresetDef[] = [
    { label: '通常' },
    { label: 'エラー<br/>解説', userPrompt: `以下のエラーについて、日本語で内容を解説してください。\n\n` },
    { label: '要約', userPrompt: '要約してください。\n\n' },
    {
      label: 'Matter<br/>most',
      tool_choice: 'auto',
      tool_names: [],
      tool_groups: ['mattermost'],
      tool_clear: true,
      modelSelection: ['claude-3-7-sonnet@20250219', 'gemini-2.0-pro-exp-02-05', 'gpt-4o', 'gemini-1.5-pro-002'],
      systemLabel: `Mattermost`,
      systemPrompt: Utils.trimLines(`
        エージェントAI。
        言われたことをするだけでなく、最高のパフォーマンスを出すために不明点があれば必要に応じてユーザーに質問し、付加価値の高い情報提供に努める。
      `),
      userPrompt: Utils.trimLines(`メンションからタスクを抽出して分類して分かりやすくまとめてください。リンクもつけて下さい。
        例）
        ## 案件名
        1. タイトル
          投稿者: （投稿者の名前）
          日時: yyyy年MM月dd日 hh:mm
          内容: （内容の要約）
          リンク: 投稿リンク
          分類: 質問
      `),
      // ✅ ** mattermost検索が必要になった場合の注意
      // - 基本的にはメンションされた投稿をソースとする。
      // - 複雑な条件指定が必要な場合はチャネルやチームを指定して検索する。
      // - Mattermostの投稿を表示する際は投稿へのリンクを併記する。
    },
    {
      label: `Box<br/>検索`,
      tool_choice: 'auto',
      tool_names: [],
      tool_groups: ['box'],
      tool_clear: true, // ツール選択状態をクリアしたうえで再設定するかどうか。
      modelSelection: ['claude-3-7-sonnet@20250219', 'gemini-2.0-pro-exp-02-05', 'gpt-4o', 'gemini-1.5-pro-002'],
      systemLabel: `Box`,
      systemPrompt: Utils.trimLines(`
        エージェントAI。
        言われたことをするだけでなく、最高のパフォーマンスを出すために不明点があれば必要に応じてユーザーに質問し、付加価値の高い情報提供に努める。
      `),
      userPrompt: Utils.trimLines(``),
      // ✅ ** mattermost検索が必要になった場合の注意
      // - 基本的にはメンションされた投稿をソースとする。
      // - 複雑な条件指定が必要な場合はチャネルやチームを指定して検索する。
      // - Mattermostの投稿を表示する際は投稿へのリンクを併記する。
    },
    {
      label: `通訳`,
      placeholder: '翻訳の指示は要りません。英文／和文をそのまま貼ってください。',
      systemLabel: `通訳AI`,
      modelSelection: ['gemini-1.5-flash-002', 'gemini-2.0-flash-lite-preview-02-05', 'gemini-2.0-flash-001', 'gpt-4o'],
      systemPrompt: Utils.trimLines(`
        あなたは **通訳** としてふるまい、次のルールに従って翻訳を行います。

        #### **1. 翻訳のルール**

        利用者は翻訳指示を入れてきません。
        入力された文章が日本語であれば日本語→英語に、英語であれば英語→日本語に翻訳してください。

        ✅ **英語 → 日本語**
        - **TOEIC 400点台の人が理解しやすい訳を作成する。**
        - できるだけシンプルで自然な表現にする。
        - 難しい単語や慣用表現について **解説を付ける**（単語の意味や文法のポイントを解説）。

        ✅ **日本語 → 英語**
        - **英語話者にとって自然な表現を意識する。**
        - **文化の違いを考慮し、意訳も行う。**
        - **意訳をした場合は、日本語への「逆翻訳」も提示する。**

        #### **2. 出力フォーマット（英語 → 日本語）**

        \`\`\`
        【翻訳】
        （訳文をここに記述）

        【解説】
        * **英単語/表現**: 日本語で意味を説明
        * **英単語/表現**: 日本語で意味を説明
        \`\`\`

        #### **3. 出力フォーマット（日本語 → 英語）**

        \`\`\`
        【英訳】
        （英訳をここに記述）

        【逆翻訳】
        （英訳が日本語に戻るとどうなるかを記述）

        【補足】
        （文化の違いに関する補足や、英語話者に伝わりやすくするための意訳のポイント）
        \`\`\`
        `
      ),
      userPrompt: Utils.trimLines(``),
    },
  ];

  // readonly toolCallService = inject(ToolCallService);

  // constructor() {
  //   this.toolCallService.getFunctionDefinitions().subscribe((defs) => {
  //     this.presetDefs.forEach(presetDef => {
  //       if (presetDef.label === 'Mattermost') {
  //         presetDef.tool_names = defs.filter(def => def.info.group === 'mattermost').map(def => def.definition.function.name);
  //       } else {
  //       }
  //     });
  //   });
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

export interface PresetDef {
  label: string;
  modelSelection?: string[];
  tool_choice?: 'auto' | 'none' | 'required';
  tool_names?: string[];
  tool_groups?: string[];
  tool_clear?: boolean;
  systemLabel?: string,
  systemPrompt?: string;
  placeholder?: string;
  userPrompt?: string;
}
