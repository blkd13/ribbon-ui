import { TextFieldModule } from '@angular/cdk/text-field';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ExecutionMode = 'print' | 'interactive';

@Component({
    selector: 'app-session-input-area',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatMenuModule,
        MatTooltipModule,
        TextFieldModule,
    ],
    templateUrl: './session-input-area.component.html',
    styleUrls: ['./session-input-area.component.scss']
})
export class SessionInputAreaComponent {
    @Input() isExecuting = false;
    @Input() isForkMode = false;
    @Input() executionMode: ExecutionMode = 'interactive';
    @Input() hasPendingToolUse = false;
    @Input() disabled = false;
    @Input() hasExistingSession = false;  // 既存セッションかどうか（分岐ボタン表示用）
    @Input() enterMode: 'Enter' | 'Ctrl+Enter' = 'Enter';

    @Output() execute = new EventEmitter<string>();
    @Output() cancel = new EventEmitter<void>();
    @Output() modeChange = new EventEmitter<ExecutionMode>();
    @Output() startFork = new EventEmitter<void>();
    @Output() cancelFork = new EventEmitter<void>();

    promptInput = '';

    get isInputDisabled(): boolean {
        return this.isExecuting || this.hasPendingToolUse || this.disabled;
    }

    get placeholder(): string {
        if (this.isForkMode) {
            return '分岐後の質問を入力...';
        }
        return '例: このプロジェクトの構造を説明してください';
    }

    get label(): string {
        if (this.isForkMode) {
            return '分岐プロンプト';
        }
        return 'ClaudeCodeに送信するプロンプト';
    }

    get hint(): string {
        const modeHint = this.executionMode === 'interactive' ? '対話モード' : '自動モード';
        if (this.isForkMode) {
            return `分岐モード: 新しいセッションを作成します | ${modeHint}`;
        }
        return `${this.enterMode}で送信 | ${modeHint}`;
    }

    get sendButtonTooltip(): string {
        if (this.isForkMode) {
            return '分岐して送信';
        }
        return this.enterMode;
    }

    onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            if (event.shiftKey) {
                // Shift+Enter: 改行（デフォルト動作）
                return;
            }

            const shouldSend = (this.enterMode === 'Ctrl+Enter' && event.ctrlKey) ||
                               this.enterMode === 'Enter';

            if (shouldSend) {
                event.preventDefault();
                this.onExecute();
            }
        }
    }

    onExecute(): void {
        if (!this.promptInput.trim() || this.isInputDisabled) {
            return;
        }
        this.execute.emit(this.promptInput);
        this.promptInput = '';
    }

    onCancel(): void {
        this.cancel.emit();
    }

    onModeChange(mode: ExecutionMode): void {
        this.executionMode = mode;
        this.modeChange.emit(mode);
    }

    onStartFork(): void {
        this.startFork.emit();
    }

    onCancelFork(): void {
        this.cancelFork.emit();
    }
}
