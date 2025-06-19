import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject, forkJoin, of } from 'rxjs';
import { map, switchMap, tap, catchError, finalize } from 'rxjs/operators';
import { OpenAI } from 'openai';

import { ChatCommunicationService } from './chat-communication.service';
import { ChatModelConfigurationService } from './chat-model-configuration.service';
import { ChatPresetService } from './chat-preset.service';
import { ChatTokenCountingService } from './chat-token-counting.service';
import { AuthService } from '../auth.service';
import { ToolCallService } from '../tool-call.service';
import { 
  ChatInputArea, 
  ChatContent, 
  LlmModel, 
  ChatModelSettings, 
  ChatStreamingOptions,
  TokenUsage,
  ChatPreset
} from './chat-types';
import { 
  CachedContent, 
  ChatCompletionCreateParamsWithoutMessages, 
  ChatCompletionStreamInDto,
  GenerateContentRequestForCache 
} from '../../models/models';
import { Message, MessageForView, MessageGroupForView } from '../../models/project-models';
import { environment } from '../../../environments/environment';
import { ErrorHandlerUtil } from '../../shared/utils/error-handler.util';

/**
 * チャット調整サービス
 * 分割されたチャットサービスを統合し、外部インターフェースを提供
 * 既存のChatServiceと互換性を保ちながら、内部的には分割されたサービスを使用
 */
