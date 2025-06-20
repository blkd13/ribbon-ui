import { Component, inject, OnInit, Injectable, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, AbstractControl, FormControl, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule, MatCheckboxChange } from '@angular/material/checkbox';

import { genInitialBaseEntity } from '../../../../services/project.service';
import { JsonEditorComponent } from "../../../../parts/json-editor/json-editor.component";
import { AIProviderEntity, AIProviderManagerService, AIProviderType, ScopeType, ScopeInfo } from '../../../../services/model-manager.service';
import { AuthService, ScopeLabels, ScopeLabelsResponse } from '../../../../services/auth.service';
import { AdminScopeService } from '../../../../services/admin-scope.service';
import { Utils } from '../../../../utils';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCardModule } from '@angular/material/card';

export interface ProviderConfigField {
  key: string;
  type: 'text' | 'password' | 'url' | 'array' | 'json' | 'object_array';
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: any;
  // object_arrayの場合のフィールド定義
  objectFields?: ProviderConfigField[];
}

export interface ProviderConfigDefinition {
  title: string;
  fields: ProviderConfigField[];
}

@Injectable({ providedIn: 'root' })
export class ProviderConfigService {
  readonly fb: FormBuilder = inject(FormBuilder);

  private readonly configs: Record<string, ProviderConfigDefinition> = {
    [AIProviderType.OPENAI]: {
      title: 'OpenAI Configuration',
      fields: [
        {
          key: 'endpoints',
          type: 'object_array',
          label: 'Endpoints',
          required: true,
          objectFields: [
            { key: 'apiKey', type: 'password', label: 'API Key', required: true },
            { key: 'organization', type: 'text', label: 'Organization', required: false, placeholder: 'Optional organization ID' },
            { key: 'project', type: 'text', label: 'Project', required: false, placeholder: 'Optional project ID' }
          ]
        }
      ]
    },
    [AIProviderType.AZURE_OPENAI]: {
      title: 'Azure OpenAI Configuration',
      fields: [
        {
          key: 'resources',
          type: 'object_array',
          label: 'Resources',
          required: true,
          objectFields: [
            { key: 'baseURL', type: 'url', label: 'Base URL', required: true, placeholder: 'https://yourresource.openai.azure.com/' },
            { key: 'apiKey', type: 'password', label: 'API Key', required: true },
            { key: 'apiVersion', type: 'text', label: 'API Version', required: true, placeholder: '2023-05-15' }
          ]
        }
      ]
    },
    [AIProviderType.VERTEXAI]: {
      title: 'VertexAI Configuration',
      fields: [
        { key: 'project', type: 'text', label: 'Project ID', required: true },
        { key: 'apiEndpoint', type: 'url', label: 'API Endpoint', required: false, placeholder: 'us-central1-aiplatform.googleapis.com' },
        { key: 'locationList', type: 'array', label: 'Locations', required: true, defaultValue: ['us-central1'] }
      ]
    },
    [AIProviderType.ANTHROPIC_VERTEXAI]: {
      title: 'Anthropic VertexAI Configuration',
      fields: [
        { key: 'projectId', type: 'text', label: 'Project ID', required: true },
        { key: 'baseURL', type: 'url', label: 'Base URL', required: false, placeholder: 'https://us-central1-aiplatform.googleapis.com/' },
        { key: 'regionList', type: 'array', label: 'Regions', required: true, defaultValue: ['us-central1'] }
      ]
    },
    [AIProviderType.OPENAI_COMPATIBLE]: {
      title: 'OpenAI Compatible Configuration',
      fields: [
        {
          key: 'endpoints',
          type: 'object_array',
          label: 'Endpoints',
          required: true,
          objectFields: [
            { key: 'baseURL', type: 'url', label: 'Base URL', required: true, placeholder: 'https://api.openai.com/v1/' },
            { key: 'apiKey', type: 'password', label: 'API Key', required: false },
            { key: 'metadata', type: 'json', label: 'Additional Properties', required: false, defaultValue: {} }
          ]
        }
      ]
    }
  };

  /**
   * プロバイダータイプの設定定義を取得
   */
  getConfigDefinition(providerType: string): ProviderConfigDefinition {
    return this.configs[providerType] || {
      title: `${Utils.toPascalCase(providerType)} Configuration`,
      fields: [
        {
          key: 'endpoints',
          type: 'object_array',
          label: 'Endpoints',
          required: true,
          objectFields: [
            { key: 'apiKey', type: 'password', label: 'API Key', required: true }
          ]
        }
      ]
    };
  }

