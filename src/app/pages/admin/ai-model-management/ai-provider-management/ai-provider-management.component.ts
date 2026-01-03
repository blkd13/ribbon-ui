/**
 * AI Provider Management - リファクタリング版
 *
 * AdminListPageComponent を使用して共通化
 * フォーム部分は別途 AIProviderFormComponent に分離予定
 */
import { Component, inject, OnInit, OnDestroy, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray, FormControl, AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminListPageComponent } from '../../../../parts/admin-list-page/admin-list-page.component';
import {
  AdminColumnDef,
  AdminFilterDef,
  AdminHeaderAction,
  AdminBulkAction,
  AdminRowAction,
  AdminFilterValues,
  AdminSortState,
  AdminActionEvent,
} from '../../../../parts/admin-list-page/admin-list-page.types';

import { genInitialBaseEntity } from '../../../../services/project.service';
import { JsonEditorComponent } from '../../../../parts/json-editor/json-editor.component';
import { AIProviderEntity, AIProviderManagerService, AIProviderType, ScopeType, ScopeInfo } from '../../../../services/model-manager.service';
import { AuthService, ScopeLabels, ScopeLabelsResponse } from '../../../../services/auth.service';
import { AdminScopeService } from '../../../../services/admin-scope.service';
import { Utils } from '../../../../utils';
import { ProviderConfigService, ProviderConfigField } from './provider-config.service';
import { AdminExportService } from '../../../../services/admin-export.service';
import {
  ImportExportDialogComponent,
  ImportExportDialogData,
  ImportExportDialogResult
} from '../../shared/import-export-dialog/import-export-dialog.component';
import {
  ProviderTestDialogComponent,
  ProviderTestDialogData
} from '../../shared/provider-test-dialog/provider-test-dialog.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-ai-provider-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatDialogModule,
    AdminListPageComponent,
    JsonEditorComponent,
  ],
  templateUrl: './ai-provider-management.component.html',
  styleUrl: './ai-provider-management.component.scss',
})
export class AIProviderManagementComponent implements OnInit, OnDestroy {
  // ========== Services ==========
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly providerService = inject(AIProviderManagerService);
  private readonly providerConfigService = inject(ProviderConfigService);
  private readonly authService = inject(AuthService);
  private readonly adminScopeService = inject(AdminScopeService);
  private readonly exportService = inject(AdminExportService);
  private readonly dialog = inject(MatDialog);

  // ========== Templates ==========
  @ViewChild('providerCell') providerCellTemplate!: TemplateRef<any>;
  @ViewChild('scopeCell') scopeCellTemplate!: TemplateRef<any>;
  @ViewChild('activeCell') activeCellTemplate!: TemplateRef<any>;

  // ========== Data ==========
  providers: AIProviderEntity[] = [];
  filteredProviders: AIProviderEntity[] = [];
  selectedIds = new Set<string>();
  selectedScope: ScopeInfo | null = null;
  scopeLabelsMap: Record<string, string> = {};
  availableTypes: string[] = [];

  // ========== フォーム状態 ==========
  form!: FormGroup;
  isFormVisible = false;
  isEditMode = false;
  isDuplicateMode = false;
  isViewOnlyMode = false;
  isOverrideMode = false;
  selectedProvider: AIProviderEntity | null = null;
  currentProviderFields: ProviderConfigField[] = [];

  // ========== フィルター・ソート ==========
  filterValues: AdminFilterValues = {
    search: '',
    type: [],
    status: '',
  };
  sortState: AdminSortState = { column: 'label', direction: 'asc' };

  // ========== 定義 ==========
  columns: AdminColumnDef<AIProviderEntity>[] = [];
  filters: AdminFilterDef[] = [];
  headerActions: AdminHeaderAction[] = [];
  bulkActions: AdminBulkAction[] = [];
  rowActions: AdminRowAction<AIProviderEntity>[] = [];

  // ========== Enum ==========
  readonly AIProviderType = AIProviderType;
  readonly providerOptions = Object.values(AIProviderType);
  readonly scopeTypeOptions = [
    { value: ScopeType.ORGANIZATION, label: 'Organization' },
    { value: ScopeType.DIVISION, label: 'Division' },
  ];
  Utils = Utils;

