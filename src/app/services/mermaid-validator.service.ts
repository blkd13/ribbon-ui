import { Injectable, inject } from '@angular/core';
import { Observable, of, from } from 'rxjs';
import { map, catchError, switchMap, reduce } from 'rxjs/operators';
import { ChatService } from './chat.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';

declare const mermaid: any;

export interface MermaidValidationResult {
    isValid: boolean;
    error?: string;
    originalCode: string;
    fixedCode?: string;
}

export interface MermaidFixRequest {
    code: string;
    error: string;
}

@Injectable({
    providedIn: 'root'
})
export class MermaidValidatorService {
    private readonly chatService = inject(ChatService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly dialog = inject(MatDialog);

    defaultModel = 'claude-sonnet-4-20250514'; // デフォルトのAIモデル
    defaultSystemPrompt = Utils.trimLines(`
        あなたはMermaidの専門家です。構文エラーのあるMermaidコードを修正してください。

        ## 修正ルール：
        1. 元のコードの意図を可能な限り保持する
        2. 構文エラーを完全に修正する
        3. 修正されたMermaidコードのみを返す
        4. 説明やマークダウンのコードブロック記号は含めない
        5. 正しいMermaid構文に従う

        ## 段階的修正アプローチ：
        1. まず最小限の修正で動作するバージョンを作成
        2. 複雑な構文（par/alt/loop等）は一旦シンプルな順序構造に簡素化
        3. エラーが解消されたら、必要に応じて段階的に機能を追加

        ## 図タイプ別の修正ガイドライン：

        ### シーケンス図：
        - activate/deactivateの対応関係を確認（複雑になる場合は省略を推奨）
        - par/alt/loopなどの複雑なネストは極力避け、シンプルな順序構造に変換
        - ノード名やアクション名の不正文字（空白、アポストロフィ、特殊記号）はアンダースコアに置換
        - 長いラベルは短縮化または簡潔な表現に変更

        ### フローチャート/グラフ：
        - ノード名に空白や特殊文字を使用しない（アンダースコアや適切な文字に置換）
        - 矢印記法の確認（-->、->>、---など）
        - 引用符の統一（ダブルクォートを推奨）

        ### 共通の修正方針：
        - Mermaidのバージョン依存構文に注意（古い/新しい記法の混在を避ける）
        - 日本語ラベルは基本的に保持（構文の正しさを優先）
        - 複雑すぎる構造は分割または単純化を検討
        - 動作の安定性を最優先とする

        ## よくあるエラーパターンと対処法：
        - activate後のdeactivate漏れ → 対応関係を確認または省略
        - alt/par/loopの不完全なend → 正しく閉じるか、構造を単純化
        - ノード名の不正文字 → アンダースコアや安全な文字に置換
        - 矢印記法の間違い → 正しい矢印記法に修正
        - 引用符の不整合 → ダブルクォートに統一
        - アポストロフィ（'）を含む文字列 → 削除または別の文字に置換

        ## 修正の優先順位：
        1. 構文エラーの解消（動作することが最優先）
        2. 意図の保持（可能な限り元の構造を維持）
        3. 可読性の向上（必要に応じて簡素化）
    `);


    /**
     * Mermaidコードの構文チェックを行う
     */
    validateMermaidCode(code: string): Promise<MermaidValidationResult> {
        return new Promise(async (resolve) => {
            try {
                // Mermaidの構文チェック
                const parsed = await mermaid.parse(code);
                console.log('Mermaid code parsed successfully:', parsed);
                resolve({
                    isValid: true,
                    originalCode: code
                });
            } catch (error: any) {
                resolve({
                    isValid: false,
                    error: error.message || 'Mermaid syntax error',
                    originalCode: code
                });
            }
        });
    }

    /**
     * マークダウンテキストからMermaidコードブロックを抽出
     */
    extractMermaidBlocks(markdown: string): { code: string; startIndex: number; endIndex: number }[] {
        const mermaidBlocks: { code: string; startIndex: number; endIndex: number }[] = [];
        const regex = /```mermaid\n([\s\S]*?)\n```/g;
        let match;

        while ((match = regex.exec(markdown)) !== null) {
            mermaidBlocks.push({
                code: match[1],
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }

        return mermaidBlocks;
    }

    /**
     * AIを使用してMermaidコードを修正
     */
    fixMermaidWithAI(request: MermaidFixRequest, model: string = 'gpt-4o-mini', customPrompt?: string): Observable<string> {
        const systemPrompt = customPrompt || this.defaultSystemPrompt;

        const userPrompt = Utils.trimLines(`
            以下のMermaidコードに構文エラーがあります：

            エラー: ${request.error}

            修正が必要なMermaidコード:
            \`\`\`
            ${request.code}
            \`\`\`

            このコードを正しいMermaid構文に修正してください。修正されたコードのみを返してください。
        `);

        return this.chatService.chatCompletionObservableStreamNew({
            args: {
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.1,
                stream: true
            }
        }).pipe(
            switchMap(response => response.observer),
            map(chunk => chunk.choices[0]?.delta?.content || ''),
            // ストリーミングレスポンスを結合
            reduce((acc: string, content: string) => acc + content, ''),
            map(fullContent => Utils.mdTrim(fullContent.trim())),
            catchError(error => {
                console.error('AI修正でエラーが発生しました:', error);
                this.snackBar.open('AI修正に失敗しました', 'Close', { duration: 5000 });
                return of(request.code); // 元のコードを返す
            })
        );
    }
    /**
    * マークダウンテキスト内のMermaidエラーを検知
    */
    async detectMermaidErrors(markdown: string): Promise<{ hasErrors: boolean; errors: Array<{ code: string; error: string; startIndex: number; endIndex: number }> }> {
        const mermaidBlocks = this.extractMermaidBlocks(markdown);
        const errors: Array<{ code: string; error: string; startIndex: number; endIndex: number }> = [];

        for (const block of mermaidBlocks) {
            const validation = await this.validateMermaidCode(block.code);

            if (!validation.isValid && validation.error) {
                errors.push({
                    code: block.code,
                    error: validation.error,
                    startIndex: block.startIndex,
                    endIndex: block.endIndex
                });
            }
        }

        return {
            hasErrors: errors.length > 0,
            errors
        };
    }

    /**
     * マークダウンテキスト内のMermaidエラーを修正
     */
    async fixMermaidInMarkdown(markdown: string, model: string = 'gpt-4o-mini', customPrompt?: string): Promise<{ fixed: boolean; result: string }> {
        const mermaidBlocks = this.extractMermaidBlocks(markdown);
        let hasErrors = false;
        let fixedMarkdown = markdown;

        for (const block of mermaidBlocks) {
            const validation = await this.validateMermaidCode(block.code);

            if (!validation.isValid && validation.error) {
                hasErrors = true;

                try {
                    const fixedCode = await this.fixMermaidWithAI({
                        code: block.code,
                        error: validation.error
                    }, model, customPrompt).toPromise();

                    if (fixedCode) {
                        // 修正されたコードで置換
                        const newBlock = `\`\`\`mermaid\n${fixedCode}\n\`\`\``;
                        fixedMarkdown = fixedMarkdown.substring(0, block.startIndex) +
                            newBlock +
                            fixedMarkdown.substring(block.endIndex);

                        this.snackBar.open('Mermaidコードを修正しました', 'Close', { duration: 3000 });
                    }
                } catch (error) {
                    console.error('Mermaid修正エラー:', error);
                    this.snackBar.open('Mermaid修正に失敗しました', 'Close', { duration: 5000 });
                }
            }
        }

        return {
            fixed: hasErrors,
            result: fixedMarkdown
        };
    }
    /**
     * エラー修正ダイアログを表示して修正を実行
     */
    async showFixDialog(markdown: string, errors: Array<{ code: string; error: string; startIndex: number; endIndex: number }>): Promise<{ success: boolean; result?: string }> {
        return new Promise((resolve) => {
            import('../parts/mermaid-fix-dialog/mermaid-fix-dialog.component').then(({ MermaidFixDialogComponent }) => {
                const dialogRef = this.dialog.open(MermaidFixDialogComponent, {
                    data: { errors },
                    width: '500px',
                    disableClose: true
                });

                dialogRef.afterClosed().subscribe(async result => {
                    if (result?.proceed) {
                        try {
                            const fixResult = await this.fixMermaidInMarkdown(markdown, result.model, result.customPrompt);
                            resolve({ success: true, result: fixResult.result });
                        } catch (error) {
                            console.error('Mermaid修正エラー:', error);
                            this.snackBar.open('修正に失敗しました', 'Close', { duration: 5000 });
                            resolve({ success: false });
                        }
                    } else {
                        resolve({ success: false });
                    }
                });
            });
        });
    }
}

// 確認ダイアログコンポーネント（簡易版）
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Utils } from '../utils';

@Component({
    selector: 'app-mermaid-fix-confirm-dialog',
    standalone: true,
    imports: [CommonModule, MatDialogModule, MatButtonModule],
    template: `
    <h2 mat-dialog-title>Mermaid構文エラー検出</h2>
    <mat-dialog-content>
      <p>Mermaidコードに構文エラーが見つかりました：</p>
      <div class="error-message">{{ data.error }}</div>
      <p>AIに自動修正させますか？</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button (click)="onNoClick()">キャンセル</button>
      <button mat-button color="primary" (click)="onYesClick()">修正する</button>
    </mat-dialog-actions>
  `,
    styles: [`
    .error-message {
      background-color: #ffebee;
      color: #c62828;
      padding: 8px;
      border-radius: 4px;
      margin: 8px 0;
      font-family: monospace;
      font-size: 0.9em;
    }
  `]
})
export class MermaidFixConfirmDialogComponent {
    constructor(
        public dialogRef: MatDialogRef<MermaidFixConfirmDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { error: string }
    ) { }

    onNoClick(): void {
        this.dialogRef.close(false);
    }

    onYesClick(): void {
        this.dialogRef.close(true);
    }
}
