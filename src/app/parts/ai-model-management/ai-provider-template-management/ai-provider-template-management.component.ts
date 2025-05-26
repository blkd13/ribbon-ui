import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { AIProviderTemplateManagerService, AIProviderTemplateEntity, AIProviderType, ScopeInfo, ScopeType } from '../../../services/model-manager.service';
import { genInitialBaseEntity } from '../../../services/project.service';

interface RequiredField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  label: string;
  description?: string;
  placeholder?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
}

interface OptionalField extends RequiredField {
  defaultValue?: any;
}

interface TemplateDefinition {
  requiredFields: RequiredField[];
  optionalFields: OptionalField[];
  authType: 'API_KEY' | 'OAUTH2' | 'SERVICE_ACCOUNT';
  endpointTemplate?: string;
  documentationUrl?: string;
}

@Component({
  selector: 'app-ai-provider-template-management',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
  ],
  templateUrl: './ai-provider-template-management.component.html',
  styleUrl: './ai-provider-template-management.component.scss'
})
export class AIProviderTemplateManagementComponent implements OnInit {
  private fb: FormBuilder = inject(FormBuilder);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private templateService: AIProviderTemplateManagerService = inject(AIProviderTemplateManagerService);

  // Data
  templates: AIProviderTemplateEntity[] = [];
  selectedTemplate: AIProviderTemplateEntity | null = null;

  // Form
  form!: FormGroup;

  // UI State
  isFormVisible = false;
  isEditMode = false;
  activeTab = 'basic'; // basic, fields, advanced

  // Options
  providerOptions = Object.values(AIProviderType);
  authTypeOptions = [
    { value: 'API_KEY', label: 'API Key' },
    { value: 'OAUTH2', label: 'OAuth 2.0' },
    { value: 'SERVICE_ACCOUNT', label: 'Service Account' }
  ];

  fieldTypeOptions = [
    { value: 'string', label: 'String' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'json', label: 'JSON Object' }
  ];

  // Predefined template definitions for quick setup
  predefinedTemplates: Record<string, TemplateDefinition> = {
    [AIProviderType.OPENAI]: {
      authType: 'API_KEY',
      requiredFields: [
        {
          name: 'apiKey',
          type: 'string',
          label: 'API Key',
          description: 'OpenAI API key starting with sk-',
          placeholder: 'sk-...',
          validation: { required: true, minLength: 10 }
        }
      ] as RequiredField[],
      optionalFields: [
        {
          name: 'organizationId',
          type: 'string',
          label: 'Organization ID',
          description: 'Optional organization identifier',
          placeholder: 'org-...'
        }
      ] as RequiredField[],
      endpointTemplate: 'https://api.openai.com/v1',
      documentationUrl: 'https://platform.openai.com/docs'
    },
    [AIProviderType.ANTHROPIC]: {
      authType: 'API_KEY',
      requiredFields: [
        {
          name: 'apiKey',
          type: 'string',
          label: 'API Key',
          description: 'Anthropic API key',
          placeholder: 'sk-ant-...',
          validation: { required: true, minLength: 10 }
        }
      ] as RequiredField[],
      optionalFields: [],
      endpointTemplate: 'https://api.anthropic.com',
      documentationUrl: 'https://docs.anthropic.com'
    },
    [AIProviderType.VERTEXAI]: {
      authType: 'SERVICE_ACCOUNT',
      requiredFields: [
        {
          name: 'projectId',
          type: 'string',
          label: 'Project ID',
          description: 'Google Cloud Project ID',
          validation: { required: true }
        },
        {
          name: 'location',
          type: 'string',
          label: 'Location',
          description: 'GCP region (e.g., us-central1)',
          defaultValue: 'us-central1',
          validation: { required: true }
        },
        {
          name: 'credentials',
          type: 'json',
          label: 'Service Account Credentials',
          description: 'JSON service account key',
          validation: { required: true }
        }
      ] as RequiredField[],
      optionalFields: [],
      documentationUrl: 'https://cloud.google.com/vertex-ai/docs'
    },
    [AIProviderType.GEMINI]: {
      authType: 'API_KEY',
      requiredFields: [
        {
          name: 'apiKey',
          type: 'string',
          label: 'API Key',
          description: 'Gemini API key',
          validation: { required: true, minLength: 10 }
        }
      ] as RequiredField[],
      optionalFields: [],
      endpointTemplate: 'https://generativelanguage.googleapis.com',
      documentationUrl: 'https://ai.google.dev/docs'
    }
  };

