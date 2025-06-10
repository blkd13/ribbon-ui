// =================================
// tag-management-dialog.component.ts
// =================================
import { Component, inject, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Observable, map, startWith } from 'rxjs';
import { TagService, TagEntity, TagCreateRequest } from '../../../../services/model-manager.service';

export interface TagManagementDialogData {
  tags: TagEntity[];
}

export interface TagDisplayItem {
  type: 'category' | 'tag';
  category?: string;
  tag?: TagEntity;
  tagCount?: number;
  categoryActiveState?: 'all' | 'none' | 'partial';
}

@Component({
  selector: 'app-tag-management-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatAutocompleteModule,
  ],
  templateUrl: './tag-management-dialog.component.html',
  styleUrls: ['./tag-management-dialog.component.scss']
})
export class TagManagementDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tagService = inject(TagService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<TagManagementDialogComponent>);

  tagForm!: FormGroup;
  tags: TagEntity[] = [];
  displayTags: TagDisplayItem[] = [];
  editingTag: TagEntity | null = null;
  isLoading = false;
  availableCategories: string[] = [];
  filteredCategories!: Observable<string[]>;

  displayedColumns = ['tag', 'sortOrder', 'overrideOthers', 'usage', 'status', 'actions'];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: TagManagementDialogData
  ) {
    this.tags = [...(data.tags || [])];
  }

  ngOnInit() {
    this.initForm();
    this.initCategoryAutocomplete();
    this.loadTags();
  }

  private initForm() {
    this.tagForm = this.fb.group({
      name: ['', [
        Validators.required,
        // Validators.pattern(/^[a-z0-9-]+$/)
      ]],
      label: [''],
      category: [''],
      description: [''],
      color: [''],
      sortOrder: [0, [Validators.min(0)]],
      overrideOthers: [false],
      isActive: [true]
    });
  }

  private initCategoryAutocomplete() {
    this.filteredCategories = this.tagForm.get('category')!.valueChanges.pipe(
      startWith(''),
      map(value => this._filterCategories(value || ''))
    );
  }

  private _filterCategories(value: string): string[] {
    const filterValue = value.toLowerCase();
    return this.availableCategories.filter(category =>
      category.toLowerCase().includes(filterValue)
    );
  }

  private loadTags() {
    this.tagService.getTags().subscribe({
      next: (tags) => {
        // Sort tags by category, then sortOrder, then by name
        this.tags = tags.sort((a, b) => {
          // First sort by category
          const categoryA = a.category || '';
          const categoryB = b.category || '';
          if (categoryA !== categoryB) {
            return categoryA.localeCompare(categoryB);
          }
          // Then by sortOrder
          if (a.sortOrder !== b.sortOrder) {
            return (a.sortOrder || 0) - (b.sortOrder || 0);
          }
          // Finally by name
          return a.name.localeCompare(b.name);
        });

        // Extract unique categories for autocomplete
        this.availableCategories = [...new Set(tags
          .map(tag => tag.category)
          .filter(category => category && category.trim() !== '')
        )].sort() as string[];

        // Update filtered categories after loading
        this.initCategoryAutocomplete();

        // Create display items with category headers
        this.createDisplayItems();
      },
      error: (error) => {
        console.error('Error loading tags:', error);
        this.snackBar.open('Error loading tags', 'Close', { duration: 3000 });
      }
    });
  }

  private createDisplayItems() {
    this.displayTags = [];
    const groupedTags = this.groupTagsByCategory();

    for (const [category, tags] of groupedTags) {
      // Calculate category active state
      const activeTags = tags.filter(tag => tag.isActive);
      let categoryActiveState: 'all' | 'none' | 'partial';

      if (activeTags.length === tags.length) {
        categoryActiveState = 'all';
      } else if (activeTags.length === 0) {
        categoryActiveState = 'none';
      } else {
        categoryActiveState = 'partial';
      }

      // Add category header
      this.displayTags.push({
        type: 'category',
        category,
        tagCount: tags.length,
        categoryActiveState
      });

      // Add tags in this category
      for (const tag of tags) {
        this.displayTags.push({
          type: 'tag',
          tag
        });
      }
    }
  }

  private groupTagsByCategory(): Map<string, TagEntity[]> {
    const groups = new Map<string, TagEntity[]>();

    for (const tag of this.tags) {
      const category = tag.category || 'Uncategorized';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(tag);
    }

    return groups;
  }

  saveTag() {
    if (this.tagForm.invalid) return;

    this.isLoading = true;
    const formValue = this.tagForm.value;

    // Check if overrideOthers is being set to true
    if (formValue.overrideOthers && !this.editingTag?.overrideOthers) {
      const hasExistingOverride = this.tags.some(tag =>
        tag.overrideOthers && tag.id !== this.editingTag?.id
      );

      if (hasExistingOverride) {
        const confirmMessage = 'Another tag is already set to override others. Setting this tag as override will disable the other override tag. Continue?';
        if (!confirm(confirmMessage)) {
          this.isLoading = false;
          return;
        }
      }
    }

    const tagData: TagCreateRequest = {
      name: formValue.name,
      label: formValue.label || undefined,
      category: formValue.category || undefined,
      description: formValue.description || undefined,
      color: formValue.color || undefined,
      sortOrder: formValue.sortOrder || 0,
      overrideOthers: formValue.overrideOthers || false,
      isActive: formValue.isActive
    };

    const operation = this.editingTag
      ? this.tagService.updateTag(this.editingTag.id, tagData)
      : this.tagService.createTag(tagData);

    operation.subscribe({
      next: () => {
        const message = this.editingTag ? 'Tag updated successfully' : 'Tag created successfully';
        this.snackBar.open(message, 'Close', { duration: 3000 });
        this.loadTags();
        this.cancelEdit();
      },
      error: (error) => {
        console.error('Error saving tag:', error);
        const message = error.error?.message || 'Error saving tag';
        this.snackBar.open(message, 'Close', { duration: 3000 });
      },
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  editTag(tag: TagEntity) {
    this.editingTag = tag;
    this.tagForm.patchValue({
      name: tag.name,
      label: tag.label || '',
      category: tag.category || '',
      description: tag.description || '',
      color: tag.color || '',
      sortOrder: tag.sortOrder || 0,
      overrideOthers: tag.overrideOthers || false,
      isActive: tag.isActive
    });
  }

  cancelEdit() {
    this.editingTag = null;
    this.tagForm.reset({
      name: '',
      label: '',
      category: '',
      description: '',
      color: '',
      sortOrder: 0,
      overrideOthers: false,
      isActive: true
    });
  }

  deleteTag(tag: TagEntity) {
    if (tag.usageCount > 0) {
      this.snackBar.open('Cannot delete tag that is in use', 'Close', { duration: 3000 });
      return;
    }

    if (confirm(`Are you sure you want to delete the tag "${tag.label || tag.name}"?`)) {
      this.tagService.deleteTag(tag.id).subscribe({
        next: () => {
          this.snackBar.open('Tag deleted successfully', 'Close', { duration: 3000 });
          this.loadTags();
        },
        error: (error) => {
          console.error('Error deleting tag:', error);
          this.snackBar.open('Error deleting tag', 'Close', { duration: 3000 });
        }
      });
    }
  }

  getNextSortOrder(): number {
    if (this.tags.length === 0) return 1;
    const maxOrder = Math.max(...this.tags.map(tag => tag.sortOrder || 0));
    return maxOrder + 1;
  }

  onOverrideOthersChange() {
    // Auto-suggest next sort order when override is enabled
    if (this.tagForm.get('overrideOthers')?.value && !this.editingTag) {
      this.tagForm.patchValue({
        sortOrder: this.getNextSortOrder()
      });
    }
  }

  toggleCategoryActive(category: string, currentState: 'all' | 'none' | 'partial') {
    // Determine new active state - if all or partial, make all inactive; if none, make all active
    const newActiveState = currentState === 'none';

    // Get all tags in this category
    const tagsInCategory = this.tags.filter(tag => (tag.category || 'Uncategorized') === category);

    if (tagsInCategory.length === 0) return;

    // Show confirmation for bulk operation
    const action = newActiveState ? 'activate' : 'deactivate';
    const confirmMessage = `Are you sure you want to ${action} all ${tagsInCategory.length} tags in category "${category}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.isLoading = true;

    // Update all tags in parallel
    const updatePromises = tagsInCategory.map(tag => {
      const updateData = { ...tag, isActive: newActiveState };
      return this.tagService.updateTag(tag.id, updateData).toPromise();
    });

    Promise.all(updatePromises)
      .then(() => {
        const message = `Successfully ${action}d ${tagsInCategory.length} tags in category "${category}"`;
        this.snackBar.open(message, 'Close', { duration: 3000 });
        this.loadTags(); // Reload to reflect changes
      })
      .catch((error) => {
        console.error('Error updating category tags:', error);
        this.snackBar.open('Error updating category tags', 'Close', { duration: 3000 });
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  getCategoryTooltip(state: 'all' | 'none' | 'partial'): string {
    switch (state) {
      case 'all':
        return 'All tags in this category are active. Click to deactivate all.';
      case 'none':
        return 'All tags in this category are inactive. Click to activate all.';
      case 'partial':
        return 'Some tags in this category are active. Click to deactivate all.';
      default:
        return '';
    }
  }

  close() {
    this.dialogRef.close(true); // tagsが更新されたことを示すためtrueを返す
  }

  // Row type checking functions for mat-table
  isCategoryRow = (index: number, item: TagDisplayItem): boolean => item.type === 'category';
  isTagRow = (index: number, item: TagDisplayItem): boolean => item.type === 'tag';
}