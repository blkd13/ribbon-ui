import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import { TokenUsage, LlmModel } from './chat-types';

export interface TokenCountingCache {
  [textHash: string]: {
    tokenCount: number;
    timestamp: Date;
    modelId: string;
  };
}

export interface TokenAnalysis {
  inputTokens: number;
  estimatedOutputTokens: number;
  totalTokens: number;
  maxAllowedTokens: number;
  exceedsLimit: boolean;
  costEstimate: number;
  recommendations?: string[];
}

/**
 * チャットトークンカウンティング・計算サービス
 * トークン数の計算、キャッシング、コスト見積もりを担当
 */
@Injectable({ providedIn: 'root' })
export class ChatTokenCountingService {
  private tokenCacheSubject = new BehaviorSubject<TokenCountingCache>({});
  private totalUsageSubject = new BehaviorSubject<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0
  });

  // キャッシュ設定
  private readonly CACHE_EXPIRY_HOURS = 24;
  private readonly MAX_CACHE_SIZE = 1000;

  // Observable streams
  public tokenCache$ = this.tokenCacheSubject.asObservable();
  public totalUsage$ = this.totalUsageSubject.asObservable();

  constructor() {
    this.loadCacheFromStorage();
  }

  /**
   * テキストのトークン数を推定
   * 正確なトークン数はAPIレスポンスで得られるため、これは近似値
   * @param text テキスト
   * @param modelId モデルID
   * @returns 推定トークン数
   */
  estimateTokens(text: string, modelId: string = 'default'): Observable<number> {
    if (!text || text.trim().length === 0) {
      return of(0);
    }

    const textHash = this.generateTextHash(text + modelId);
    const cache = this.tokenCacheSubject.value;

    // キャッシュから取得を試行
    if (cache[textHash] && this.isCacheValid(cache[textHash])) {
      return of(cache[textHash].tokenCount);
    }

    // 簡易的なトークン推定アルゴリズム
    const estimatedTokens = this.calculateEstimatedTokens(text, modelId);

    // キャッシュに保存
    this.updateCache(textHash, estimatedTokens, modelId);

    return of(estimatedTokens);
  }

  /**
   * 複数のテキストのトークン数を一括推定
   * @param texts テキスト配列
   * @param modelId モデルID
   * @returns 各テキストのトークン数配列
   */
  estimateMultipleTokens(texts: string[], modelId: string = 'default'): Observable<number[]> {
    const estimates = texts.map(text => this.estimateTokens(text, modelId));
    
    return new Observable(subscriber => {
      Promise.all(estimates.map(obs => obs.toPromise())).then(results => {
        subscriber.next(results.filter((r): r is number => r !== undefined));
        subscriber.complete();
      });
    });
  }

  /**
   * 会話全体のトークン分析を実行
   * @param messages メッセージ配列
   * @param model モデル情報
   * @param requestedOutputTokens 要求出力トークン数
   * @returns トークン分析結果
   */
  analyzeConversationTokens(
    messages: { role: string; content: string }[],
    model: LlmModel,
    requestedOutputTokens: number = 4096
  ): Observable<TokenAnalysis> {
    const allText = messages.map(msg => msg.content).join('\n');
    
    return this.estimateTokens(allText, model.id).pipe(
      map(inputTokens => {
        const totalTokens = inputTokens + requestedOutputTokens;
        const exceedsInputLimit = inputTokens > model.maxInputTokens;
        const exceedsOutputLimit = requestedOutputTokens > model.maxTokens;
        const exceedsLimit = exceedsInputLimit || exceedsOutputLimit;

        // コスト計算
        const costEstimate = this.calculateCost(
          inputTokens,
          requestedOutputTokens,
          model.price
        );

        // 推奨事項を生成
        const recommendations: string[] = [];
        if (exceedsInputLimit) {
          recommendations.push(`入力を${model.maxInputTokens}トークン以下に削減してください`);
        }
        if (exceedsOutputLimit) {
          recommendations.push(`出力トークン数を${model.maxTokens}以下に設定してください`);
        }
        if (inputTokens > model.maxInputTokens * 0.8) {
          recommendations.push('入力が上限に近づいています。会話履歴の削減を検討してください');
        }

        return {
          inputTokens,
          estimatedOutputTokens: requestedOutputTokens,
          totalTokens,
          maxAllowedTokens: Math.min(model.maxInputTokens + model.maxTokens, model.maxInputTokens),
          exceedsLimit,
          costEstimate,
          recommendations: recommendations.length > 0 ? recommendations : undefined
        };
      })
    );
  }

  /**
   * 実際のトークン使用量を記録（APIレスポンスから）
   * @param usage トークン使用量
   */
  recordActualUsage(usage: TokenUsage): void {
    const currentTotal = this.totalUsageSubject.value;
    const newTotal: TokenUsage = {
      inputTokens: currentTotal.inputTokens + usage.inputTokens,
      outputTokens: currentTotal.outputTokens + usage.outputTokens,
      totalTokens: currentTotal.totalTokens + usage.totalTokens,
      cost: (currentTotal.cost || 0) + (usage.cost || 0)
    };

    this.totalUsageSubject.next(newTotal);
    this.saveTotalUsageToStorage(newTotal);
  }

  /**
   * セッション中の総使用量をリセット
   */
  resetSessionUsage(): void {
    this.totalUsageSubject.next({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0
    });
    this.clearTotalUsageFromStorage();
  }

  /**
   * 指定期間の使用量を取得（将来の拡張用）
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns 期間内使用量
   */
  getUsageForPeriod(startDate: Date, endDate: Date): Observable<TokenUsage> {
    // 現在はセッション使用量のみ返す
    // 将来的にはサーバーから期間データを取得
    return this.totalUsage$;
  }

  /**
   * 効率的な会話履歴の切り詰めを提案
   * @param messages メッセージ配列
   * @param model モデル情報
   * @param targetTokens 目標トークン数
   * @returns 切り詰め後のメッセージ配列
   */
  suggestHistoryTrimming(
    messages: { role: string; content: string; id?: string }[],
    model: LlmModel,
    targetTokens: number
  ): Observable<{ role: string; content: string; id?: string }[]> {
    return new Observable(subscriber => {
      this.trimHistoryToTarget(messages, model.id, targetTokens).then(trimmed => {
        subscriber.next(trimmed);
        subscriber.complete();
      });
    });
  }

  /**
   * トークン効率の良いメッセージ圧縮
   * @param content メッセージ内容
   * @param targetLength 目標文字数
   * @returns 圧縮されたメッセージ
   */
  compressMessage(content: string, targetLength: number): Observable<string> {
    if (content.length <= targetLength) {
      return of(content);
    }

    // 簡易的な圧縮アルゴリズム
    // 1. 改行を削除
    // 2. 重複スペースを削除
    // 3. 文末から削除
    let compressed = content
      .replace(/\n{2,}/g, '\n')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (compressed.length > targetLength) {
      compressed = compressed.substring(0, targetLength - 3) + '...';
    }

    return of(compressed);
  }

  /**
   * テキストの簡易トークン推定
   * @param text テキスト
   * @param modelId モデルID
   * @returns 推定トークン数
   */
  private calculateEstimatedTokens(text: string, modelId: string): number {
    // 日本語・英語混在対応の簡易アルゴリズム
    
    // 英語部分（アルファベットと数字）
    const englishMatches = text.match(/[a-zA-Z0-9\s.,!?]+/g) || [];
    const englishText = englishMatches.join('');
    const englishTokens = Math.ceil(englishText.length / 4); // 英語は約4文字=1トークン

    // 日本語部分
    const japaneseText = text.replace(/[a-zA-Z0-9\s.,!?]+/g, '');
    const japaneseTokens = japaneseText.length * 1.5; // 日本語は1文字=約1.5トークン

    // コードブロック検出
    const codeBlocks = text.match(/```[\s\S]*?```/g) || [];
    const codeTokens = codeBlocks.reduce((total, block) => {
      return total + Math.ceil(block.length / 3); // コードは圧縮率が高い
    }, 0);

    // 特殊文字とマークアップ
    const specialChars = text.match(/[#*_`\[\](){}]/g) || [];
    const specialTokens = specialChars.length * 0.5;

    const totalTokens = Math.ceil(englishTokens + japaneseTokens + codeTokens + specialTokens);
    
    // 最小値として文字数の20%、最大値として文字数の300%を設定
    const minTokens = Math.ceil(text.length * 0.2);
    const maxTokens = Math.ceil(text.length * 3);
    
    return Math.max(minTokens, Math.min(maxTokens, totalTokens));
  }

  /**
   * コスト計算
   * @param inputTokens 入力トークン数
   * @param outputTokens 出力トークン数
   * @param pricing 価格設定 [input_price, output_price]
   * @returns 推定コスト
   */
  private calculateCost(inputTokens: number, outputTokens: number, pricing?: number[]): number {
    if (!pricing || pricing.length < 2) {
      return 0;
    }

    const [inputPrice, outputPrice] = pricing;
    const inputCost = (inputTokens / 1000) * inputPrice;
    const outputCost = (outputTokens / 1000) * outputPrice;
    
    return inputCost + outputCost;
  }

  /**
   * テキストハッシュを生成
   * @param text テキスト
   * @returns ハッシュ値
   */
  private generateTextHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit整数に変換
    }
    return hash.toString();
  }

  /**
   * キャッシュの有効性をチェック
   * @param cacheEntry キャッシュエントリ
   * @returns 有効かどうか
   */
  private isCacheValid(cacheEntry: { timestamp: Date }): boolean {
    const now = new Date();
    const expiryTime = new Date(cacheEntry.timestamp);
    expiryTime.setHours(expiryTime.getHours() + this.CACHE_EXPIRY_HOURS);
    
    return now < expiryTime;
  }

  /**
   * キャッシュを更新
   * @param textHash テキストハッシュ
   * @param tokenCount トークン数
   * @param modelId モデルID
   */
  private updateCache(textHash: string, tokenCount: number, modelId: string): void {
    const currentCache = this.tokenCacheSubject.value;
    const newCache = {
      ...currentCache,
      [textHash]: {
        tokenCount,
        timestamp: new Date(),
        modelId
      }
    };

    // キャッシュサイズ制限
    if (Object.keys(newCache).length > this.MAX_CACHE_SIZE) {
      this.pruneCache(newCache);
    }

    this.tokenCacheSubject.next(newCache);
    this.saveCacheToStorage(newCache);
  }

  /**
   * キャッシュを剪定（古いエントリを削除）
   * @param cache キャッシュオブジェクト
   */
  private pruneCache(cache: TokenCountingCache): void {
    const entries = Object.entries(cache);
    entries.sort((a, b) => a[1].timestamp.getTime() - b[1].timestamp.getTime());
    
    // 古い50%を削除
    const toDelete = Math.floor(entries.length * 0.5);
    for (let i = 0; i < toDelete; i++) {
      delete cache[entries[i][0]];
    }
  }

  /**
   * 履歴を目標トークン数まで切り詰め
   * @param messages メッセージ配列
   * @param modelId モデルID
   * @param targetTokens 目標トークン数
   * @returns 切り詰め後のメッセージ配列
   */
  private async trimHistoryToTarget(
    messages: { role: string; content: string; id?: string }[],
    modelId: string,
    targetTokens: number
  ): Promise<{ role: string; content: string; id?: string }[]> {
    // システムメッセージは保持
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const otherMessages = messages.filter(msg => msg.role !== 'system');
    
    let currentTokens = 0;
    const result = [...systemMessages];
    
    // 最新のメッセージから逆順で追加
    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const message = otherMessages[i];
      const messageTokens = await this.estimateTokens(message.content, modelId).toPromise();
      
      if (messageTokens !== undefined && currentTokens + messageTokens <= targetTokens) {
        result.unshift(message);
        currentTokens += messageTokens;
      } else {
        break;
      }
    }
    
    return result;
  }

  /**
   * キャッシュをローカルストレージに保存
   * @param cache キャッシュオブジェクト
   */
  private saveCacheToStorage(cache: TokenCountingCache): void {
    try {
      localStorage.setItem('token_counting_cache', JSON.stringify(cache));
    } catch (error) {
      console.error('Failed to save token cache:', error);
    }
  }

  /**
   * ローカルストレージからキャッシュを読み込み
   */
  private loadCacheFromStorage(): void {
    try {
      const stored = localStorage.getItem('token_counting_cache');
      if (stored) {
        const cache: TokenCountingCache = JSON.parse(stored);
        
        // 期限切れエントリを削除
        const validCache: TokenCountingCache = {};
        Object.entries(cache).forEach(([hash, entry]) => {
          if (this.isCacheValid(entry)) {
            validCache[hash] = {
              ...entry,
              timestamp: new Date(entry.timestamp) // Date オブジェクトに復元
            };
          }
        });
        
        this.tokenCacheSubject.next(validCache);
      }
      
      // 総使用量も読み込み
      const totalUsageStored = localStorage.getItem('total_token_usage');
      if (totalUsageStored) {
        const totalUsage: TokenUsage = JSON.parse(totalUsageStored);
        this.totalUsageSubject.next(totalUsage);
      }
    } catch (error) {
      console.error('Failed to load token cache:', error);
    }
  }

  /**
   * 総使用量をローカルストレージに保存
   * @param usage 使用量
   */
  private saveTotalUsageToStorage(usage: TokenUsage): void {
    try {
      localStorage.setItem('total_token_usage', JSON.stringify(usage));
    } catch (error) {
      console.error('Failed to save total usage:', error);
    }
  }

  /**
   * 総使用量をローカルストレージから削除
   */
  private clearTotalUsageFromStorage(): void {
    try {
      localStorage.removeItem('total_token_usage');
    } catch (error) {
      console.error('Failed to clear total usage:', error);
    }
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.tokenCacheSubject.next({});
    localStorage.removeItem('token_counting_cache');
  }

  /**
   * トークン統計情報を取得
   * @returns 統計情報
   */
  getTokenStatistics(): Observable<{
    cacheSize: number;
    totalCachedTokens: number;
    sessionUsage: TokenUsage;
    cacheHitRate: number;
  }> {
    return this.tokenCache$.pipe(
      map(cache => {
        const cacheSize = Object.keys(cache).length;
        const totalCachedTokens = Object.values(cache)
          .reduce((total, entry) => total + entry.tokenCount, 0);
        const sessionUsage = this.totalUsageSubject.value;
        
        // キャッシュヒット率は簡易的に計算（実装依存）
        const cacheHitRate = cacheSize > 0 ? 0.75 : 0; // 仮の値
        
        return {
          cacheSize,
          totalCachedTokens,
          sessionUsage,
          cacheHitRate
        };
      })
    );
  }
}