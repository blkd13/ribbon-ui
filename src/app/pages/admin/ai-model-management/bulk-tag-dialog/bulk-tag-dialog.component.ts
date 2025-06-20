import { Component, Inject, OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { Observable, startWith, map } from 'rxjs';
import { TagEntity } from '../../../../services/model-manager.service';
import { MatChipInputEvent } from '@angular/material/chips';
import { COMMA, ENTER } from '@angular/cdk/keycodes';

export interface BulkTagDialogData {
  selectedModels: string[];
  availableTags: TagEntity[];
  models: any[];
}

@Component({
  selector: 'app-bulk-tag-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>Add Tags to {{ data.selectedModels.length }} Models</h2>
    
    <mat-dialog-content>
      <div class="selected-models-info">
        <p>Selected models: {{ selectedModelNames.join(', ') }}</p>
      </div>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Add Tags</mat-label>
        <mat-chip-grid #chipGrid>
          @for (tag of selectedTags; track tag) {
          <mat-chip-row (removed)="removeTag(tag)">
            {{ tag }}
            <button matChipRemove>
              <mat-icon>cancel</mat-icon>
            </button>
          </mat-chip-row>
          }
          <input 
            placeholder="Type tag name..."
            #tagInput
            [formControl]="tagCtrl"
            [matAutocomplete]="auto"
            [matChipInputFor]="chipGrid"
            [matChipInputSeparatorKeyCodes]="separatorKeysCodes"
            (matChipInputTokenEnd)="addTag($event)">
        </mat-chip-grid>
        <mat-autocomplete #auto="matAutocomplete" (optionSelected)="selectTag($event)">
          @for (tag of filteredTags | async; track tag.name) {
          <mat-option [value]="tag.name">
            <div class="tag-option">
              <span class="tag-name">{{ tag.label || tag.name }}</span>
              @if (tag.description) {
              <small class="tag-description">{{ tag.description }}</small>
              }
            </div>
          </mat-option>
          }
        </mat-autocomplete>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions>
      <button mat-raised-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" 
              (click)="onConfirm()"
              [disabled]="selectedTags.length === 0">
        Add {{ selectedTags.length }} Tags
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

    .full-width {
      width: 100%;
    }

    .tag-option {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      width: 100%;
    }

    .tag-name {
      font-weight: 500;
    }

    .tag-description {
      color: #666;
      font-size: 12px;
      margin-top: 2px;
    }

    mat-dialog-content {
      min-width: 400px;
      min-height: 200px;
    }
  `]
})
export class BulkTagDialogComponent implements OnInit {
  tagCtrl = new FormControl('');
  selectedTags: string[] = [];
  filteredTags: Observable<TagEntity[]>;
  selectedModelNames: string[] = [];

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  constructor(
    public dialogRef: MatDialogRef<BulkTagDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BulkTagDialogData
  ) {
    this.filteredTags = this.tagCtrl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterTags(value || ''))
    );
  }

  ngOnInit() {
    this.selectedModelNames = this.data.selectedModels.map(id => {
      const model = this.data.models.find(m => m.id === id);
      return model ? model.name : id;
    });
  }

  private _filterTags(value: string): TagEntity[] {
    const filterValue = value.toLowerCase();
    return this.data.availableTags.filter(tag =>
      (tag.label || tag.name).toLowerCase().includes(filterValue) &&
      !this.selectedTags.includes(tag.name)
    );
  }

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value && !this.selectedTags.includes(value)) {
      this.selectedTags.push(value);
    }
    event.chipInput!.clear();
    this.tagCtrl.setValue('');
  }

  removeTag(tag: string): void {
    const index = this.selectedTags.indexOf(tag);
    if (index >= 0) {
      this.selectedTags.splice(index, 1);
    }
  }

  selectTag(event: any): void {
    const tagName = event.option.value;
    if (tagName && !this.selectedTags.includes(tagName)) {
      this.selectedTags.push(tagName);
    }
    this.tagCtrl.setValue('');
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    this.dialogRef.close({ tags: this.selectedTags });
  }
}