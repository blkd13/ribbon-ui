import { Component, inject, OnInit, Injectable, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormArray, AbstractControl, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';

import { genInitialBaseEntity } from '../../../../services/project.service';
import { JsonEditorComponent } from "../../../../parts/json-editor/json-editor.component";
import { AIProviderEntity, AIProviderManagerService, AIProviderType, ScopeType, ScopeInfo } from '../../../../services/model-manager.service';
import { AuthService, ScopeLabels, ScopeLabelsResponse } from '../../../../services/auth.service';
import { AdminScopeService } from '../../../../services/admin-scope.service';
import { Utils } from '../../../../utils';

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
  isFormVisible = false;
  isEditMode = false;
  isDuplicateMode = false; // 複製モードフラグを追加
  currentProviderFields: any[] = [];

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
    this.loadProviders();
  }
  ngOnInit() {
    this.initForm();

    // Subscribe to selected scope changes
    const scopeSubscription = this.adminScopeService.selectedScope$.subscribe(scope => {
      this.selectedScope = scope;
      this.updateScopeInForm(scope);
    });
    this.subscriptions.add(scopeSubscription);
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();

  }
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
      // Update the scope information in the form, but make it read-only
      this.form.get('scopeInfo')?.patchValue({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId
      });

      // Make scope fields read-only when scope is selected from admin
      this.form.get('scopeInfo.scopeType')?.disable();
      this.form.get('scopeInfo.scopeId')?.disable();
    } else if (this.form) {
      // Re-enable scope fields if no scope is selected
      this.form.get('scopeInfo.scopeType')?.enable();
      this.form.get('scopeInfo.scopeId')?.enable();
    }
  }
  private loadProviders() {
    this.authService.getScopeLabels().subscribe(scopeLabels => {
      this.scopeLabels = scopeLabels;
      this.buildScopeLabelsMap(scopeLabels);
    });

    this.providerService.getProviders().subscribe(providers => {
      // フィルタリング: 選択されたスコープの優先順位以下（数字が大きい）のプロバイダーのみを表示（優先順位が低い方にフォールバックするから）。優先順位が同じ場合はidが一致するもののみを表示
      const selectedPriority = this.adminScopeService.SCOPE_PRIORITY[this.selectedScope!.scopeType];
      providers = providers.filter(provider =>
        this.adminScopeService.SCOPE_PRIORITY[provider.scopeInfo.scopeType] > selectedPriority
        || (this.adminScopeService.SCOPE_PRIORITY[provider.scopeInfo.scopeType] === selectedPriority
          && provider.scopeInfo.scopeId === this.selectedScope!.scopeId)
      );

      // Use AdminScopeService to get only effective (highest priority) providers
      this.providers = this.adminScopeService.getEffectiveItems(providers);
    });
  }
  private buildScopeLabelsMap(scopeLabels: ScopeLabelsResponse) {
    this.scopeLabelsMap = {};

    // Build map from API scope labels
    Object.entries(scopeLabels.scopeLabels).forEach(([type, labels]) => {
      (labels as any[]).forEach(label => {
        this.scopeLabelsMap[`${type}:${label.id}`] = label.label;
      });
    });

    // TODO ここは要らない
    // For providers, also use AdminScopeService's label mapping as fallback
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

  // initFormメソッドのvalueChanges部分も修正
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
      // 編集モード中でない場合のみ新しいフォームを作成
      if (!this.isEditMode && !this.isDuplicateMode) {
        this.updateConfigForm(type);
      }
    });
  }

  private updateConfigForm(providerType: string, existingConfig?: any) {
    const configDefinition = this.providerConfigService.getConfigDefinition(providerType);
    this.currentProviderFields = configDefinition.fields;
    const newConfigForm = this.providerConfigService.createConfigForm(providerType);

    // 既存の設定値がある場合はパッチする
    if (existingConfig) {
      this.providerConfigService.patchConfigForm(newConfigForm, existingConfig, providerType);
    }

    this.form.setControl('config', newConfigForm);
  }

  // 配列フィールドの管理
  getArrayControls(fieldKey: string): FormControl[] {
    const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
    return formArray ? formArray.controls as FormControl[] : [];
  }

  addArrayItem(fieldKey: string) {
    this.providerConfigService.addArrayItem(this.form.get('config') as FormGroup, fieldKey);
  }

  removeArrayItem(fieldKey: string, index: number) {
    this.providerConfigService.removeArrayItem(this.form.get('config') as FormGroup, fieldKey, index);
  }

  // オブジェクト配列の管理メソッド
  getObjectArrayControls(fieldKey: string): FormGroup[] {
    const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
    if (!formArray) {
      return [];
    }
    return formArray.controls as FormGroup[];
  }

  addObjectArrayItem(fieldKey: string) {
    const providerType = this.form.get('basicInfo.type')?.value;
    if (!providerType) return;

    const objectFields = this.providerConfigService.getObjectArrayFields(providerType, fieldKey);
    this.providerConfigService.addObjectArrayItem(this.form.get('config') as FormGroup, fieldKey, objectFields);
  }

  removeObjectArrayItem(fieldKey: string, index: number) {
    const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
    if (!formArray || formArray.length <= 1) return;

    this.providerConfigService.removeArrayItem(this.form.get('config') as FormGroup, fieldKey, index);
  }

  getObjectFieldsForArray(fieldKey: string): any[] {
    const providerType = this.form.get('basicInfo.type')?.value;
    if (!providerType) return [];

    return this.providerConfigService.getObjectArrayFields(providerType, fieldKey);
  }

  getSingularLabel(label: string): string {
    if (label.endsWith('s')) {
      return label.slice(0, -1);
    }
    return label;
  }

  hasObjectArrayError(fieldKey: string, index: number, objectFieldKey: string): boolean {
    const control = this.form.get(`config.${fieldKey}.${index}.${objectFieldKey}`);
    return !!control?.invalid && !!control?.touched;
  }

  getObjectArrayErrorMessage(fieldKey: string, index: number, objectFieldKey: string): string {
    const control = this.form.get(`config.${fieldKey}.${index}.${objectFieldKey}`);
    if (!control?.errors) return '';

    if (control.errors['required']) return 'This field is required';
    if (control.errors['maxlength']) {
      return `Maximum length is ${control.errors['maxlength'].requiredLength}`;
    }
    return 'Invalid input';
  }  // フォーム操作
  createNew() {
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.initForm();
    this.currentProviderFields = [];
    this.form.patchValue({
      basicInfo: { isActive: true }
    });

    // Set scope from AdminScopeService if available
    if (this.selectedScope) {
      this.updateScopeInForm(this.selectedScope);
    }

    // Ensure form is editable for new providers
    this.setFormReadOnly(false);

    this.isFormVisible = true;
  }
  // 既存プロバイダーを複製して新規作成
  duplicateProvider(provider: AIProviderEntity, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    this.isEditMode = false;
    this.isDuplicateMode = true;
    this.isFormVisible = true;

    // valueChangesイベントを発火させずにtypeを設定
    this.form.get('basicInfo.type')?.setValue(provider.type, { emitEvent: false });

    // configフォームを既存の値込みで手動更新
    this.updateConfigForm(provider.type, provider.config);

    // プロバイダーデータをコピー（IDはクリア）
    this.form.patchValue({
      id: '', // IDはクリア
      basicInfo: {
        name: provider.name + '_copy', // 識別のため_copyを付加
        label: provider.label + ' (Copy)',
        description: provider.description,
        isActive: true, // 新規作成時はアクティブに
      },
      scopeInfo: {
        scopeType: provider.scopeInfo.scopeType,
        scopeId: provider.scopeInfo.scopeId
      }
    });

    // Ensure form is editable for duplicated providers
    this.setFormReadOnly(false);
  }
  // selectProviderメソッドを修正
  selectProvider(provider: AIProviderEntity) {
    // Check if user has edit permission for this provider's scope
    const canEdit = this.adminScopeService.canEditScope(
      provider.scopeInfo.scopeType,
      provider.scopeInfo.scopeId
    );

    this.isEditMode = canEdit;
    this.isDuplicateMode = false;
    this.isFormVisible = true;

    // valueChangesイベントを発火させずにtypeを設定
    this.form.get('basicInfo.type')?.setValue(provider.type, { emitEvent: false });

    // configフォームを既存の値込みで手動更新
    this.updateConfigForm(provider.type, provider.config);

    // 残りの値をパッチ
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

    // If user cannot edit, make form read-only
    if (!canEdit) {
      this.setFormReadOnly(true);
    }
  }
  register() {
    if (this.form.invalid) {
      this.markFormGroupTouched(this.form);
      this.showErrorMessage('Please fix the errors in the form');
      return;
    }

    try {
      const formValue = this.form.value;
      const cleanedConfig = this.providerConfigService.getConfigValue(this.form.get('config') as FormGroup);

      // Use the selected scope from AdminScopeService if available, otherwise use form values
      const scopeInfo = this.selectedScope || {
        scopeType: formValue.scopeInfo?.scopeType || '',
        scopeId: formValue.scopeInfo?.scopeId || ''
      };

      const providerData: AIProviderEntity = {
        ...genInitialBaseEntity('ai-provider'),
        id: formValue.id || undefined,
        type: formValue.basicInfo.type,
        name: formValue.basicInfo.name,
        label: formValue.basicInfo.label,
        description: formValue.basicInfo.description,
        isActive: formValue.basicInfo.isActive,
        scopeInfo: scopeInfo,
        config: cleanedConfig
      };

      this.providerService.upsertProvider(providerData);
      this.showSuccessMessage(
        this.isEditMode ? 'Provider updated successfully' : 'Provider created successfully'
      );

      this.loadProviders();
      this.closeForm();
    } catch (error) {
      console.error('Error processing form data:', error);
      this.showErrorMessage('Error processing form data');
    }
  }

  deleteProvider(id: string) {
    if (confirm('Are you sure you want to delete this provider?')) {
      this.providerService.deleteProvider(id);
      this.showSuccessMessage('Provider deleted successfully');
      this.loadProviders();

      if (this.form.value.id === id) {
        this.closeForm();
      }
    }
  }

  closeForm() {
    this.isFormVisible = false;
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.form.reset();
    this.currentProviderFields = [];
  }
  // フォームのタイトルを取得
  getFormTitle(): string {
    if (this.isDuplicateMode) {
      return 'Duplicate Provider';
    } else if (this.isEditMode) {
      return 'Edit Provider';
    } else if (this.isFormVisible && this.form.get('id')?.value) {
      // If form is visible with an ID but not in edit mode, it's read-only
      return 'View Provider (Read Only)';
    } else {
      return 'New Provider';
    }
  }

  // バリデーション関連
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
   * Set form controls as read-only or editable
   */
  private setFormReadOnly(readOnly: boolean): void {
    if (readOnly) {
      this.form.disable();
    } else {
      this.form.enable();
    }
  }

  /**
   * Check if user can edit a specific provider
   */
  canUserEditProvider(provider: AIProviderEntity): boolean {
    return this.adminScopeService.canEditScope(
      provider.scopeInfo.scopeType,
      provider.scopeInfo.scopeId
    );
  }
}