@Injectable({ providedIn: 'root' })
export class ChatCoordinationService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly toolCallService = inject(ToolCallService);
  
  private readonly communicationService = inject(ChatCommunicationService);
  private readonly modelConfigService = inject(ChatModelConfigurationService);
  private readonly presetService = inject(ChatPresetService);
  private readonly tokenCountingService = inject(ChatTokenCountingService);

  // 状態管理
  private isInitialized = false;
  private openAiApiKeySubject = new BehaviorSubject<string>('');

  // Observable streams - 外部公開用
  public connectionState$ = this.communicationService.connectionState$;
  public activeStreams$ = this.communicationService.activeStreams$;
  public models$ = this.modelConfigService.models$;
  public selectedModel$ = this.modelConfigService.selectedModel$;
  public modelSettings$ = this.modelConfigService.modelSettings$;
  public presets$ = this.presetService.presets$;
  public selectedPreset$ = this.presetService.selectedPreset$;
  public totalTokenUsage$ = this.tokenCountingService.totalUsage$;
  public openAiApiKey$ = this.openAiApiKeySubject.asObservable();

  // 既存ChatServiceとの互換性のためのプロパティ
  get defaultSystemPrompt(): string {
    return this.presetService.getDefaultSystemPrompt();
  }

  get flag(): boolean {
    const connectionState = this.communicationService.getConnectionState();
    return connectionState.isConnected;
  }

  /**
   * サービス初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // モデル一覧を取得
      await this.modelConfigService.getAvailableModels(true).toPromise();
      
      // プリセットをローカルストレージから読み込み
      this.presetService.loadPresetsFromStorage();
      
      // デフォルトモデルを設定
      const defaultModel = await this.modelConfigService.getDefaultModel().toPromise();
      if (defaultModel) {
        this.modelConfigService.setSelectedModel(defaultModel);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize chat services:', error);
      throw error;
    }
  }

  /**
   * チャット送信（メイン機能）
   * @param messages メッセージ配列
   * @param options ストリーミングオプション
   * @returns ストリームSubject
   */
  sendMessage(
    messages: { role: string; content: string | ChatContent[] }[],
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    return this.prepareAndSendMessage(messages, options);
  }

  /**
   * 従来のAPIとの互換性のための送信メソッド
   * @param params チャット完了パラメータ
   * @returns ストリームSubject
   */
  sendChatCompletion(
    params: ChatCompletionCreateParamsWithoutMessages,
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    return this.prepareChatCompletionAndSend(params, options);
  }

  /**
   * メッセージ準備と送信
   * @param messages メッセージ配列
   * @param options オプション
   * @returns ストリームSubject
   */
  private prepareAndSendMessage(
    messages: { role: string; content: string | ChatContent[] }[],
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    return this.getCurrentConfiguration().pipe(
      switchMap(config => {
        // メッセージを正規化
        const normalizedMessages = this.normalizeMessages(messages, config.preset);
        
        // トークン数を分析
        return this.tokenCountingService.analyzeConversationTokens(
          normalizedMessages,
          config.model,
          config.settings.maxTokens || 4096
        ).pipe(
          switchMap(analysis => {
            if (analysis.exceedsLimit && analysis.recommendations) {
              const error = new Error(`トークン制限を超過: ${analysis.recommendations.join(', ')}`);
              return of(null).pipe(
                tap(() => { throw error; })
              );
            }

            // 実際の送信処理
            return this.executeChatRequest({
              model: config.model.id,
              messages: normalizedMessages,
              temperature: config.settings.temperature,
              max_tokens: config.settings.maxTokens,
              stream: true,
              ...config.settings
            }, options);
          })
        );
      })
    );
  }

  /**
   * チャット完了パラメータの準備と送信
   * @param params パラメータ
   * @param options オプション
   * @returns ストリームSubject
   */
  private prepareChatCompletionAndSend(
    params: ChatCompletionCreateParamsWithoutMessages,
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    return this.executeChatRequest(params, options);
  }

  /**
   * 実際のチャットリクエスト実行
   * @param params パラメータ
   * @param options オプション
   * @returns ストリームSubject
   */
  private executeChatRequest(
    params: any,
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    return this.communicationService.openConnection().pipe(
      switchMap(connectionId => {
        // ストリームを作成
        const messageId = this.generateMessageId();
        const stream = this.communicationService.createStream(messageId, {
          ...options,
          onTokenUpdate: (usage) => {
            if (usage.inputTokens && usage.outputTokens) {
              this.tokenCountingService.recordActualUsage(usage as TokenUsage);
            }
          }
        });

        // チャットリクエストを送信
        const requestData: ChatCompletionStreamInDto = {
          connectionId,
          streamId: messageId,
          ...params
        };

        this.http.post(`${environment.apiUrl}/chat/completions`, requestData)
          .pipe(
            catchError(error => {
              const errorInfo = ErrorHandlerUtil.handleHttpError(error, 'チャット送信');
              stream.error(new Error(errorInfo.message));
              return of(null);
            })
          )
          .subscribe();

        return of(stream);
      })
    );
  }

  /**
   * 現在の設定を取得
   * @returns 現在の設定
   */
  private getCurrentConfiguration(): Observable<{
    model: LlmModel;
    settings: ChatModelSettings;
    preset: ChatPreset;
  }> {
    return forkJoin({
      selectedModelId: this.modelConfigService.selectedModel$,
      settings: this.modelConfigService.modelSettings$,
      selectedPresetId: this.presetService.selectedPreset$
    }).pipe(
      switchMap(({ selectedModelId, settings, selectedPresetId }) => {
        return forkJoin({
          model: this.modelConfigService.getModelById(selectedModelId),
          preset: this.presetService.getPresetById(selectedPresetId)
        }).pipe(
          map(({ model, preset }) => {
            if (!model) {
              throw new Error('選択されたモデルが見つかりません');
            }
            if (!preset) {
              throw new Error('選択されたプリセットが見つかりません');
            }
            return { model, settings, preset };
          })
        );
      })
    );
  }

  /**
   * メッセージを正規化
   * @param messages メッセージ配列
   * @param preset プリセット
   * @returns 正規化されたメッセージ
   */
  private normalizeMessages(
    messages: { role: string; content: string | ChatContent[] }[],
    preset: ChatPreset
  ): { role: string; content: string }[] {
    const normalizedMessages = messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : this.stringifyContent(msg.content)
    }));

    // システムプロンプトが含まれていない場合は追加
    const hasSystemMessage = normalizedMessages.some(msg => msg.role === 'system');
    if (!hasSystemMessage && preset.systemPrompt) {
      const userName = this.authService.getCurrentUser()?.name || '';
      const interpolatedPrompt = this.presetService.interpolateSystemPrompt(preset.systemPrompt, userName);
      
      normalizedMessages.unshift({
        role: 'system',
        content: interpolatedPrompt
      });
    }

    return normalizedMessages;
  }

  /**
   * ChatContentを文字列に変換
   * @param content ChatContent配列
   * @returns 文字列
   */
  private stringifyContent(content: ChatContent[]): string {
    return content.map(item => {
      if (item.type === 'text') {
        return item.text;
      } else if (item.type === 'file') {
        return `[ファイル: ${item.text}]`;
      }
      return '';
    }).join('\n');
  }

  /**
   * メッセージIDを生成
   * @returns メッセージID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // === 既存ChatServiceとの互換性メソッド ===

  /**
   * オブザーバーを取得（既存互換）
   * @param messageId メッセージID
   * @returns オブザーバーとテキスト
   */
  getObserver(messageId: string): { text: string, observer: Subject<OpenAI.ChatCompletionChunk> | null } {
    return this.communicationService.getObserver(messageId);
  }

  /**
   * モデル属性をバリデーション（既存互換）
   * @param modelIds モデルID配列
   * @returns バリデーション結果
   */
  validateModelAttributes(modelIds: string[]): Observable<{ message: string }> {
    return this.modelConfigService.validateModelAttributes(modelIds);
  }

  /**
   * OpenAI APIキーを取得（既存互換）
   * @returns APIキー
   */
  getOpenAiApiKey(): Observable<string> {
    // この機能は将来的に削除予定
    return this.openAiApiKeySubject.asObservable();
  }

  // === 新しい便利メソッド ===

  /**
   * 指定されたプリセットで新しい会話を開始
   * @param presetId プリセットID
   * @param initialMessage 初期メッセージ
   * @returns ストリームSubject
   */
  startConversationWithPreset(
    presetId: string,
    initialMessage: string,
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    this.presetService.selectPreset(presetId);
    
    return this.sendMessage([
      { role: 'user', content: initialMessage }
    ], options);
  }

  /**
   * モデルを変更して同じメッセージを再送信
   * @param modelId 新しいモデルID
   * @param messages メッセージ配列
   * @returns ストリームSubject
   */
  resendWithDifferentModel(
    modelId: string,
    messages: { role: string; content: string }[],
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    this.modelConfigService.setSelectedModel(modelId);
    return this.sendMessage(messages, options);
  }

  /**
   * 会話履歴を最適化して送信
   * @param messages メッセージ配列
   * @param targetTokens 目標トークン数
   * @returns ストリームSubject
   */
  sendOptimizedConversation(
    messages: { role: string; content: string; id?: string }[],
    targetTokens?: number,
    options?: ChatStreamingOptions
  ): Observable<Subject<OpenAI.ChatCompletionChunk> | null> {
    return this.getCurrentConfiguration().pipe(
      switchMap(config => {
        const target = targetTokens || Math.floor(config.model.maxInputTokens * 0.8);
        
        return this.tokenCountingService.suggestHistoryTrimming(messages, config.model, target).pipe(
          switchMap(optimizedMessages => {
            return this.sendMessage(optimizedMessages, options);
          })
        );
      })
    );
  }

  /**
   * バッチ処理でメッセージを送信
   * @param messageGroups メッセージグループ配列
   * @returns 結果配列
   */
  sendBatchMessages(
    messageGroups: { id: string; messages: { role: string; content: string }[] }[],
    options?: ChatStreamingOptions
  ): Observable<{ id: string; stream: Subject<OpenAI.ChatCompletionChunk> | null }[]> {
    const batchRequests = messageGroups.map(group => 
      this.sendMessage(group.messages, options).pipe(
        map(stream => ({ id: group.id, stream }))
      )
    );

    return forkJoin(batchRequests);
  }

  /**
   * 統計情報を取得
   * @returns 統計情報
   */
  getStatistics(): Observable<{
    connection: any;
    tokens: any;
    models: { totalModels: number; enabledModels: number };
    presets: { totalPresets: number };
  }> {
    return forkJoin({
      connection: of(this.communicationService.getConnectionState()),
      tokens: this.tokenCountingService.getTokenStatistics(),
      models: this.modelConfigService.getEnabledModels().pipe(
        map(enabled => ({
          totalModels: this.modelConfigService.getCachedModels().length,
          enabledModels: enabled.length
        }))
      ),
      presets: this.presetService.getAllPresets().pipe(
        map(presets => ({ totalPresets: presets.length }))
      )
    });
  }

  /**
   * サービスをリセット
   */
  reset(): void {
    this.communicationService.disconnect();
    this.modelConfigService.resetModelSettings();
    this.tokenCountingService.resetSessionUsage();
    this.presetService.selectPreset('default');
    this.isInitialized = false;
  }

  /**
   * 指定されたストリームを停止
   * @param messageId メッセージID
   */
  stopStream(messageId: string): void {
    this.communicationService.stopStream(messageId);
  }

  /**
   * 全ストリームを停止
   */
  stopAllStreams(): void {
    this.communicationService.stopAllStreams();
  }

  /**
   * 接続を再試行
   * @returns 接続ID
   */
  reconnect(): Observable<string> {
    return this.communicationService.reconnect();
  }
}