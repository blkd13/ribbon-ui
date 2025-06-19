import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';

import { ChatPreset } from './chat-types';
import { Utils } from '../../utils';

/**
 * チャットプリセット管理サービス
 * システムプロンプトやモデル設定のプリセットを管理
 */
@Injectable({ providedIn: 'root' })
export class ChatPresetService {
  private presetsSubject = new BehaviorSubject<ChatPreset[]>([]);
  private selectedPresetSubject = new BehaviorSubject<string>('default');

  // Observable streams
  public presets$ = this.presetsSubject.asObservable();
  public selectedPreset$ = this.selectedPresetSubject.asObservable();

  // デフォルトシステムプロンプト
  private readonly defaultSystemPrompt = Utils.trimLines(`
    AI アシスタント


    ## 基本情報
    - ユーザー名: \${user_name}
    - 現在の日時: \${current_datetime}


    ## 出力フォーマット

    特に指示がない限り以下のフォーマットで出力してください。

    - markdown形式
    - ファイル出力する際はブロックの先頭にファイル名をフルパスで埋め込んでください（例：\`\`\`typescript src/app/filename.ts\n...\n\`\`\` ）
    - 数式を書く際はインラインのLatexで書いて下さい（例：\$...\$ or \$\$...\$\$）。
    - htmlを書く際は、コードブロックのキーワードはxmlではなく、htmlとしてください。svgの時も同様にsvgとしてください。
  `);

  constructor() {
    this.initializeDefaultPresets();
  }

  /**
   * デフォルトプリセットを初期化
   */
  private initializeDefaultPresets(): void {
    const defaultPresets: ChatPreset[] = [
      {
        id: 'default',
        name: 'デフォルト',
        systemPrompt: this.defaultSystemPrompt,
        temperature: 0.7,
        maxTokens: 4096,
        isDefault: true
      },
      {
        id: 'creative',
        name: 'クリエイティブ',
        systemPrompt: Utils.trimLines(`
          クリエイティブな文章作成や創作活動をサポートするAIアシスタントです。
          
          ## 特徴
          - 創造性を重視した回答
          - 多様なアイデアの提案
          - 表現力豊かな文章
          - アーティスティックな視点
          
          ## 出力スタイル
          - 想像力豊かな表現
          - 複数の選択肢を提示
          - 具体的な例やイメージを含める
        `),
        temperature: 0.9,
        maxTokens: 4096
      },
      {
        id: 'analytical',
        name: '分析的',
        systemPrompt: Utils.trimLines(`
          論理的で分析的な思考をサポートするAIアシスタントです。
          
          ## 特徴
          - 論理的な思考プロセス
          - データに基づいた分析
          - 客観的な視点
          - 構造化された回答
          
          ## 出力スタイル
          - 明確な論理構造
          - 根拠となる情報の提示
          - 結論に至るプロセスの説明
          - 定量的な情報の活用
        `),
        temperature: 0.3,
        maxTokens: 4096
      },
      {
        id: 'technical',
        name: 'テクニカル',
        systemPrompt: Utils.trimLines(`
          技術的な質問や問題解決をサポートするAIアシスタントです。
          
          ## 特徴
          - 正確な技術情報
          - 実装可能なソリューション
          - ベストプラクティスの提案
          - 詳細な説明と例
          
          ## 出力スタイル
          - コード例を含む回答
          - ステップバイステップの説明
          - エラーハンドリングの考慮
          - パフォーマンスと保守性の観点
        `),
        temperature: 0.2,
        maxTokens: 8192
      },
      {
        id: 'educational',
        name: '教育的',
        systemPrompt: Utils.trimLines(`
          学習をサポートし、理解を深めるための教育的なAIアシスタントです。
          
          ## 特徴
          - 分かりやすい説明
          - 段階的な学習アプローチ
          - 理解度に応じた調整
          - 練習問題の提供
          
          ## 出力スタイル
          - 基礎から応用への順序立てた説明
          - 具体例と比喩の活用
          - 重要ポイントの強調
          - 確認問題の提案
        `),
        temperature: 0.5,
        maxTokens: 4096
      },
      {
        id: 'concise',
        name: '簡潔',
        systemPrompt: Utils.trimLines(`
          簡潔で要点を絞った回答を提供するAIアシスタントです。
          
          ## 特徴
          - 要点のみに絞った回答
          - 無駄な情報を排除
          - 時間効率を重視
          - アクションアイテムの明確化
          
          ## 出力スタイル
          - 箇条書きや番号リストの活用
          - 1-2文での簡潔な説明
          - 核心的な情報のみ
          - 次のアクションの明示
        `),
        temperature: 0.4,
        maxTokens: 2048
      }
    ];

    this.presetsSubject.next(defaultPresets);
  }

