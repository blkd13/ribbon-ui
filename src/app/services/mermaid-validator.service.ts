import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, of } from 'rxjs';
import { catchError, map, reduce, switchMap } from 'rxjs/operators';
import { ChatService } from './chat.service';

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
    private readonly logger = inject(LoggerService);

    defaultModel = 'claude-sonnet-4@20250514'; // デフォルトのAIモデル
    defaultSystemPrompt = Utils.trimLines(`
        You are a Mermaid expert. Please fix the Mermaid code that contains syntax errors.

        ## Correction Rules:

        1. Preserve the original intent of the code as much as possible
        2. Completely fix any syntax errors
        3. Return **only** the corrected Mermaid code
        4. Do **not** include explanations or Markdown code block symbols
        5. Follow correct Mermaid syntax

        ## Step-by-Step Correction Approach:

        1. First, create a version that works with minimal changes
        2. Simplify complex structures (such as \`par\`, \`alt\`, \`loop\`, etc.) into a basic sequential flow
        3. Once the errors are resolved, incrementally reintroduce features as needed

        ## Diagram-Specific Guidelines:

        ### Sequence Diagrams:

        * Check for proper pairing of \`activate\` / \`deactivate\` (omit if overly complex)
        * Avoid deeply nested structures like \`par\`, \`alt\`, and \`loop\`; convert to simple sequences where possible
        * Replace invalid characters in node/action names (spaces, apostrophes, special symbols) with underscores
        * Shorten or simplify long labels

        ### Flowcharts / Graphs:

        * Do not use spaces or special characters in node names (replace with underscores or appropriate characters)
        * Verify arrow notations (\`-->\`, \`->>\`, \`---\`, etc.)
        * Standardize quotation marks (use double quotes)

        ### Common Fixing Principles:

        * Be aware of Mermaid version-specific syntax (avoid mixing old and new formats)
        * Retain Japanese labels when possible (prioritize correct syntax)
        * Consider splitting or simplifying overly complex structures
        * Prioritize operational stability above all

        ## Common Error Patterns and Solutions:

        * Missing \`deactivate\` after \`activate\` → check the pairing or omit if needed
        * Incomplete \`alt\` / \`par\` / \`loop\` blocks → properly close them or simplify structure
        * Invalid characters in node names → replace with underscores or safe characters
        * Incorrect arrow notation → fix to proper Mermaid syntax
        * Inconsistent quotation marks → unify to double quotes
        * Strings containing apostrophes (\`'\`) → remove or replace with other characters

        ## Fixing Priorities:

        1. Resolve syntax errors (ensuring the code runs is top priority)
        2. Preserve the original intent (maintain original structure where possible)
        3. Improve readability (simplify when necessary)
        4. Ensure compatibility with the latest Mermaid version (avoid deprecated syntax)
    `);


    /**
     * Mermaidコードの構文チェックを行う
     */
    validateMermaidCode(code: string): Promise<MermaidValidationResult> {
        return new Promise(async (resolve) => {
            try {
                // Mermaidの構文チェック
                const parsed = await mermaid.parse(code);
                this.logger.debug('Mermaid code parsed successfully:', parsed);
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
            map(chunk => chunk.content.choices[0]?.delta?.content || ''),
            // ストリーミングレスポンスを結合
            reduce((acc: string, content: string) => acc + content, ''),
            map(fullContent => Utils.mdTrim(fullContent.trim())),
            catchError(error => {
                this.logger.error('AI修正でエラーが発生しました:', error);
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
                    this.logger.error('Mermaid修正エラー:', error);
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
                            this.logger.error('Mermaid修正エラー:', error);
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
import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Utils } from '../utils';
import { LoggerService } from './logger';

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
