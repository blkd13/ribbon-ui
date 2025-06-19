import { Component, Input, Output, EventEmitter, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { ChatService } from '../../../../services/chat.service';
import { ThreadGroup, Thread } from '../../../../models/project-models';
import { GPTModels } from '../../../../models/models';
import { ParameterSettingDialogComponent } from '../../../../parts/parameter-setting-dialog/parameter-setting-dialog.component';

@Component({
  selector: 'app-chat-model-selector',
  standalone: true,
  imports: [
    CommonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule
  ],
  template: `
    <div class="model-selector-container">
      <!-- Model Selection -->
      <mat-form-field appearance="outline" class="model-select-field">
        <mat-label>AIモデル</mat-label>
        <mat-select 
          [value]="selectedModelId" 
          (selectionChange)="onModelChange($event.value)">
          @for (model of availableModels; track model.id) {
            <mat-option [value]="model.id">
              {{ model.label || model.id }}
            </mat-option>
          }
        </mat-select>
      </mat-form-field>

      <!-- Model Settings Button -->
      <button 
        mat-icon-button 
        (click)="openModelSettings()"
        matTooltip="モデル設定"
        class="settings-button">
        <mat-icon>settings</mat-icon>
      </button>

      <!-- Current Model Info -->
      @if (selectedModel) {
        <div class="model-info">
          <div class="model-name">{{ selectedModel.label || selectedModel.id }}</div>
          @if (currentThread) {
            <div class="model-params">
              <span>Max Tokens: {{ currentThread.inDto.args.max_tokens || 'Auto' }}</span>
              <span>Temperature: {{ currentThread.inDto.args.temperature || 0.7 }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .model-selector-container {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .model-select-field {
      flex: 1;
      min-width: 200px;
    }

    .settings-button {
      flex-shrink: 0;
    }

    .model-info {
      display: flex;
      flex-direction: column;
      font-size: 0.8em;
      color: var(--text-secondary, #666);
    }

    .model-name {
      font-weight: 500;
    }

    .model-params {
      display: flex;
      gap: 12px;
      font-size: 0.9em;
    }
  `]
})
export class ChatModelSelectorComponent implements OnInit {
  @Input() threadGroup!: ThreadGroup;
  @Input() selectedModelId?: string;
  @Input() availableModels: GPTModels[] = [];
  
  @Output() modelChanged = new EventEmitter<string>();
  @Output() settingsChanged = new EventEmitter<ThreadGroup>();

  private dialog = inject(MatDialog);
  private chatService = inject(ChatService);

  selectedModel?: GPTModels;
  currentThread?: Thread;

  ngOnInit(): void {
    this.updateSelectedModel();
    this.updateCurrentThread();
  }

  ngOnChanges(): void {
    this.updateSelectedModel();
    this.updateCurrentThread();
  }

  onModelChange(modelId: string): void {
    this.selectedModelId = modelId;
    this.updateSelectedModel();
    this.modelChanged.emit(modelId);
  }

  openModelSettings(): void {
    const dialogRef = this.dialog.open(ParameterSettingDialogComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: { threadGroup: this.threadGroup }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.threadGroup) {
        this.settingsChanged.emit(result.threadGroup);
      }
    });
  }

  private updateSelectedModel(): void {
    if (this.selectedModelId) {
      this.selectedModel = this.availableModels.find(m => m.id === this.selectedModelId);
    }
  }

  private updateCurrentThread(): void {
    if (this.threadGroup?.threadList?.length > 0) {
      // 最初のスレッドの設定を表示
      this.currentThread = this.threadGroup.threadList[0];
    }
  }
}