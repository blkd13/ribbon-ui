import { Component, Inject, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { AIProviderEntity } from '../../../../services/model-manager.service';

export interface BulkProviderDialogData {
  selectedModels: string[];
  availableProviders: AIProviderEntity[];
  models: any[];
}

@Component({
  selector: 'app-bulk-provider-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule
  ],
  template: `
    <h2 mat-dialog-title>Set Providers for {{ data.selectedModels.length }} Models</h2>
    
    <mat-dialog-content>
      <div class="selected-models-info">
        <p>Selected models: {{ selectedModelNames.join(', ') }}</p>
      </div>

      <div class="provider-selection">
        <h3>Select Providers</h3>
        <div class="provider-list">
          @for (provider of data.availableProviders; track provider.id) {
          <mat-checkbox 
            [checked]="isProviderSelected(provider.name)"
            (change)="toggleProvider(provider.name, $event.checked)">
            <div class="provider-info">
              <span class="provider-name">{{ provider.label || provider.name }}</span>
              <small class="provider-type">{{ provider.type }}</small>
            </div>
          </mat-checkbox>
          }
        </div>
      </div>

      @if (selectedProviders.length > 0) {
      <div class="selected-providers">
        <h4>Selected Providers ({{ selectedProviders.length }})</h4>
        <div class="provider-chips">
          @for (provider of selectedProviders; track provider) {
          <span class="provider-chip">{{ provider }}</span>
          }
        </div>
      </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-raised-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="onConfirm()"
              [disabled]="selectedProviders.length === 0">
        Set {{ selectedProviders.length }} Providers
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .selected-models-info {
      margin-bottom: 16px;
      padding: 12px;
      background-color: #f5f5f5;
      border-radius: 4px;
      border-left: 4px solid #2196f3;
    }

    .selected-models-info p {
      margin: 0;
      font-size: 14px;
      color: #666;
    }

    .provider-selection h3 {
      margin: 16px 0 12px 0;
      font-size: 16px;
      font-weight: 500;
    }

    .provider-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .provider-info {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .provider-name {
      font-weight: 500;
    }

    .provider-type {
      color: #666;
      font-size: 12px;
    }

    .selected-providers {
      margin-top: 16px;
      padding: 12px;
      background-color: #e8f5e8;
      border-radius: 4px;
      border-left: 4px solid #4caf50;
    }

    .selected-providers h4 {
      margin: 0 0 8px 0;
      font-size: 14px;
      font-weight: 500;
    }

    .provider-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .provider-chip {
      display: inline-block;
      padding: 4px 8px;
      background-color: #4caf50;
      color: white;
      border-radius: 12px;
      font-size: 12px;
    }

    mat-dialog-content {
      min-width: 400px;
      min-height: 200px;
    }
  `]
})
export class BulkProviderDialogComponent implements OnInit {
  selectedProviders: string[] = [];
  selectedModelNames: string[] = [];

  constructor(
    public dialogRef: MatDialogRef<BulkProviderDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BulkProviderDialogData
  ) {}

  ngOnInit() {
    this.selectedModelNames = this.data.selectedModels.map(id => {
      const model = this.data.models.find(m => m.id === id);
      return model ? model.name : id;
    });
  }

  isProviderSelected(providerName: string): boolean {
    return this.selectedProviders.includes(providerName);
  }

  toggleProvider(providerName: string, checked: boolean): void {
    if (checked) {
      if (!this.selectedProviders.includes(providerName)) {
        this.selectedProviders.push(providerName);
      }
    } else {
      const index = this.selectedProviders.indexOf(providerName);
      if (index > -1) {
        this.selectedProviders.splice(index, 1);
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({ providers: this.selectedProviders });
  }
}