  ngOnInit() {
    this.initForm();
    this.loadTemplates();
  }

  initForm() {
    this.form = this.fb.group({
      id: [''],
      provider: ['', Validators.required],
      label: ['', Validators.required],
      description: [''],
      templateDefinition: this.fb.group({
        authType: ['API_KEY', Validators.required],
        requiredFields: [[]],
        optionalFields: [[]],
        endpointTemplate: [''],
        documentationUrl: ['']
      }),
      isActive: [true]
    });

    // プロバイダー変更時に定義済みテンプレートを自動適用
    this.form.get('provider')?.valueChanges.subscribe(provider => {
      if (provider && this.predefinedTemplates[provider]) {
        this.applyPredefinedTemplate(provider);
      }
    });
  }

  loadTemplates() {
    this.templateService.getProviderTemplates().subscribe({
      next: (templates) => {
        this.templates = templates;
      },
      error: (error) => {
        console.error('Error loading templates:', error);
        this.snackBar.open('テンプレートの読み込みに失敗しました', 'Close', { duration: 3000 });
      }
    });
  }

  createNew() {
    this.isEditMode = false;
    this.selectedTemplate = null;
    this.form.reset({
      templateDefinition: {
        authType: 'API_KEY',
        requiredFields: [],
        optionalFields: []
      },
      isActive: true
    });
    this.isFormVisible = true;
    this.setActiveTab('basic');
  }

  selectTemplate(template: AIProviderTemplateEntity) {
    this.isEditMode = true;
    this.selectedTemplate = template;
    this.form.patchValue({
      id: template.id,
      provider: template.provider,
      label: template.label,
      description: template.description,
      templateDefinition: template.templateDefinition,
      isActive: template.isActive
    });
    this.isFormVisible = true;
    this.setActiveTab('basic');
  }

  applyPredefinedTemplate(provider: string) {
    if (!this.predefinedTemplates[provider]) return;

    const template = this.predefinedTemplates[provider];
    const providerLabel = this.getProviderLabel(provider);

    this.form.patchValue({
      label: providerLabel,
      description: `${providerLabel} API provider template`,
      templateDefinition: template
    });
  }

  saveTemplate() {
    if (this.form.invalid) {
      this.activateTabWithErrors();
      this.markFormGroupTouched(this.form);
      this.snackBar.open('入力内容を確認してください', 'Close', { duration: 3000 });
      return;
    }

    try {
      const formValue = this.form.value;
      const templateData: AIProviderTemplateEntity = {
        ...genInitialBaseEntity(),
        id: formValue.id || undefined,
        provider: formValue.provider,
        label: formValue.label,
        scopeInfo: {
          scopeType: ScopeType.GLOBAL,
          scopeId: 'default'
        },
        description: formValue.description,
        templateDefinition: formValue.templateDefinition,
        isActive: formValue.isActive ?? true,
      };

      this.templateService.upsertProviderTemplate(templateData).subscribe({
        next: () => {
          this.snackBar.open(
            this.isEditMode ? 'テンプレートを更新しました' : 'テンプレートを作成しました',
            'Close',
            { duration: 3000 }
          );
          this.loadTemplates();
          this.closeForm();
        },
        error: (error) => {
          console.error('Error saving template:', error);
          this.snackBar.open('保存に失敗しました', 'Close', { duration: 3000 });
        }
      });
    } catch (error) {
      console.error('Error processing form data:', error);
      this.snackBar.open('フォームデータの処理に失敗しました', 'Close', { duration: 3000 });
    }
  }

  deleteTemplate(templateId: string) {
    if (!confirm('このテンプレートを削除しますか？')) return;

    this.templateService.deleteProviderTemplate(templateId).subscribe({
      next: () => {
        this.snackBar.open('テンプレートを削除しました', 'Close', { duration: 3000 });
        this.loadTemplates();
        if (this.selectedTemplate?.id === templateId) {
          this.closeForm();
        }
      },
      error: (error) => {
        console.error('Error deleting template:', error);
        this.snackBar.open('削除に失敗しました', 'Close', { duration: 3000 });
      }
    });
  }