  /**
   * プロバイダータイプに基づいて動的フォームを作成
   */
  createConfigForm(providerType: string): FormGroup {
    const definition = this.getConfigDefinition(providerType);
    const group: Record<string, AbstractControl> = {};

    definition.fields.forEach(field => {
      if (field.type === 'array') {
        const defaultValues = field.defaultValue || [''];
        const arrayControls = defaultValues.map((value: string) =>
          this.fb.control(value, field.required ? [Validators.required] : [])
        );
        group[field.key] = this.fb.array(arrayControls);
      } else if (field.type === 'object_array') {
        // オブジェクト配列の場合は最初に1つのアイテムを作成
        const objectForm = this.createObjectForm(field.objectFields || []);
        group[field.key] = this.fb.array([objectForm]);
      } else if (field.type === 'json') {
        const defaultValue = field.defaultValue || {};
        group[field.key] = this.fb.control(defaultValue);
      } else {
        const validators = field.required ? [Validators.required] : [];
        const defaultValue = field.defaultValue || '';
        group[field.key] = this.fb.control(defaultValue, validators);
      }
    });

    return this.fb.group(group);
  }

  /**
   * オブジェクトフォームを作成（object_array用）
   */
  private createObjectForm(objectFields: ProviderConfigField[]): FormGroup {
    const group: Record<string, AbstractControl> = {};

    objectFields.forEach(field => {
      if (field.type === 'json') {
        const defaultValue = field.defaultValue || {};
        group[field.key] = this.fb.control(defaultValue);
      } else {
        const validators = field.required ? [Validators.required] : [];
        const defaultValue = field.defaultValue || '';
        group[field.key] = this.fb.control(defaultValue, validators);
      }
    });

    return this.fb.group(group);
  }

  /**
   * 既存の設定値でフォームを更新
   */
  patchConfigForm(configForm: FormGroup, config: any, providerType: string): void {
    const definition = this.getConfigDefinition(providerType);

    definition.fields.forEach(field => {
      const control = configForm.get(field.key);
      const value = config[field.key];

      if (!control || value === undefined) return;

      if (field.type === 'array' && control instanceof FormArray) {
        // 配列フィールドの処理
        this.updateFormArray(control, value || []);
      } else if (field.type === 'object_array' && control instanceof FormArray) {
        // オブジェクト配列フィールドの処理
        this.updateObjectFormArray(control, value || [], field.objectFields || []);
      } else if (field.type === 'json') {
        // JSONフィールドの処理
        control.setValue(value || {});
      } else {
        // 通常フィールドの処理
        control.setValue(value);
      }
    });
  }

  /**
   * FormArrayを指定された値で更新
   */
  private updateFormArray(formArray: FormArray, values: string[]): void {
    // 既存のコントロールを削除
    while (formArray.length !== 0) {
      formArray.removeAt(0);
    }

    // 新しい値でコントロールを追加
    values.forEach(value => {
      formArray.push(this.fb.control(value, [Validators.required]));
    });

    // 最低1つは確保
    if (formArray.length === 0) {
      formArray.push(this.fb.control('', [Validators.required]));
    }
  }

  /**
   * オブジェクトFormArrayを指定された値で更新
   */
  private updateObjectFormArray(formArray: FormArray, values: any[], objectFields: ProviderConfigField[]): void {
    // 既存のコントロールを削除
    while (formArray.length !== 0) {
      formArray.removeAt(0);
    }

    // 新しい値でオブジェクトフォームを追加
    if (values.length > 0) {
      values.forEach(value => {
        const objectForm = this.createObjectForm(objectFields);
        objectForm.patchValue(value);
        formArray.push(objectForm);
      });
    } else {
      // 最低1つは確保
      formArray.push(this.createObjectForm(objectFields));
    }
  }

  /**
   * 配列フィールドに新しいアイテムを追加
   */
  addArrayItem(configForm: FormGroup, fieldKey: string): void {
    const formArray = configForm.get(fieldKey) as FormArray;
    if (formArray) {
      formArray.push(this.fb.control('', [Validators.required]));
    }
  }

  /**
   * オブジェクト配列フィールドに新しいアイテムを追加
   */
  addObjectArrayItem(configForm: FormGroup, fieldKey: string, objectFields: ProviderConfigField[]): void {
    const formArray = configForm.get(fieldKey) as FormArray;
    if (formArray) {
      const objectForm = this.createObjectForm(objectFields);
      formArray.push(objectForm);
    }
  }

  /**
   * 配列フィールドからアイテムを削除
   */
  removeArrayItem(configForm: FormGroup, fieldKey: string, index: number): void {
    const formArray = configForm.get(fieldKey) as FormArray;
    if (formArray && formArray.length > 1) {
      formArray.removeAt(index);
    }
  }

  /**
   * オブジェクト配列の特定のフィールドの定義を取得
   */
  getObjectArrayFields(providerType: string, arrayFieldKey: string): ProviderConfigField[] {
    const definition = this.getConfigDefinition(providerType);
    const field = definition.fields.find(f => f.key === arrayFieldKey);
    return field?.objectFields || [];
  }

