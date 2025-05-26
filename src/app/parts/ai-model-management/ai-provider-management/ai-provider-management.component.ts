import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { genInitialBaseEntity } from '../../../services/project.service';
import { JsonEditorComponent } from "../../json-editor/json-editor.component";
import { AIProviderEntity, AIProviderManagerService, AIProviderType, ScopeType } from '../../../services/model-manager.service';

@Component({
  selector: 'app-ai-provider-management',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    JsonEditorComponent,
  ],
  templateUrl: './ai-provider-management.component.html',
  styleUrl: './ai-provider-management.component.scss',
  providers: [AIProviderManagerService]
})
export class AIProviderManagementComponent implements OnInit {
  // Services and forms
  private fb: FormBuilder = inject(FormBuilder);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private providerService: AIProviderManagerService = inject(AIProviderManagerService);

  // Component state
  form!: FormGroup;
  providers: AIProviderEntity[] = [];
  isFormVisible = false;
  isEditMode = false;
  activeTab = 'basic'; // basic, scope, metadata

  // Enum options for dropdowns
  providerOptions = Object.values(AIProviderType);
  scopeTypeOptions = Object.values(ScopeType);

  constructor() {
    this.loadProviders();
  }

  ngOnInit() {
    this.initForm();
  }

  // Load all providers
  loadProviders() {
    this.providerService.getProviderTemplates().subscribe(providers => {
      this.providers = providers;
    });
  }

  // Initialize the form
  initForm() {
    this.form = this.fb.group({
      id: [''],
      provider: ['', Validators.required],
      label: ['', Validators.required],
      isActive: [true],
      scopeInfo: this.fb.group({
        scopeType: ['', Validators.required],
        scopeId: ['', Validators.required]
      }),
      metadata: [{}]
    });
  }

  // Set active tab
  setActiveTab(tabName: string) {
    this.activeTab = tabName;
  }

  // Create new provider
  createNew() {
    this.isEditMode = false;
    this.initForm();
    this.form.patchValue({ isActive: true });
    this.isFormVisible = true;
    this.setActiveTab('basic');
  }

  // Select existing provider
  selectProvider(provider: AIProviderEntity) {
    this.isEditMode = true;
    this.isFormVisible = true;
    this.setActiveTab('basic');

    // Patch form with provider data
    this.form.patchValue({
      id: provider.id,
      provider: provider.provider,
      label: provider.label,
      isActive: provider.isActive,
      scopeInfo: {
        scopeType: provider.scopeInfo.scopeType,
        scopeId: provider.scopeInfo.scopeId
      },
      metadata: provider.metadata || {}
    });
  }

  // Register (create or update) provider
  register() {
    if (this.form.invalid) {
      // Activate tab with errors
      this.activateTabWithErrors();
      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched(this.form);

      this.snackBar.open('Please fix the validation errors', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    try {
      // Create provider entity from form data
      const formValue = this.form.value;
      const providerData: AIProviderEntity = {
        ...genInitialBaseEntity(),
        id: formValue.id || Date.now().toString(),
        provider: formValue.provider,
        label: formValue.label,
        isActive: formValue.isActive,
        scopeInfo: {
          scopeType: formValue.scopeInfo.scopeType,
          scopeId: formValue.scopeInfo.scopeId
        },
        metadata: formValue.metadata
      };

      // Save provider
      this.providerService.upsertProvider(providerData);

      this.snackBar.open(
        this.isEditMode ? 'Provider updated successfully' : 'Provider created successfully',
        'Close',
        { duration: 3000 }
      );

      this.loadProviders();
      this.closeForm();
    } catch (error) {
      console.error('Error processing form data:', error);
      this.snackBar.open('Error processing form data', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
    }
  }

  // Delete provider
  deleteProvider(id: string) {
    if (confirm('Are you sure you want to delete this provider?')) {
      this.providerService.deleteProvider(id);
      this.snackBar.open('Provider deleted successfully', 'Close', {
        duration: 3000
      });
      this.loadProviders();
      if (this.form.value.id === id) {
        this.closeForm();
      }
    }
  }

  // Close form
  closeForm() {
    this.isFormVisible = false;
    this.form.reset();
  }

  // Utility Methods
  // Activate tab with validation errors
  activateTabWithErrors() {
    const tabFields = {
      'basic': ['provider', 'label', 'isActive'],
      'scope': ['scopeInfo.scopeType', 'scopeInfo.scopeId'],
      'metadata': ['metadata']
    };

    for (const [tab, fields] of Object.entries(tabFields)) {
      for (const field of fields) {
        if (field.includes('.')) {
          if (this.hasNestedError(field)) {
            this.setActiveTab(tab);
            return;
          }
        } else {
          if (this.hasError(field)) {
            this.setActiveTab(tab);
            return;
          }
        }
      }
    }
  }

  // Check if a nested field has an error
  hasNestedError(path: string): boolean {
    const parts = path.split('.');
    if (parts.length !== 2) return false;

    const group = this.form.get(parts[0]) as FormGroup;
    if (!group) return false;

    const control = group.get(parts[1]);
    return !!control?.invalid && !!control?.touched;
  }

  // Get error message for a nested field
  getNestedErrorMessage(path: string): string {
    const parts = path.split('.');
    if (parts.length !== 2) return '';

    const group = this.form.get(parts[0]) as FormGroup;
    if (!group) return '';

    const control = group.get(parts[1]);
    if (!control) return '';

    if (control.errors?.['required']) {
      return 'This field is required';
    }
    return '';
  }

  // Check if a field has an error
  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control?.invalid && !!control?.touched;
  }

  // Get error message for a field
  getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control) return '';

    if (control.errors?.['required']) {
      return 'This field is required';
    }
    return '';
  }

  // Mark all form controls as touched to show validation errors
  markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else {
        control?.markAsTouched();
      }
    });
  }
}