  /**
   * 全プリセットを取得
   * @returns プリセット一覧
   */
  getAllPresets(): Observable<ChatPreset[]> {
    return this.presets$;
  }

  /**
   * 指定されたIDのプリセットを取得
   * @param presetId プリセットID
   * @returns プリセット情報
   */
  getPresetById(presetId: string): Observable<ChatPreset | null> {
    return this.presets$.pipe(
      map(presets => presets.find(preset => preset.id === presetId) || null)
    );
  }

  /**
   * デフォルトプリセットを取得
   * @returns デフォルトプリセット
   */
  getDefaultPreset(): Observable<ChatPreset> {
    return this.presets$.pipe(
      map(presets => {
        const defaultPreset = presets.find(preset => preset.isDefault);
        return defaultPreset || presets[0];
      })
    );
  }

  /**
   * 現在選択中のプリセットを取得
   * @returns 選択中のプリセット
   */
  getCurrentPreset(): Observable<ChatPreset | null> {
    const selectedId = this.selectedPresetSubject.value;
    return this.getPresetById(selectedId);
  }

  /**
   * プリセットを選択
   * @param presetId プリセットID
   */
  selectPreset(presetId: string): void {
    this.selectedPresetSubject.next(presetId);
  }

  /**
   * 新しいプリセットを作成
   * @param preset プリセット情報
   * @returns 作成されたプリセット
   */
  createPreset(preset: Omit<ChatPreset, 'id'>): Observable<ChatPreset> {
    const newPreset: ChatPreset = {
      ...preset,
      id: this.generatePresetId(),
      isDefault: false
    };

    const currentPresets = this.presetsSubject.value;
    const updatedPresets = [...currentPresets, newPreset];
    this.presetsSubject.next(updatedPresets);

    this.savePresetsToStorage(updatedPresets);

    return of(newPreset);
  }

  /**
   * プリセットを更新
   * @param presetId プリセットID
   * @param updates 更新内容
   * @returns 更新されたプリセット
   */
  updatePreset(presetId: string, updates: Partial<ChatPreset>): Observable<ChatPreset | null> {
    const currentPresets = this.presetsSubject.value;
    const presetIndex = currentPresets.findIndex(preset => preset.id === presetId);

    if (presetIndex === -1) {
      return of(null);
    }

    const updatedPreset = {
      ...currentPresets[presetIndex],
      ...updates,
      id: presetId // IDは変更不可
    };

    const updatedPresets = [...currentPresets];
    updatedPresets[presetIndex] = updatedPreset;
    this.presetsSubject.next(updatedPresets);

    this.savePresetsToStorage(updatedPresets);

    return of(updatedPreset);
  }

  /**
   * プリセットを削除
   * @param presetId プリセットID
   * @returns 削除成功フラグ
   */
  deletePreset(presetId: string): Observable<boolean> {
    const currentPresets = this.presetsSubject.value;
    const preset = currentPresets.find(p => p.id === presetId);

    // デフォルトプリセットは削除不可
    if (preset?.isDefault) {
      return of(false);
    }

    const updatedPresets = currentPresets.filter(preset => preset.id !== presetId);
    this.presetsSubject.next(updatedPresets);

    // 選択中のプリセットが削除された場合はデフォルトに戻す
    if (this.selectedPresetSubject.value === presetId) {
      this.selectedPresetSubject.next('default');
    }

    this.savePresetsToStorage(updatedPresets);

    return of(true);
  }

  /**
   * プリセットを複製
   * @param presetId 複製元のプリセットID
   * @param newName 新しい名前
   * @returns 複製されたプリセット
   */
  duplicatePreset(presetId: string, newName?: string): Observable<ChatPreset | null> {
    return this.getPresetById(presetId).pipe(
      map(originalPreset => {
        if (!originalPreset) {
          return null;
        }

        const duplicatedPreset: ChatPreset = {
          ...originalPreset,
          id: this.generatePresetId(),
          name: newName || `${originalPreset.name}のコピー`,
          isDefault: false
        };

        const currentPresets = this.presetsSubject.value;
        const updatedPresets = [...currentPresets, duplicatedPreset];
        this.presetsSubject.next(updatedPresets);

        this.savePresetsToStorage(updatedPresets);

        return duplicatedPreset;
      })
    );
  }

  /**
   * デフォルトシステムプロンプトを取得
   * @returns デフォルトシステムプロンプト
   */
  getDefaultSystemPrompt(): string {
    return this.defaultSystemPrompt;
  }