  private subscriptions = new Subscription();
  private scopeLabels: ScopeLabelsResponse = {
    scopeLabels: {
      [ScopeType.ORGANIZATION]: [],
      [ScopeType.DIVISION]: [],
      [ScopeType.PROJECT]: [],
      [ScopeType.TEAM]: [],
    },
    roleList: [],
  };

  ngOnInit() {
    this.initForm();
    this.initColumns();
    this.initFilters();
    this.initActions();

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

  // ========== 初期化メソッド ==========

  private initColumns(): void {
    this.columns = [
      {
        key: 'name',
        label: 'Provider',
        sortable: true,
        render: (item) => item.name,
        renderSub: (item) => item.type,
      },
      {
        key: 'label',
        label: 'Label',
        sortable: true,
      },
      {
        key: 'scopeInfo',
        label: 'Scope',
        sortable: true,
        render: (item) => this.scopeLabelsMap[`${item.scopeInfo.scopeType}:${item.scopeInfo.scopeId}`] || item.scopeInfo.scopeId,
        renderSub: (item) => item.scopeInfo.scopeType,
      },
      {
        key: 'isActive',
        label: 'Active',
        sortable: true,
        align: 'center',
        width: '80px',
        render: (item) => item.isActive ? '✓' : '✗',
        cellClass: (item) => item.isActive ? 'status-active' : 'status-inactive',
      },
    ];
  }

  private initFilters(): void {
    this.filters = [
      {
        key: 'search',
        label: 'Search providers...',
        type: 'text',
        icon: 'search',
      },
      {
        key: 'type',
        label: 'Type',
        type: 'multi-select',
        options: [], // will be populated dynamically
        icon: 'filter_list',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'boolean',
        icon: 'visibility',
      },
    ];
  }

  private initActions(): void {
    this.headerActions = [
      {
        id: 'import-export',
        label: 'Import/Export',
        icon: 'import_export',
      },
      {
        id: 'create',
        label: '新規登録',
        icon: 'add',
        color: 'primary',
        disabled: !this.canCreateProvider(),
        disabledTooltip: 'You do not have permission to create providers in the current scope',
      },
    ];

    this.bulkActions = [
      {
        id: 'activate',
        label: 'Activate',
        icon: 'visibility',
        color: 'primary',
        disabled: () => !this.canBulkEdit(),
      },
      {
        id: 'deactivate',
        label: 'Deactivate',
        icon: 'visibility_off',
        disabled: () => !this.canBulkEdit(),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'delete',
        color: 'warn',
        disabled: () => !this.canBulkEdit(),
      },
    ];

    this.rowActions = [
      // 自分のスコープの場合
      {
        id: 'edit',
        icon: 'edit',
        tooltip: 'Edit this provider',
        visible: (item) => this.shouldShowEditButton(item),
      },
      {
        id: 'test',
        icon: 'network_check',
        tooltip: 'Test connection',
        visible: (item) => item.isActive && !!item.id,
      },
      {
        id: 'duplicate',
        icon: 'file_copy',
        tooltip: 'Duplicate this provider',
        visible: (item) => this.shouldShowDuplicateButton(item),
      },
      {
        id: 'delete',
        icon: 'delete',
        tooltip: 'Delete this provider',
        visible: (item) => this.shouldShowDeleteButton(item),
      },
      // 他のスコープの場合
      {
        id: 'view',
        icon: 'visibility',
        tooltip: 'View provider details',
        visible: (item) => this.shouldShowViewButton(item),
      },
      {
        id: 'override',
        icon: 'content_copy',
        tooltip: 'Create override in your scope',
        visible: (item) => this.shouldShowOverrideButton(item),
      },
    ];
  }

  private initForm(): void {
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
        scopeId: ['', Validators.required],
      }),
      config: this.fb.group({}),
    });

    this.form.get('basicInfo.type')?.valueChanges.subscribe(type => {
      if (!this.isEditMode && !this.isDuplicateMode && !this.isOverrideMode) {
        this.updateConfigForm(type);
      }
    });
  }

  // ========== データ読み込み ==========

  private loadProviders(): void {
    this.authService.getScopeLabels().subscribe(scopeLabels => {
      this.scopeLabels = scopeLabels;
      this.buildScopeLabelsMap(scopeLabels);
    });

    this.providerService.getProviders(true).subscribe(allProviders => {
      const visibleProviders = this.adminScopeService.getVisibleItems(allProviders);
      this.providers = this.adminScopeService.getEffectiveItems(visibleProviders);
      this.updateAvailableTypes();
      this.applyFiltersAndSort();
    });
  }

  private buildScopeLabelsMap(scopeLabels: ScopeLabelsResponse): void {
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

  private updateAvailableTypes(): void {
    const types = new Set<string>();
    this.providers.forEach(p => types.add(p.type));
    this.availableTypes = Array.from(types).sort();

    // Update filter options
    const typeFilter = this.filters.find(f => f.key === 'type');
    if (typeFilter) {
      typeFilter.options = this.availableTypes.map(t => ({ value: t, label: t }));
    }
  }

  // ========== イベントハンドラ ==========

  onFilterChange(values: AdminFilterValues): void {
    this.filterValues = values;
    this.applyFiltersAndSort();
  }

  onSortChange(state: AdminSortState): void {
    this.sortState = state;
    this.applyFiltersAndSort();
  }

  onItemSelect(item: AIProviderEntity): void {
    if (this.isProvidersOwnScope(item)) {
      this.editProvider(item);
    } else {
      this.viewProvider(item);
    }
  }

  onSelectionChange(ids: Set<string>): void {
    this.selectedIds = ids;
  }

  onActionClick(event: AdminActionEvent<AIProviderEntity>): void {
    switch (event.actionId) {
      case 'import-export':
        this.openImportExportDialog();
        break;
      case 'create':
        this.createNew();
        break;
      case 'edit':
        if (event.item) this.editProvider(event.item);
        break;
      case 'view':
        if (event.item) this.viewProvider(event.item);
        break;
      case 'duplicate':
        if (event.item) this.duplicateProvider(event.item);
        break;
      case 'override':
        if (event.item) this.startOverride(event.item);
        break;
      case 'delete':
        if (event.item) this.deleteProvider(event.item.id);
        break;
      case 'test':
        if (event.item) this.testProvider(event.item);
        break;
      case 'activate':
        this.bulkToggleStatus(true);
        break;
      case 'deactivate':
        this.bulkToggleStatus(false);
        break;
      case 'bulk-delete':
        this.bulkDelete();
        break;
    }
  }

  // ========== フィルター・ソート ==========

  private applyFiltersAndSort(): void {
    let filtered = [...this.providers];

    // 検索フィルター
    const search = (this.filterValues['search'] || '').toLowerCase();
    if (search) {
      filtered = filtered.filter(p =>
        p.label.toLowerCase().includes(search) ||
        p.name.toLowerCase().includes(search) ||
        p.type.toLowerCase().includes(search)
      );
    }

    // タイプフィルター
    const types = this.filterValues['type'] as string[] || [];
    if (types.length > 0) {
      filtered = filtered.filter(p => types.includes(p.type));
    }

    // ステータスフィルター
    const status = this.filterValues['status'];
    if (status === 'true') {
      filtered = filtered.filter(p => p.isActive);
    } else if (status === 'false') {
      filtered = filtered.filter(p => !p.isActive);
    }

    // ソート
    if (this.sortState.column) {
      filtered.sort((a, b) => {
        let valueA: any;
        let valueB: any;

        switch (this.sortState.column) {
          case 'name':
            valueA = a.name;
            valueB = b.name;
            break;
          case 'label':
            valueA = a.label;
            valueB = b.label;
            break;
          case 'scopeInfo':
            valueA = `${a.scopeInfo.scopeType}:${a.scopeInfo.scopeId}`;
            valueB = `${b.scopeInfo.scopeType}:${b.scopeInfo.scopeId}`;
            break;
          case 'isActive':
            valueA = a.isActive ? 1 : 0;
            valueB = b.isActive ? 1 : 0;
            break;
          default:
            valueA = a.label;
            valueB = b.label;
        }

        if (typeof valueA === 'string' && typeof valueB === 'string') {
          const result = valueA.localeCompare(valueB);
          return this.sortState.direction === 'asc' ? result : -result;
        }
        const result = valueA - valueB;
        return this.sortState.direction === 'asc' ? result : -result;
      });
    }

    this.filteredProviders = filtered;
  }

  // ========== 権限チェック ==========

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
    if (!this.selectedScope) return false;
    return provider.scopeInfo.scopeType === this.selectedScope.scopeType &&
           provider.scopeInfo.scopeId === this.selectedScope.scopeId;
  }

  canBulkEdit(): boolean {
    return this.selectedIds.size > 0 && Array.from(this.selectedIds).some(id => {
      const provider = this.providers.find(p => p.id === id);
      return provider && this.canUserEditProvider(provider);
    });
  }

  // ========== UI表示判定 ==========

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

  // ========== CRUD操作 ==========

  createNew(): void {
    if (!this.canCreateProvider()) {
      this.showError('You do not have permission to create providers in the current scope');
      return;
    }

    this.resetFormState();
    this.isFormVisible = true;
    this.initForm();
    this.currentProviderFields = [];
    this.form.patchValue({ basicInfo: { isActive: true } });

    if (this.selectedScope) {
      this.updateScopeInForm(this.selectedScope);
    }
    this.setFormReadOnly(false);
  }

  viewProvider(provider: AIProviderEntity): void {
    this.selectedProvider = provider;
    this.resetFormState();
    this.isViewOnlyMode = true;
    this.isFormVisible = true;
    this.loadProviderToForm(provider);
    this.setFormReadOnly(true);
  }

  editProvider(provider: AIProviderEntity): void {
    if (!this.isProvidersOwnScope(provider)) {
      this.showError('You can only edit providers in your own scope');
      return;
    }

    this.selectedProvider = provider;
    this.resetFormState();
    this.isEditMode = true;
    this.isFormVisible = true;
    this.loadProviderToForm(provider);
    this.setFormReadOnly(false);
  }

  duplicateProvider(provider: AIProviderEntity): void {
    if (!this.canCreateProvider()) {
      this.showError('You do not have permission to create providers in the current scope');
      return;
    }

    this.selectedProvider = provider;
    this.resetFormState();
    this.isDuplicateMode = true;
    this.isFormVisible = true;
    this.initForm();

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
        scopeId: provider.scopeInfo.scopeId,
      },
    });

    this.setFormReadOnly(false);
  }

  startOverride(provider: AIProviderEntity): void {
    if (!this.canCreateProvider()) {
      this.showError('You do not have permission to create providers in the current scope');
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

  deleteProvider(id: string): void {
    const provider = this.providers.find(p => p.id === id);
    if (!provider) {
      this.showError('Provider not found');
      return;
    }

    if (!this.canUserEditProvider(provider)) {
      this.showError('You do not have permission to delete this provider');
      return;
    }

    if (confirm('Are you sure you want to delete this provider?')) {
      this.providerService.deleteProvider(id).subscribe({
        next: () => {
          this.showSuccess('Provider deleted successfully');
          this.loadProviders();
          if (this.form.value.id === id) {
            this.closeForm();
          }
        },
        error: (error) => {
          console.error('Error deleting provider:', error);
          this.showError('Failed to delete provider');
        },
      });
    }
  }

  testProvider(provider: AIProviderEntity): void {
    const dialogData: ProviderTestDialogData = {
      provider: provider
    };

    this.dialog.open(ProviderTestDialogComponent, {
      width: '500px',
      data: dialogData
    });
  }

  register(): void {
    if (this.isViewOnlyMode) return;

    if (this.form.invalid) {
      this.markFormGroupTouched(this.form);
      this.showError('Please fix the errors in the form');
      return;
    }

    const formValue = this.form.getRawValue();
    const cleanedConfig = this.providerConfigService.getConfigValue(this.form.get('config') as FormGroup);

    const scopeInfo = this.selectedScope;
    if (!scopeInfo) {
      this.showError('No scope selected');
      return;
    }

    const isUpdate = formValue.id && this.isEditMode && !this.isOverrideMode;

    const providerData: AIProviderEntity = {
      ...genInitialBaseEntity('ai-provider'),
      id: isUpdate ? formValue.id : undefined,
      type: formValue.basicInfo.type,
      name: formValue.basicInfo.name,
      label: formValue.basicInfo.label,
      description: formValue.basicInfo.description,
      isActive: formValue.basicInfo.isActive,
      scopeInfo: scopeInfo,
      config: cleanedConfig,
    };

    this.providerService.upsertProvider(providerData);

    const successMessage = this.isOverrideMode
      ? 'Provider override created successfully'
      : isUpdate
        ? 'Provider updated successfully'
        : 'Provider created successfully';

    this.showSuccess(successMessage);
    this.loadProviders();
    this.closeForm();
  }

  // ========== 一括操作 ==========

  bulkToggleStatus(isActive: boolean): void {
    if (!this.canBulkEdit()) return;

    const selected = Array.from(this.selectedIds)
      .map(id => this.providers.find(p => p.id === id))
      .filter(p => p && this.canUserEditProvider(p)) as AIProviderEntity[];

    if (selected.length === 0) return;

    const statusLabel = isActive ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${statusLabel} ${selected.length} providers?`)) return;

    selected.forEach(provider => {
      this.providerService.upsertProvider({ ...provider, isActive });
    });

    this.showSuccess(`${selected.length} providers ${statusLabel}d`);
    this.selectedIds = new Set();
    this.loadProviders();
  }

  bulkDelete(): void {
    if (!this.canBulkEdit()) return;

    const selected = Array.from(this.selectedIds)
      .map(id => this.providers.find(p => p.id === id))
      .filter(p => p && this.canUserEditProvider(p)) as AIProviderEntity[];

    if (selected.length === 0) return;

    if (!confirm(`Are you sure you want to delete ${selected.length} providers?`)) return;

    Promise.all(selected.map(p => this.providerService.deleteProvider(p.id)))
      .then(() => {
        this.showSuccess(`${selected.length} providers deleted`);
        this.selectedIds = new Set();
        this.loadProviders();
      })
      .catch(error => {
        console.error('Bulk delete failed:', error);
        this.showError('Bulk delete failed');
      });
  }

  // ========== フォームヘルパー ==========

  closeForm(): void {
    this.isFormVisible = false;
    this.resetFormState();
    this.selectedProvider = null;
    this.currentProviderFields = [];
    this.initForm();
  }

  private resetFormState(): void {
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.isViewOnlyMode = false;
    this.isOverrideMode = false;
  }

  private loadProviderToForm(provider: AIProviderEntity): void {
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
      scopeInfo: provider.scopeInfo,
    });
  }

  private prepareOverrideForm(provider: AIProviderEntity): void {
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
      },
    });
  }

  private updateScopeInForm(scope: ScopeInfo | null): void {
    if (scope && this.form) {
      this.form.get('scopeInfo')?.patchValue({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
      });
      this.form.get('scopeInfo.scopeType')?.disable();
      this.form.get('scopeInfo.scopeId')?.disable();
    } else if (this.form) {
      this.form.get('scopeInfo.scopeType')?.enable();
      this.form.get('scopeInfo.scopeId')?.enable();
    }
  }

  private updateConfigForm(providerType: string, existingConfig?: any): void {
    if (!providerType) {
      this.currentProviderFields = [];
      this.form.setControl('config', this.fb.group({}));
      return;
    }

    const configDefinition = this.providerConfigService.getConfigDefinition(providerType);
    this.currentProviderFields = configDefinition.fields;
    const newConfigForm = this.providerConfigService.createConfigForm(providerType);

    if (existingConfig) {
      this.providerConfigService.patchConfigForm(newConfigForm, existingConfig, providerType);
    }

    this.form.setControl('config', newConfigForm);

    if (this.isViewOnlyMode) {
      newConfigForm.disable();
    }
  }

  private setFormReadOnly(readOnly: boolean): void {
    if (readOnly) {
      this.form.disable();
    } else {
      this.form.enable();
      if (this.selectedScope) {
        this.form.get('scopeInfo.scopeType')?.disable();
        this.form.get('scopeInfo.scopeId')?.disable();
      }
    }
  }

  getFormTitle(): string {
    if (this.isViewOnlyMode) return 'View Provider';
    if (this.isOverrideMode) return 'Override Provider';
    if (this.isDuplicateMode) return 'Duplicate Provider';
    if (this.isEditMode) return 'Edit Provider';
    return 'New Provider';
  }

  // ========== バリデーション ==========

  hasError(controlPath: string): boolean {
    const control = this.form.get(controlPath);
    return !!control?.invalid && !!control?.touched;
  }

  getErrorMessage(controlPath: string): string {
    const control = this.form.get(controlPath);
    if (!control?.errors) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['maxlength']) return `Maximum length is ${control.errors['maxlength'].requiredLength}`;
    return 'Invalid input';
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
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

  isEditDisabled(): boolean {
    return this.form.invalid || this.isViewOnlyMode;
  }

  // ========== 配列フィールド ==========

  getArrayControls(fieldKey: string): FormControl[] {
    const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
    return formArray?.controls as FormControl[] || [];
  }

  addArrayItem(fieldKey: string): void {
    if (this.isViewOnlyMode) return;
    this.providerConfigService.addArrayItem(this.form.get('config') as FormGroup, fieldKey);
  }

  removeArrayItem(fieldKey: string, index: number): void {
    if (this.isViewOnlyMode) return;
    this.providerConfigService.removeArrayItem(this.form.get('config') as FormGroup, fieldKey, index);
  }

  getObjectArrayControls(fieldKey: string): FormGroup[] {
    const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
    return formArray?.controls as FormGroup[] || [];
  }

  addObjectArrayItem(fieldKey: string): void {
    if (this.isViewOnlyMode) return;
    const providerType = this.form.get('basicInfo.type')?.value;
    if (!providerType) return;
    const objectFields = this.providerConfigService.getObjectArrayFields(providerType, fieldKey);
    this.providerConfigService.addObjectArrayItem(this.form.get('config') as FormGroup, fieldKey, objectFields);
  }

  removeObjectArrayItem(fieldKey: string, index: number): void {
    if (this.isViewOnlyMode) return;
    const formArray = this.form.get(`config.${fieldKey}`) as FormArray;
    if (!formArray || formArray.length <= 1) return;
    this.providerConfigService.removeArrayItem(this.form.get('config') as FormGroup, fieldKey, index);
  }

  getObjectFieldsForArray(fieldKey: string): ProviderConfigField[] {
    const providerType = this.form.get('basicInfo.type')?.value;
    if (!providerType) return [];
    return this.providerConfigService.getObjectArrayFields(providerType, fieldKey);
  }

  getSingularLabel(label: string): string {
    return label.endsWith('s') ? label.slice(0, -1) : label;
  }

  hasObjectArrayError(fieldKey: string, index: number, objectFieldKey: string): boolean {
    const control = this.form.get(`config.${fieldKey}.${index}.${objectFieldKey}`);
    return !!control?.invalid && !!control?.touched;
  }

  getObjectArrayErrorMessage(fieldKey: string, index: number, objectFieldKey: string): string {
    const control = this.form.get(`config.${fieldKey}.${index}.${objectFieldKey}`);
    if (!control?.errors) return '';
    if (control.errors['required']) return 'This field is required';
    if (control.errors['maxlength']) return `Maximum length is ${control.errors['maxlength'].requiredLength}`;
    return 'Invalid input';
  }

  // ========== スコープ ==========

  getScopeTypeLabel(scopeType: ScopeType): string {
    const option = this.scopeTypeOptions.find(o => o.value === scopeType);
    return option?.label || scopeType;
  }

  getScopeLabel(scope: ScopeInfo): string {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    return this.scopeLabelsMap[key] || scope.scopeId;
  }

  scopeLabelsList(type: keyof ScopeLabels) {
    return this.scopeLabels.scopeLabels[type] || [];
  }

  switchToOverrideMode(): void {
    if (!this.selectedProvider || !this.canCreateProvider()) return;
    this.isViewOnlyMode = false;
    this.isOverrideMode = true;
    this.prepareOverrideForm(this.selectedProvider);
    this.setFormReadOnly(false);
  }

  // ========== TrackBy ==========

  trackByProvider(item: AIProviderEntity): string {
    return item.id;
  }

  getRowClass(item: AIProviderEntity): Record<string, boolean> {
    return {
      'own-scope': this.isProvidersOwnScope(item),
      'other-scope': !this.isProvidersOwnScope(item),
    };
  }

  // ========== 通知 ==========

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000 });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000, panelClass: 'error-snackbar' });
  }

  // ========== Import/Export ==========

  openImportExportDialog(): void {
    const dialogData: ImportExportDialogData = {
      mode: 'both',
      dataType: 'providers',
      scopeInfo: this.selectedScope,
      models: [],
      providers: this.providers,
    };

    const dialogRef = this.dialog.open(ImportExportDialogComponent, {
      width: '600px',
      maxHeight: '80vh',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result: ImportExportDialogResult) => {
      if (result?.action === 'imported') {
        // インポート後にデータをリロード
        this.loadProviders();
        this.snackBar.open(
          `Imported ${result.importedProviders || 0} providers`,
          'Close',
          { duration: 3000 }
        );
      }
    });
  }
}