  /**
   * 設定フォームの値を取得（クリーンアップ済み）
   */
  getConfigValue(configForm: FormGroup): any {
    const value = configForm.value;

    // 空の値を除去
    const cleanedValue: any = {};
    Object.keys(value).forEach(key => {
      const val = value[key];
      if (Array.isArray(val)) {
        if (val.length > 0 && typeof val[0] === 'object') {
          // オブジェクト配列の場合
          const filtered = val.filter(item => this.isValidObject(item));
          if (filtered.length > 0) {
            cleanedValue[key] = filtered;
          }
        } else {
          // 文字列配列の場合
          const filtered = val.filter(item => item && item.trim());
          if (filtered.length > 0) {
            cleanedValue[key] = filtered;
          }
        }
      } else if (val !== null && val !== undefined && val !== '') {
        // JSONオブジェクトの場合は空でも保持
        if (typeof val === 'object' && Object.keys(val).length === 0) {
          // 空のオブジェクトは除外しない（設定として有効）
          cleanedValue[key] = val;
        } else {
          cleanedValue[key] = val;
        }
      }
    });

    return cleanedValue;
  }

  /**
   * オブジェクトが有効かチェック
   */
  private isValidObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') return false;

    // 必須フィールドに値があるかチェック
    const hasRequiredValues = Object.keys(obj).some(key => {
      const value = obj[key];
      return value !== null && value !== undefined && value !== '';
    });

