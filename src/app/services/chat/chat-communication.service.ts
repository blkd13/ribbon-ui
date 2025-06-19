import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { OpenAI } from 'openai';
import { v4 as uuidv4 } from 'uuid';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth.service';
import { 
  ChatStreamState, 
  ChatConnectionState, 
  ChatStreamingOptions,
  TokenUsage 
} from './chat-types';
import { ErrorHandlerUtil } from '../../shared/utils/error-handler.util';

/**
 * チャット通信専用サービス
 * WebSocketベースのストリーミング通信を管理
 */
@Injectable({ providedIn: 'root' })
export class ChatCommunicationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  // 接続状態
  private connectionState: ChatConnectionState = {
    connectionId: '',
    isConnected: false,
    reconnectAttempts: 0,
    lastActivity: new Date()
  };

  // ストリーム管理
  private messageIdStreamIdMap: { [messageId: string]: string[] } = {};
  private subjectMap: { [streamId: string]: Subject<OpenAI.ChatCompletionChunk> } = {};
  private textMap: { [streamId: string]: string } = {};
  private streamStates: { [streamId: string]: ChatStreamState } = {};

  // 状態監視用Subject
  private connectionStateSubject = new BehaviorSubject<ChatConnectionState>(this.connectionState);
  private activeStreamsSubject = new BehaviorSubject<ChatStreamState[]>([]);

  // Observable streams
  public connectionState$ = this.connectionStateSubject.asObservable();
  public activeStreams$ = this.activeStreamsSubject.asObservable();

  // 通信フラグ
  private communicationFlag = false;

  /**
   * 指定されたメッセージIDのオブザーバーとテキストを取得
   * @param messageId メッセージID
   * @returns オブザーバーとテキスト
   */
  getObserver(messageId: string): { text: string, observer: Subject<OpenAI.ChatCompletionChunk> | null } {
    const streamIdList = this.messageIdStreamIdMap[messageId];
    if (streamIdList?.length) {
      const streamId = `${streamIdList.at(-1)}|${messageId}`;
      return { 
        text: this.textMap[streamId] || '', 
        observer: this.subjectMap[streamId] || null 
      };
    }
    return { text: '', observer: null };
  }

  /**
   * 接続状態を取得
   * @returns 現在の接続状態
   */
  getConnectionState(): ChatConnectionState {
    return { ...this.connectionState };
  }

  /**
   * アクティブなストリーム数を取得
   * @returns アクティブストリーム数
   */
  getActiveStreamCount(): number {
    return Object.keys(this.subjectMap).length;
  }

  /**
   * ストリーミング接続を開始
   * @param forceReconnect 強制再接続フラグ
   * @returns 接続ID
   */
  openConnection(forceReconnect = false): Observable<string> {
    return new Observable<string>((observer) => {
      if (!forceReconnect && this.communicationFlag && this.connectionState.isConnected) {
        console.log('Connection already exists');
        observer.next(this.connectionState.connectionId);
        observer.complete();
        return;
      }

      this.establishConnection(observer);
    });
  }

  /**
   * 接続を確立
   * @param observer Observable observer
   */
  private establishConnection(observer: any): void {
    const xhr = new XMLHttpRequest();
    const connectionId = uuidv4();
    
    this.updateConnectionState({
      connectionId,
      isConnected: false,
      reconnectAttempts: this.connectionState.reconnectAttempts + 1,
      lastActivity: new Date()
    });

    xhr.open('GET', `${environment.apiUrl}/user/event?connectionId=${connectionId}`, true);
    xhr.setRequestHeader('Accept', 'text/event-stream');

    let cursor = 0;

    xhr.onreadystatechange = () => {
      try {
        this.handleXhrStateChange(xhr, cursor, observer);
        cursor = xhr.responseText.length;
      } catch (error) {
        this.handleConnectionError(error, observer);
      }
    };

    xhr.onerror = () => {
      this.handleConnectionError('Connection failed', observer);
    };

    xhr.onabort = () => {
      console.log('Connection aborted');
      this.updateConnectionState({
        ...this.connectionState,
        isConnected: false
      });
    };

    xhr.ontimeout = () => {
      this.handleConnectionError('Connection timeout', observer);
    };

    // タイムアウト設定 (30秒)
    xhr.timeout = 30000;
  }

  /**
   * XHRの状態変化を処理
   * @param xhr XMLHttpRequest
   * @param cursor カーソル位置
   * @param observer Observable observer
   */
  private handleXhrStateChange(xhr: XMLHttpRequest, cursor: number, observer: any): void {
    switch (xhr.readyState) {
      case XMLHttpRequest.OPENED:
        console.log('Connection opened');
        break;

      case XMLHttpRequest.HEADERS_RECEIVED:
        console.log('Headers received');
        this.updateConnectionState({
          ...this.connectionState,
          isConnected: true,
          reconnectAttempts: 0
        });
        this.communicationFlag = true;
        observer.next(this.connectionState.connectionId);
        observer.complete();
        break;

      case XMLHttpRequest.LOADING:
        this.processStreamingData(xhr.responseText, cursor);
        break;

      case XMLHttpRequest.DONE:
        if (xhr.status !== 200) {
          this.handleConnectionError(`HTTP ${xhr.status}: ${xhr.statusText}`, observer);
        }
        break;
    }
  }

  /**
   * ストリーミングデータを処理
   * @param responseText レスポンステキスト
   * @param cursor カーソル位置
   */
  private processStreamingData(responseText: string, cursor: number): void {
    if (!responseText.endsWith('\n\n')) {
      return;
    }

    const newData = responseText.slice(cursor);
    const lines = newData.split('\n');

    lines.forEach(line => {
      if (line.startsWith('data: ')) {
        this.processDataLine(line.replace(/^data: /gm, ''));
      } else if (line.startsWith('error: ')) {
        this.processErrorLine(line.replace(/^error: /gm, ''));
      }
    });

    this.updateConnectionState({
      ...this.connectionState,
      lastActivity: new Date()
    });
  }

  /**
   * データラインを処理
   * @param line データライン
   */
  private processDataLine(line: string): void {
    if (line.startsWith('{') && line.endsWith('}')) {
      this.processJsonData(line);
    } else if (line.startsWith('[DONE] ')) {
      this.processStreamComplete(line);
    } else if (line.trim()) {
      console.log('Unknown data format:', line);
    }
  }

  /**
   * JSONデータを処理
   * @param line JSONライン
   */
  private processJsonData(line: string): void {
    try {
      const { data } = JSON.parse(line) as { 
        data: { 
          streamId: string, 
          content: OpenAI.ChatCompletionChunk,
          usage?: TokenUsage 
        } 
      };

      const { streamId, content, usage } = data;

      if (this.subjectMap[streamId]) {
        // チャンクデータを送信
        this.subjectMap[streamId].next(content);
        
        // テキストを蓄積
        if (content.choices?.[0]?.delta?.content) {
          this.textMap[streamId] = (this.textMap[streamId] || '') + content.choices[0].delta.content;
        }

        // ストリーム状態を更新
        this.updateStreamState(streamId, {
          text: this.textMap[streamId] || '',
          isActive: true
        });

        // 使用量情報があれば処理
        if (usage) {
          this.notifyTokenUsage(streamId, usage);
        }
      }
    } catch (error) {
      console.error('JSON parse error:', error);
      ErrorHandlerUtil.logError(error, 'JSON parsing');
    }
  }

  /**
   * ストリーム完了を処理
   * @param line DONEライン
   */
  private processStreamComplete(line: string): void {
    const lineSplit = line.split(' ');
    const streamId = lineSplit[1];

    if (this.subjectMap[streamId]) {
      // ストリーム完了通知
      this.subjectMap[streamId].complete();
      
      // ストリーム状態を更新
      this.updateStreamState(streamId, {
        isActive: false
      });

      // クリーンアップ
      this.cleanupStream(streamId);
    }
  }

  /**
   * エラーラインを処理
   * @param line エラーライン
   */
  private processErrorLine(line: string): void {
    const lineSplit = line.split(' ');
    const streamId = lineSplit[0];
    const errorMessage = line.substring(streamId.length + 1);

    console.error('Stream error:', errorMessage);

    if (this.subjectMap[streamId]) {
      // エラー通知
      this.subjectMap[streamId].error(new Error(errorMessage));
      
      // ストリーム状態を更新
      this.updateStreamState(streamId, {
        isActive: false,
        error: errorMessage
      });

      // クリーンアップ
      this.cleanupStream(streamId);
    }
  }

  /**
   * ストリームを作成
   * @param messageId メッセージID
   * @param options ストリーミングオプション
   * @returns ストリームSubject
   */
  createStream(messageId: string, options?: ChatStreamingOptions): Subject<OpenAI.ChatCompletionChunk> {
    const streamId = uuidv4();
    const fullStreamId = `${streamId}|${messageId}`;

    // ストリーム管理に追加
    if (!this.messageIdStreamIdMap[messageId]) {
      this.messageIdStreamIdMap[messageId] = [];
    }
    this.messageIdStreamIdMap[messageId].push(streamId);

    // Subjectを作成
    const subject = new Subject<OpenAI.ChatCompletionChunk>();
    this.subjectMap[fullStreamId] = subject;
    this.textMap[fullStreamId] = '';

    // ストリーム状態を初期化
    this.initializeStreamState(fullStreamId, messageId);

    // オプションのコールバックを設定
    if (options) {
      this.setupStreamCallbacks(subject, options);
    }

    return subject;
  }

  /**
   * ストリーム状態を初期化
   * @param streamId ストリームID
   * @param messageId メッセージID
   */
  private initializeStreamState(streamId: string, messageId: string): void {
    this.streamStates[streamId] = {
      streamId,
      messageId,
      isActive: true,
      text: '',
      error: undefined
    };
    
    this.updateActiveStreams();
  }

  /**
   * ストリーム状態を更新
   * @param streamId ストリームID
   * @param updates 更新データ
   */
  private updateStreamState(streamId: string, updates: Partial<ChatStreamState>): void {
    if (this.streamStates[streamId]) {
      this.streamStates[streamId] = {
        ...this.streamStates[streamId],
        ...updates
      };
      this.updateActiveStreams();
    }
  }

  /**
   * ストリームコールバックを設定
   * @param subject ストリームSubject
   * @param options オプション
   */
  private setupStreamCallbacks(subject: Subject<OpenAI.ChatCompletionChunk>, options: ChatStreamingOptions): void {
    if (options.onMessage) {
      subject.subscribe(options.onMessage);
    }

    if (options.onError) {
      subject.subscribe({
        error: options.onError
      });
    }

    if (options.onComplete) {
      subject.subscribe({
        complete: options.onComplete
      });
    }
  }

  /**
   * ストリームをクリーンアップ
   * @param streamId ストリームID
   */
  private cleanupStream(streamId: string): void {
    // Subjectマップから削除
    delete this.subjectMap[streamId];
    
    // 分割されたストリームIDも削除
    if (streamId.includes('|')) {
      const baseStreamId = streamId.split('|')[0];
      delete this.subjectMap[baseStreamId];
    }

    // ストリーム状態から削除
    delete this.streamStates[streamId];

    // アクティブストリームを更新
    this.updateActiveStreams();

    // 全ストリームが終了した場合は接続を切断
    if (Object.keys(this.subjectMap).length === 0) {
      this.communicationFlag = false;
      this.updateConnectionState({
        connectionId: uuidv4(),
        isConnected: false,
        reconnectAttempts: 0,
        lastActivity: new Date()
      });
    }
  }

  /**
   * 接続状態を更新
   * @param newState 新しい状態
   */
  private updateConnectionState(newState: ChatConnectionState): void {
    this.connectionState = newState;
    this.connectionStateSubject.next(this.connectionState);
  }

  /**
   * アクティブストリーム一覧を更新
   */
  private updateActiveStreams(): void {
    const activeStreams = Object.values(this.streamStates);
    this.activeStreamsSubject.next(activeStreams);
  }

  /**
   * 接続エラーを処理
   * @param error エラー
   * @param observer Observable observer
   */
  private handleConnectionError(error: any, observer: any): void {
    console.error('Connection error:', error);
    
    this.updateConnectionState({
      ...this.connectionState,
      isConnected: false
    });

    this.communicationFlag = false;

    const errorInfo = ErrorHandlerUtil.handleGenericError(error, 'Chat connection');
    observer.error(new Error(errorInfo.message));
  }

  /**
   * トークン使用量を通知
   * @param streamId ストリームID
   * @param usage 使用量情報
   */
  private notifyTokenUsage(streamId: string, usage: TokenUsage): void {
    // 今後の実装でトークン使用量を別サービスに通知
    console.log(`Token usage for ${streamId}:`, usage);
  }

  /**
   * 指定されたメッセージIDのストリームを停止
   * @param messageId メッセージID
   */
  stopStream(messageId: string): void {
    const streamIdList = this.messageIdStreamIdMap[messageId];
    if (streamIdList) {
      streamIdList.forEach(streamId => {
        const fullStreamId = `${streamId}|${messageId}`;
        if (this.subjectMap[fullStreamId]) {
          this.subjectMap[fullStreamId].complete();
          this.cleanupStream(fullStreamId);
        }
      });
      delete this.messageIdStreamIdMap[messageId];
    }
  }

  /**
   * 全ストリームを停止
   */
  stopAllStreams(): void {
    Object.keys(this.subjectMap).forEach(streamId => {
      this.subjectMap[streamId].complete();
    });
    
    // 全てクリーンアップ
    this.subjectMap = {};
    this.textMap = {};
    this.streamStates = {};
    this.messageIdStreamIdMap = {};
    
    this.updateActiveStreams();
    this.communicationFlag = false;
  }

  /**
   * 接続を強制切断
   */
  disconnect(): void {
    this.stopAllStreams();
    this.updateConnectionState({
      connectionId: '',
      isConnected: false,
      reconnectAttempts: 0,
      lastActivity: new Date()
    });
  }

  /**
   * 接続を再試行
   * @returns 接続ID
   */
  reconnect(): Observable<string> {
    console.log('Attempting to reconnect...');
    this.disconnect();
    return this.openConnection(true);
  }
}