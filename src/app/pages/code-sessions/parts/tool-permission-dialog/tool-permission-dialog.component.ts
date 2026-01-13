import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

export interface PendingToolUse {
    id: string;
    name: string;
    input: any;
}

export type ToolPermissionResponse = '1' | '2' | 'esc';

@Component({
    selector: 'app-tool-permission-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatCardModule,
        MatButtonModule,
        MatIconModule,
    ],
    templateUrl: './tool-permission-dialog.component.html',
    styleUrls: ['./tool-permission-dialog.component.scss']
})
export class ToolPermissionDialogComponent {
    @Input() pendingToolUse: PendingToolUse | null = null;

    @Output() respond = new EventEmitter<ToolPermissionResponse>();

    @HostListener('document:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent): void {
        if (!this.pendingToolUse) return;

        if (event.key === '1') {
            event.preventDefault();
            this.onApprove();
        } else if (event.key === 'Escape' || event.key === '2') {
            event.preventDefault();
            this.onReject();
        }
    }

    onApprove(): void {
        this.respond.emit('1');
    }

    onReject(): void {
        this.respond.emit('esc');
    }

    getToolIcon(toolName: string): string {
        switch (toolName) {
            case 'Bash': return 'terminal';
            case 'Edit': return 'edit';
            case 'Read': return 'visibility';
            case 'Write': return 'create';
            case 'Glob': return 'search';
            case 'Grep': return 'manage_search';
            case 'TodoWrite': return 'checklist';
            case 'WebFetch': return 'language';
            case 'Task': return 'assignment';
            default: return 'build';
        }
    }
}