    return hasRequiredValues;
  }

  /**
   * フォームバリデーション
   */
  validateConfigForm(configForm: FormGroup, providerType: string): { isValid: boolean; errors: string[] } {
    const definition = this.getConfigDefinition(providerType);
    const errors: string[] = [];

    definition.fields.forEach(field => {
      const control = configForm.get(field.key);

      if (field.required && control) {
        if (field.type === 'array') {
          const formArray = control as FormArray;
          if (!formArray.length || formArray.controls.every(c => !c.value?.trim())) {
            errors.push(`${field.label} is required`);
          }
        } else if (field.type === 'object_array') {
          const formArray = control as FormArray;
          if (!formArray.length || formArray.controls.every(c => !this.isValidObject(c.value))) {
            errors.push(`${field.label} is required`);
          }
        } else if (field.type === 'json') {
          // JSONフィールドは必須でも空のオブジェクトを許可
        } else {
          if (!control.value?.trim()) {
            errors.push(`${field.label} is required`);
          }
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// ProviderConfigService の定義は元のまま使用
@Component({
  selector: 'app-ai-provider-management',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatCardModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatCheckboxModule,
    JsonEditorComponent,
  ],
  templateUrl: './ai-provider-management.component.html',
  styleUrl: './ai-provider-management.component.scss',
})
export class AIProviderManagementComponent implements OnInit, OnDestroy {
  // Services
  readonly fb = inject(FormBuilder);
  readonly snackBar = inject(MatSnackBar);
  readonly providerService = inject(AIProviderManagerService);
  readonly providerConfigService = inject(ProviderConfigService);
  readonly authService = inject(AuthService);
  private readonly adminScopeService = inject(AdminScopeService);

  // Component state
  form!: FormGroup;
  providers: AIProviderEntity[] = [];
  filteredProviders: AIProviderEntity[] = [];
  isFormVisible = false;
  currentProviderFields: any[] = [];

  // フィルター・ソート・一括操作関連
  searchFilter = '';
  typeFilter: string[] = [];
  statusFilter = '';
  sortBy: string | null = null;
  sortDirection: 'asc' | 'desc' = 'asc';
  selectedProviders: string[] = [];
  availableTypes: string[] = [];

  // 新しいモード管理
  isEditMode = false;
  isDuplicateMode = false;
  isViewOnlyMode = false;
  isOverrideMode = false;
  selectedProvider: AIProviderEntity | null = null;

  // Subscriptions
  private subscriptions = new Subscription();

  // Selected scope from admin
  selectedScope: ScopeInfo | null = null;

  // Enum references
  readonly AIProviderType = AIProviderType;
  readonly providerOptions = Object.values(AIProviderType);
  readonly scopeTypeOptions = [
    { value: ScopeType.ORGANIZATION, label: 'Organization' },
    { value: ScopeType.DIVISION, label: 'Division' },
  ];
  Utils = Utils;

  // Scope management
  scopeLabels: ScopeLabelsResponse = {
    scopeLabels: {
      [ScopeType.ORGANIZATION]: [],
      [ScopeType.DIVISION]: [],
      [ScopeType.PROJECT]: [],
      [ScopeType.TEAM]: [],
    },
    roleList: [],
  };
  scopeLabelsMap: Record<string, string> = {};

  constructor() {
    this.initForm();
  }

  ngOnInit() {
    // Subscribe to selected scope changes
    const scopeSubscription = this.adminScopeService.selectedScope$.subscribe(scope => {
      this.selectedScope = scope;
      this.updateScopeInForm(scope);
      this.loadProviders();
    });
    this.subscriptions.add(scopeSubscription);

    this.loadProviders();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  // ===== スコープ関連メソッド =====

  scopeLabelsList(type: keyof ScopeLabels) {
    return this.scopeLabels.scopeLabels[type] || [];
  }

  getScopeTypeLabel(scopeType: ScopeType): string {
    const typeOption = this.scopeTypeOptions.find(option => option.value === scopeType);
    return typeOption ? typeOption.label : scopeType;
  }

  getScopeLabel(scope: ScopeInfo): string {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    return this.scopeLabelsMap[key] || scope.scopeId;
  }

  private updateScopeInForm(scope: ScopeInfo | null) {
    if (scope && this.form) {
      this.form.get('scopeInfo')?.patchValue({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId
      });

      // disable/enableメソッドを使用
      this.form.get('scopeInfo.scopeType')?.disable();
      this.form.get('scopeInfo.scopeId')?.disable();
    } else if (this.form) {
      this.form.get('scopeInfo.scopeType')?.enable();
      this.form.get('scopeInfo.scopeId')?.enable();
    }
  }

  // ===== データ読み込み =====

  private loadProviders() {
    this.authService.getScopeLabels().subscribe(scopeLabels => {
      this.scopeLabels = scopeLabels;
      this.buildScopeLabelsMap(scopeLabels);
    });

    this.providerService.getProviders(true).subscribe(allProviders => {
      const visibleProviders = this.adminScopeService.getVisibleItems(allProviders);
      this.providers = this.adminScopeService.getEffectiveItems(visibleProviders);
      this.updateFilteredProviders();
    });
  }

  private buildScopeLabelsMap(scopeLabels: ScopeLabelsResponse) {
    this.scopeLabelsMap = {};

    Object.entries(scopeLabels.scopeLabels).forEach(([type, labels]) => {
      (labels as any[]).forEach(label => {
        this.scopeLabelsMap[`${type}:${label.id}`] = label.label;
      });
    });

    this.providers.forEach(provider => {
      const key = `${provider.scopeInfo.scopeType}:${provider.scopeInfo.scopeId}`;
      if (!this.scopeLabelsMap[key]) {
        this.scopeLabelsMap[key] = this.adminScopeService.getScopeLabel(
          provider.scopeInfo.scopeType,
          provider.scopeInfo.scopeId
        );
      }
    });
  }

  // ===== フォーム初期化 =====

  private initForm() {
    this.form = this.fb.group({
      id: [''],
      basicInfo: this.fb.group({
        type: ['', Validators.required],
        name: ['', Validators.required],
        label: ['', Validators.required],
        description: ['', Validators.maxLength(500)],
        isActive: [true],
      }),
      scopeInfo: this.fb.group({
        scopeType: ['', Validators.required],
        scopeId: ['', Validators.required]
      }),
      config: this.fb.group({})
    });

    this.form.get('basicInfo.type')?.valueChanges.subscribe(type => {
      if (!this.isEditMode && !this.isDuplicateMode && !this.isOverrideMode) {
        this.updateConfigForm(type);
      }
    });
  }

  private updateConfigForm(providerType: string, existingConfig?: any) {
    if (!providerType) {
      this.currentProviderFields = [];
      this.form.setControl('config', this.fb.group({}));
      return;
    }

    try {
      const configDefinition = this.providerConfigService.getConfigDefinition(providerType);
      this.currentProviderFields = configDefinition.fields;
      const newConfigForm = this.providerConfigService.createConfigForm(providerType);

      if (existingConfig) {
        this.providerConfigService.patchConfigForm(newConfigForm, existingConfig, providerType);
      }

      this.form.setControl('config', newConfigForm);

      // 読み取り専用モードの場合は無効化
      if (this.isViewOnlyMode) {
        newConfigForm.disable();
      }
    } catch (error) {
      console.error('Error updating config form:', error);
      this.currentProviderFields = [];
      this.form.setControl('config', this.fb.group({}));
    }
  }

  // ===== 配列フィールド管理 =====

  getArrayControls(fieldKey: string): FormControl[] {
    try {
      const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
      return formArray && formArray.controls ? formArray.controls as FormControl[] : [];
    } catch (error) {
      console.error(`Error getting array controls for ${fieldKey}:`, error);
      return [];
    }
  }

  addArrayItem(fieldKey: string) {
    if (this.isViewOnlyMode) return;
    this.providerConfigService.addArrayItem(this.form.get('config') as FormGroup, fieldKey);
  }

  removeArrayItem(fieldKey: string, index: number) {
    if (this.isViewOnlyMode) return;
    this.providerConfigService.removeArrayItem(this.form.get('config') as FormGroup, fieldKey, index);
  }

  getObjectArrayControls(fieldKey: string): FormGroup[] {
    try {
      const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
      if (!formArray || !formArray.controls) {
        return [];
      }
      return formArray.controls as FormGroup[];
    } catch (error) {
      console.error(`Error getting object array controls for ${fieldKey}:`, error);
      return [];
    }
  }

  addObjectArrayItem(fieldKey: string) {
    if (this.isViewOnlyMode) return;

    try {
      const providerType = this.form.get('basicInfo.type')?.value;
      if (!providerType) return;

      const objectFields = this.providerConfigService.getObjectArrayFields(providerType, fieldKey);
      this.providerConfigService.addObjectArrayItem(this.form.get('config') as FormGroup, fieldKey, objectFields);
    } catch (error) {
      console.error(`Error adding object array item for ${fieldKey}:`, error);
    }
  }

  removeObjectArrayItem(fieldKey: string, index: number) {
    if (this.isViewOnlyMode) return;

    try {
      const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
      if (!formArray || formArray.length <= 1) return;

      this.providerConfigService.removeArrayItem(this.form.get('config') as FormGroup, fieldKey, index);
    } catch (error) {
      console.error(`Error removing object array item for ${fieldKey}:`, error);
    }
  }

  getObjectFieldsForArray(fieldKey: string): any[] {
    try {
      const providerType = this.form.get('basicInfo.type')?.value;
      if (!providerType) return [];

      return this.providerConfigService.getObjectArrayFields(providerType, fieldKey);
    } catch (error) {
      console.error(`Error getting object fields for ${fieldKey}:`, error);
      return [];
    }
  }

  getSingularLabel(label: string): string {
    if (label.endsWith('s')) {
      return label.slice(0, -1);
    }
    return label;
  }

  hasObjectArrayError(fieldKey: string, index: number, objectFieldKey: string): boolean {
    try {
      const control = this.form.get(`config.${fieldKey}.${index}.${objectFieldKey}`);
      return !!control?.invalid && !!control?.touched;
    } catch (error) {
      return false;
    }
  }

  getObjectArrayErrorMessage(fieldKey: string, index: number, objectFieldKey: string): string {
    try {
      const control = this.form.get(`config.${fieldKey}.${index}.${objectFieldKey}`);
      if (!control?.errors) return '';

      if (control.errors['required']) return 'This field is required';
      if (control.errors['maxlength']) {
        return `Maximum length is ${control.errors['maxlength'].requiredLength}`;
      }
      return 'Invalid input';
    } catch (error) {
      return '';
    }
  }

  // ===== 権限チェック =====

  canCreateProvider(): boolean {
    return this.adminScopeService.canCreateAIProvider();
  }

  canUserEditProvider(provider: AIProviderEntity): boolean {
    return this.adminScopeService.canEditScope(
      provider.scopeInfo.scopeType,
      provider.scopeInfo.scopeId
    );
  }

  isProvidersOwnScope(provider: AIProviderEntity): boolean {
    const currentScope = this.selectedScope;
    if (!currentScope) return false;

    return provider.scopeInfo.scopeType === currentScope.scopeType &&
      provider.scopeInfo.scopeId === currentScope.scopeId;
  }

  // ===== UIヘルパーメソッド =====

  shouldShowEditButton(provider: AIProviderEntity): boolean {
    return this.canUserEditProvider(provider) && this.isProvidersOwnScope(provider);
  }

  shouldShowViewButton(provider: AIProviderEntity): boolean {
    return !this.isProvidersOwnScope(provider);
  }

  shouldShowOverrideButton(provider: AIProviderEntity): boolean {
    return !this.isProvidersOwnScope(provider) && this.canCreateProvider();
  }

  shouldShowDuplicateButton(provider: AIProviderEntity): boolean {
    return this.isProvidersOwnScope(provider) && this.canCreateProvider();
  }

  shouldShowDeleteButton(provider: AIProviderEntity): boolean {
    return this.shouldShowEditButton(provider);
  }

  // ===== プロバイダー操作メソッド =====

  createNew() {
    if (!this.canCreateProvider()) {
      this.showErrorMessage('You do not have permission to create providers in the current scope');
      return;
    }

    this.resetFormState();
    this.isFormVisible = true;
    this.initForm();
    this.currentProviderFields = [];

    this.form.patchValue({
      basicInfo: { isActive: true }
    });

    if (this.selectedScope) {
      this.updateScopeInForm(this.selectedScope);
    }

    this.setFormReadOnly(false);
  }

  viewProvider(provider: AIProviderEntity) {
    this.selectedProvider = provider;
    this.resetFormState();
    this.isViewOnlyMode = true;
    this.isFormVisible = true;

    this.loadProviderToForm(provider);
    this.setFormReadOnly(true);
  }

  editProvider(provider: AIProviderEntity) {
    if (!this.isProvidersOwnScope(provider)) {
      this.showErrorMessage('You can only edit providers in your own scope');
      return;
    }

    this.selectedProvider = provider;
    this.resetFormState();
    this.isEditMode = true;
    this.isFormVisible = true;

    this.loadProviderToForm(provider);
    this.setFormReadOnly(false);
  }

  startOverride(provider: AIProviderEntity, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    if (!this.canCreateProvider()) {
      this.showErrorMessage('You do not have permission to create providers in the current scope');
      return;
    }

    if (this.isProvidersOwnScope(provider)) {
      this.editProvider(provider);
      return;
    }

    this.selectedProvider = provider;
    this.resetFormState();
    this.isOverrideMode = true;
    this.isFormVisible = true;

    this.prepareOverrideForm(provider);
    this.setFormReadOnly(false);
  }

  switchToOverrideMode() {
    if (!this.selectedProvider || !this.canCreateProvider()) {
      return;
    }

    this.isViewOnlyMode = false;
    this.isOverrideMode = true;
    this.prepareOverrideForm(this.selectedProvider);
    this.setFormReadOnly(false);
  }

  duplicateProvider(provider: AIProviderEntity, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    if (!this.canCreateProvider()) {
      this.showErrorMessage('You do not have permission to create providers in the current scope');
      return;
    }

    this.selectedProvider = provider;
    this.resetFormState();
    this.isDuplicateMode = true;
    this.isFormVisible = true;

    // フォーム初期化を明示的に行う
    this.initForm();

    // プロバイダータイプを設定してconfigフォームを作成
    this.form.get('basicInfo.type')?.setValue(provider.type, { emitEvent: false });
    this.updateConfigForm(provider.type, provider.config);

    this.form.patchValue({
      id: '',
      basicInfo: {
        name: provider.name + '_copy',
        label: provider.label + ' (Copy)',
        description: provider.description,
        isActive: true,
      },
      scopeInfo: {
        scopeType: provider.scopeInfo.scopeType,
        scopeId: provider.scopeInfo.scopeId
      }
    });

    this.setFormReadOnly(false);
  }

  // ===== フォーム関連ヘルパー =====

  private resetFormState() {
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.isViewOnlyMode = false;
    this.isOverrideMode = false;
  }

  private loadProviderToForm(provider: AIProviderEntity) {
    // フォーム初期化を明示的に行う
    this.initForm();

    this.form.get('basicInfo.type')?.setValue(provider.type, { emitEvent: false });
    this.updateConfigForm(provider.type, provider.config);

    this.form.patchValue({
      id: provider.id,
      basicInfo: {
        name: provider.name,
        label: provider.label,
        description: provider.description,
        isActive: provider.isActive,
      },
      scopeInfo: provider.scopeInfo
    });
  }

  private prepareOverrideForm(provider: AIProviderEntity) {
    // フォーム初期化を明示的に行う
    this.initForm();

    this.form.get('basicInfo.type')?.setValue(provider.type, { emitEvent: false });
    this.updateConfigForm(provider.type, provider.config);

    this.form.patchValue({
      id: '',
      basicInfo: {
        name: provider.name,
        label: provider.label,
        description: provider.description,
        isActive: true,
      }
    });
  }

  getFormTitle(): string {
    if (this.isViewOnlyMode) {
      return 'View Provider';
    } else if (this.isOverrideMode) {
      return `Override Provider`;
    } else if (this.isDuplicateMode) {
      return 'Duplicate Provider';
    } else if (this.isEditMode) {
      return 'Edit Provider';
    } else {
      return 'New Provider';
    }
  }

  closeForm(): void {
    this.isFormVisible = false;
    this.resetFormState();
    this.selectedProvider = null;
    this.currentProviderFields = [];
    this.initForm(); // フォームをリセット
  }

  // ===== 保存・削除処理 =====

  register() {
    if (this.isViewOnlyMode) {
      return;
    }

    if (this.form.invalid) {
      this.markFormGroupTouched(this.form);
      this.showErrorMessage('Please fix the errors in the form');
      return;
    }

    try {
      const formValue = this.form.getRawValue(); // disabledフィールドも含めて取得
      const cleanedConfig = this.providerConfigService.getConfigValue(this.form.get('config') as FormGroup);

      const scopeInfo = this.selectedScope;
      if (!scopeInfo) {
        this.showErrorMessage('No scope selected');
        return;
      }

      const isUpdate = formValue.id && this.isEditMode && !this.isOverrideMode;

      if (isUpdate) {
        if (!this.adminScopeService.canEditScope(scopeInfo.scopeType, scopeInfo.scopeId)) {
          this.showErrorMessage('You do not have permission to edit this provider');
          return;
        }
      } else {
        if (!this.canCreateProvider()) {
          this.showErrorMessage('You do not have permission to create providers in the current scope');
          return;
        }
      }

      const providerData: AIProviderEntity = {
        ...genInitialBaseEntity('ai-provider'),
        id: isUpdate ? formValue.id : undefined,
        type: formValue.basicInfo.type,
        name: formValue.basicInfo.name,
        label: formValue.basicInfo.label,
        description: formValue.basicInfo.description,
        isActive: formValue.basicInfo.isActive,
        scopeInfo: scopeInfo,
        config: cleanedConfig
      };

      this.providerService.upsertProvider(providerData);

      const successMessage = this.isOverrideMode
        ? 'Provider override created successfully'
        : isUpdate
          ? 'Provider updated successfully'
          : 'Provider created successfully';

      this.showSuccessMessage(successMessage);

      this.loadProviders();
      this.closeForm();
    } catch (error) {
      console.error('Error processing form data:', error);
      this.showErrorMessage('Error processing form data');
    }
  }

  deleteProvider(id: string) {
    const provider = this.providers.find(p => p.id === id);
    if (!provider) {
      this.showErrorMessage('Provider not found');
      return;
    }

    if (!this.canUserEditProvider(provider)) {
      this.showErrorMessage('You do not have permission to delete this provider');
      return;
    }

    if (confirm('Are you sure you want to delete this provider?')) {
      this.providerService.deleteProvider(id).subscribe({
        next: () => {
          this.showSuccessMessage('Provider deleted successfully');
          this.loadProviders();

          if (this.form.value.id === id) {
            this.closeForm();
          }
        },
        error: (error) => {
          console.error('Error deleting provider:', error);
          this.showErrorMessage('Failed to delete provider');
        }
      });
    }
  }

  // ===== バリデーション関連 =====

  hasError(controlPath: string): boolean {
    const control = this.form.get(controlPath);
    return !!control?.invalid && !!control?.touched;
  }

  getErrorMessage(controlPath: string): string {
    const control = this.form.get(controlPath);
    if (!control?.errors) return '';

    if (control.errors['required']) return 'This field is required';
    if (control.errors['maxlength']) {
      return `Maximum length is ${control.errors['maxlength'].requiredLength}`;
    }
    return 'Invalid input';
  }

  private markFormGroupTouched(formGroup: FormGroup) {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      } else if (control instanceof FormArray) {
        control.controls.forEach(c => {
          if (c instanceof FormGroup) {
            this.markFormGroupTouched(c);
          } else {
            c.markAsTouched();
          }
        });
      } else {
        control?.markAsTouched();
      }
    });
  }

  // ===== ユーティリティ =====

  private setFormReadOnly(readOnly: boolean): void {
    if (readOnly) {
      this.form.disable();
    } else {
      this.form.enable();
      // スコープフィールドは選択されている場合は無効化を維持
      if (this.selectedScope) {
        this.form.get('scopeInfo.scopeType')?.disable();
        this.form.get('scopeInfo.scopeId')?.disable();
      }
    }
  }

  private showSuccessMessage(message: string) {
    this.snackBar.open(message, 'Close', { duration: 3000 });
  }

  private showErrorMessage(message: string) {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: 'error-snackbar'
    });
  }

  /**
   * 編集が無効化されるべきかどうか
   */
  isEditDisabled(): boolean {
    return this.form.invalid || this.isViewOnlyMode;
  }

  /**
   * 編集可能なスコープ一覧を取得
   */
  getEditableScopes(): { scopeType: ScopeType; scopeId: string; label: string }[] {
    const editableScopes = this.adminScopeService.getEditableScopes();
    return editableScopes.map(scope => ({
      ...scope,
      label: this.getScopeLabel(scope)
    }));
  }

  // ===== フィルター・ソート・一括操作メソッド =====

  applyFilters(): void {
    let filtered = [...this.providers];

    // 検索フィルター
    if (this.searchFilter.trim()) {
      const search = this.searchFilter.toLowerCase();
      filtered = filtered.filter(provider => 
        provider.label.toLowerCase().includes(search) ||
        provider.name.toLowerCase().includes(search) ||
        provider.type.toLowerCase().includes(search)
      );
    }

    // タイプフィルター
    if (this.typeFilter.length > 0) {
      filtered = filtered.filter(provider => 
        this.typeFilter.includes(provider.type)
      );
    }

    // ステータスフィルター
    if (this.statusFilter) {
      const isActive = this.statusFilter === 'true';
      filtered = filtered.filter(provider => provider.isActive === isActive);
    }

    this.filteredProviders = filtered;
    this.applySorting();
  }

  applySorting(): void {
    // 安定ソートのために配列をインデックス付きで処理
    const indexedProviders = this.filteredProviders.map((provider, index) => ({ provider, index }));
    
    indexedProviders.sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (this.sortBy) {
        case null:
        case '':
          // デフォルト順序：ラベル順
          return a.provider.label.localeCompare(b.provider.label);
          
        case 'label':
          valueA = a.provider.label;
          valueB = b.provider.label;
          break;
        case 'name':
          valueA = a.provider.name;
          valueB = b.provider.name;
          break;
        case 'type':
          valueA = a.provider.type;
          valueB = b.provider.type;
          break;
        case 'updated':
          valueA = a.provider.updatedAt;
          valueB = b.provider.updatedAt;
          break;
        default:
          // 値が同じ場合は元のインデックス順を保持（安定ソート）
          return a.index - b.index;
      }

      // 値が同じ場合は元のインデックス順を保持（安定ソート）
      if (valueA === valueB) {
        return a.index - b.index;
      }

      if (typeof valueA === 'string' && typeof valueB === 'string') {
        const result = valueA.localeCompare(valueB);
        return this.sortDirection === 'asc' ? result : -result;
      } else {
        const result = valueA - valueB;
        return this.sortDirection === 'asc' ? result : -result;
      }
    });
    
    // ソート結果を元の配列に戻す
    this.filteredProviders = indexedProviders.map(item => item.provider);
  }

  toggleSortDirection(): void {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    this.applySorting();
  }

  resetFilters(): void {
    this.searchFilter = '';
    this.typeFilter = [];
    this.statusFilter = '';
    this.sortBy = null;
    this.sortDirection = 'asc';
    this.selectedProviders = [];
    this.applyFilters();
  }

  // 一括選択関連
  isProviderSelected(providerId: string): boolean {
    return this.selectedProviders.includes(providerId);
  }

  toggleProviderSelection(providerId: string, event: MatCheckboxChange): void {
    if (event.checked) {
      if (!this.selectedProviders.includes(providerId)) {
        this.selectedProviders.push(providerId);
      }
    } else {
      const index = this.selectedProviders.indexOf(providerId);
      if (index > -1) {
        this.selectedProviders.splice(index, 1);
      }
    }
  }

  isAllSelected(): boolean {
    return this.filteredProviders.length > 0 && this.selectedProviders.length === this.filteredProviders.length;
  }

  isSomeSelected(): boolean {
    return this.selectedProviders.length > 0 && this.selectedProviders.length < this.filteredProviders.length;
  }

  toggleSelectAll(event: MatCheckboxChange): void {
    if (event.checked) {
      this.selectedProviders = this.filteredProviders.map(provider => provider.id);
    } else {
      this.selectedProviders = [];
    }
  }

  // 一括操作
  canBulkEdit(): boolean {
    return this.selectedProviders.length > 0 && this.selectedProviders.some(id => {
      const provider = this.providers.find(p => p.id === id);
      return provider && this.canUserEditProvider(provider);
    });
  }

  bulkToggleStatus(isActive: boolean): void {
    if (!this.canBulkEdit()) return;

    const selectedProviderEntities = this.selectedProviders
      .map(id => this.providers.find(p => p.id === id))
      .filter(p => p && this.canUserEditProvider(p)) as AIProviderEntity[];

    if (selectedProviderEntities.length === 0) return;

    const statusLabel = isActive ? 'activate' : 'deactivate';
    const confirmed = confirm(`Are you sure you want to ${statusLabel} ${selectedProviderEntities.length} providers?`);
    if (!confirmed) return;

    selectedProviderEntities.forEach(provider => {
      const updatedProvider = { ...provider, isActive };
      this.providerService.upsertProvider(updatedProvider);
    });

    this.snackBar.open(`${selectedProviderEntities.length} providers ${statusLabel}d`, 'Close', { duration: 3000 });
    this.selectedProviders = [];
    this.loadProviders();
  }

  bulkDelete(): void {
    if (!this.canBulkEdit()) return;

    const selectedProviderEntities = this.selectedProviders
      .map(id => this.providers.find(p => p.id === id))
      .filter(p => p && this.canUserEditProvider(p)) as AIProviderEntity[];

    if (selectedProviderEntities.length === 0) return;

    const confirmed = confirm(`Are you sure you want to delete ${selectedProviderEntities.length} providers? This action cannot be undone.`);
    if (!confirmed) return;

    const deletePromises = selectedProviderEntities.map(provider => 
      this.providerService.deleteProvider(provider.id)
    );

    Promise.all(deletePromises)
      .then(() => {
        this.snackBar.open(`${selectedProviderEntities.length} providers deleted`, 'Close', { duration: 3000 });
        this.selectedProviders = [];
        this.loadProviders();
      })
      .catch(error => {
        console.error('Bulk delete failed:', error);
        this.snackBar.open('Bulk delete failed', 'Close', { duration: 3000 });
      });
  }

  private updateAvailableTypes(): void {
    const types = new Set<string>();
    this.providers.forEach(provider => {
      types.add(provider.type);
    });
    this.availableTypes = Array.from(types).sort();
  }

  private updateFilteredProviders(): void {
    this.filteredProviders = [...this.providers];
    this.updateAvailableTypes();
    this.applyFilters();
  }
}