  /**
   * システムプロンプトでユーザー情報を置換
   * @param systemPrompt システムプロンプト
   * @param userName ユーザー名
   * @returns 置換後のシステムプロンプト
   */
  interpolateSystemPrompt(systemPrompt: string, userName: string = ''): string {
    const currentDateTime = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long'
    });

    return systemPrompt
      .replace(/\${user_name}/g, userName || 'ユーザー')
      .replace(/\${current_datetime}/g, currentDateTime);
  }

  /**
   * プリセットをエクスポート
   * @param presetIds エクスポート対象のプリセットID配列（省略時は全て）
   * @returns エクスポートデータ
   */
  exportPresets(presetIds?: string[]): Observable<{ presets: ChatPreset[], version: string }> {
    return this.presets$.pipe(
      map(presets => {
        const targetPresets = presetIds 
          ? presets.filter(preset => presetIds.includes(preset.id))
          : presets.filter(preset => !preset.isDefault); // デフォルトプリセットは除外

        return {
          presets: targetPresets,
          version: '1.0'
        };
      })
    );
  }

  /**
   * プリセットをインポート
   * @param exportData エクスポートデータ
   * @param overwrite 既存プリセットを上書きするか
   * @returns インポート結果
   */
  importPresets(exportData: { presets: ChatPreset[], version: string }, overwrite = false): Observable<{
    imported: number,
    skipped: number,
    errors: string[]
  }> {
    const currentPresets = this.presetsSubject.value;
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    const newPresets = [...currentPresets];

    exportData.presets.forEach(preset => {
      try {
        const existingIndex = newPresets.findIndex(p => p.id === preset.id);
        
        if (existingIndex !== -1) {
          if (overwrite && !newPresets[existingIndex].isDefault) {
            // 既存の非デフォルトプリセットを上書き
            newPresets[existingIndex] = { ...preset, isDefault: false };
            imported++;
          } else {
            // 重複をスキップ
            skipped++;
          }
        } else {
          // 新規追加
          newPresets.push({ ...preset, isDefault: false });
          imported++;
        }
      } catch (error) {
        errors.push(`プリセット "${preset.name}" のインポートに失敗: ${error}`);
      }
    });

    this.presetsSubject.next(newPresets);
    this.savePresetsToStorage(newPresets);

    return of({ imported, skipped, errors });
  }

  /**
   * プリセットをローカルストレージに保存
   * @param presets プリセット配列
   */
  private savePresetsToStorage(presets: ChatPreset[]): void {
    try {
      const customPresets = presets.filter(preset => !preset.isDefault);
      localStorage.setItem('chat_presets', JSON.stringify(customPresets));
    } catch (error) {
      console.error('Failed to save presets to storage:', error);
    }
  }

  /**
   * ローカルストレージからプリセットを読み込み
   */
  loadPresetsFromStorage(): void {
    try {
      const stored = localStorage.getItem('chat_presets');
      if (stored) {
        const customPresets: ChatPreset[] = JSON.parse(stored);
        const currentPresets = this.presetsSubject.value;
        const defaultPresets = currentPresets.filter(preset => preset.isDefault);
        
        this.presetsSubject.next([...defaultPresets, ...customPresets]);
      }
    } catch (error) {
      console.error('Failed to load presets from storage:', error);
    }
  }

  /**
   * プリセットIDを生成
   * @returns 一意なプリセットID
   */
  private generatePresetId(): string {
    return `preset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * プリセットの並び順を変更
   * @param presetIds 新しい順序のプリセットID配列
   */
  reorderPresets(presetIds: string[]): Observable<boolean> {
    const currentPresets = this.presetsSubject.value;
    const presetMap = new Map(currentPresets.map(preset => [preset.id, preset]));
    
    const reorderedPresets = presetIds
      .map(id => presetMap.get(id))
      .filter((preset): preset is ChatPreset => preset !== undefined);

    // 並び順指定にないプリセットを末尾に追加
    const unspecifiedPresets = currentPresets.filter(
      preset => !presetIds.includes(preset.id)
    );

    const finalPresets = [...reorderedPresets, ...unspecifiedPresets];
    this.presetsSubject.next(finalPresets);

    this.savePresetsToStorage(finalPresets);

    return of(true);
  }

  /**
   * プリセットの検索
   * @param query 検索クエリ
   * @returns マッチするプリセット配列
   */
  searchPresets(query: string): Observable<ChatPreset[]> {
    return this.presets$.pipe(
      map(presets => {
        if (!query.trim()) {
          return presets;
        }

        const lowerQuery = query.toLowerCase();
        return presets.filter(preset => 
          preset.name.toLowerCase().includes(lowerQuery) ||
          preset.systemPrompt.toLowerCase().includes(lowerQuery)
        );
      })
    );
  }
}