  // Field management methods
  addRequiredField() {
    const templateDefinition = this.form.get('templateDefinition');
    const fields = templateDefinition?.get('requiredFields')?.value || [];
    fields.push({
      name: '',
      type: 'string',
      label: '',
      description: '',
      placeholder: '',
      validation: { required: true }
    });
    templateDefinition?.patchValue({ requiredFields: fields });
  }

  removeRequiredField(index: number) {
    const templateDefinition = this.form.get('templateDefinition');
    const fields = templateDefinition?.get('requiredFields')?.value || [];
    fields.splice(index, 1);
    templateDefinition?.patchValue({ requiredFields: fields });
  }

  updateRequiredField(index: number, field: string, value: any) {
    const templateDefinition = this.form.get('templateDefinition');
    const fields = templateDefinition?.get('requiredFields')?.value || [];
    if (fields[index]) {
      fields[index][field] = value;
      templateDefinition?.patchValue({ requiredFields: fields });
    }
  }

  addOptionalField() {
    const templateDefinition = this.form.get('templateDefinition');
    const fields = templateDefinition?.get('optionalFields')?.value || [];
    fields.push({
      name: '',
      type: 'string',
      label: '',
      description: '',
      placeholder: '',
      defaultValue: ''
    });
    templateDefinition?.patchValue({ optionalFields: fields });
  }

  removeOptionalField(index: number) {
    const templateDefinition = this.form.get('templateDefinition');
    const fields = templateDefinition?.get('optionalFields')?.value || [];
    fields.splice(index, 1);
    templateDefinition?.patchValue({ optionalFields: fields });
  }

  updateOptionalField(index: number, field: string, value: any) {
    const templateDefinition = this.form.get('templateDefinition');
    const fields = templateDefinition?.get('optionalFields')?.value || [];
    if (fields[index]) {
      fields[index][field] = value;
      templateDefinition?.patchValue({ optionalFields: fields });
    }
  }

  // Utility methods
  setActiveTab(tabName: string) {
    this.activeTab = tabName;
  }

  closeForm() {
    this.isFormVisible = false;
    this.selectedTemplate = null;
  }

  activateTabWithErrors() {
    const tabFields = {
      'basic': ['provider', 'label'],
      'fields': ['templateDefinition.requiredFields', 'templateDefinition.optionalFields'],
      'advanced': ['templateDefinition.endpointTemplate', 'templateDefinition.documentationUrl']
    };

    for (const [tab, fields] of Object.entries(tabFields)) {
      for (const field of fields) {
        if (this.hasNestedError(field)) {
          this.setActiveTab(tab);
          return;
        }
      }
    }
  }

  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control?.invalid && !!control?.touched;
  }

  hasNestedError(path: string): boolean {
    const control = this.form.get(path);
    return !!control?.invalid && !!control?.touched;
  }

  getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control) return '';

    if (control.errors?.['required']) {
      return 'This field is required';
    }
    return '';
  }

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

  getProviderLabel(provider: string): string {
    const labels: Record<string, string> = {
      [AIProviderType.OPENAI]: 'OpenAI',
      [AIProviderType.ANTHROPIC]: 'Anthropic',
      [AIProviderType.VERTEXAI]: 'Vertex AI',
      [AIProviderType.GEMINI]: 'Gemini',
      [AIProviderType.AZURE_OPENAI]: 'Azure OpenAI',
      [AIProviderType.GROQ]: 'Groq',
      [AIProviderType.MISTRAL]: 'Mistral',
      [AIProviderType.DEEPSEEK]: 'DeepSeek',
      [AIProviderType.LOCAL]: 'Local'
    };
    return labels[provider] || provider;
  }

  // Getters
  get requiredFields(): RequiredField[] {
    return this.form.get('templateDefinition.requiredFields')?.value || [];
  }

  get optionalFields(): OptionalField[] {
    return this.form.get('templateDefinition.optionalFields')?.value || [];
  }
}
