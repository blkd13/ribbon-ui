// ai-model-management.component.ts - Refactored version using AdminListPageComponent
import { CommonModule, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { LiveAnnouncer } from '@angular/cdk/a11y';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin, of, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AdminListPageComponent } from '../../../../parts/admin-list-page/admin-list-page.component';
import {
  AdminActionEvent,
  AdminBulkAction,
  AdminColumnDef,
  AdminFilterDef,
  AdminFilterValues,
  AdminHeaderAction,
  AdminRowAction,
  AdminSortState,
} from '../../../../parts/admin-list-page/admin-list-page.types';
import { TrimTrailingZerosPipe } from '../../../../pipe/trim-trailing-zeros.pipe';
import { AdminScopeService } from '../../../../services/admin-scope.service';
import { AuthService, ScopeLabels, ScopeLabelsResponse } from '../../../../services/auth.service';
import { GService } from '../../../../services/g.service';
import {
  AIModelEntity,
  AIModelEntityForView,
  AIModelManagerService,
  AIModelPricingService,
  AIModelStatus,
  AIProviderEntity,
  AIProviderManagerService,
  Modality,
  ModelPricing,
  ScopeInfo,
  ScopeType,
  TagEntity,
  TagService
} from '../../../../services/model-manager.service';
import { genInitialBaseEntity } from '../../../../services/project.service';
import { AdminExportService } from '../../../../services/admin-export.service';
import { BulkProviderDialogComponent } from '../bulk-provider-dialog/bulk-provider-dialog.component';
import { BulkTagDialogComponent } from '../bulk-tag-dialog/bulk-tag-dialog.component';
import { TagManagementDialogComponent } from '../tag-management-dialog/tag-management-dialog.component';
import {
  ImportExportDialogComponent,
  ImportExportDialogData,
  ImportExportDialogResult
} from '../../shared/import-export-dialog/import-export-dialog.component';

@Component({
  selector: 'app-ai-model-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatTooltipModule,
    MatSelectModule,
    MatDialogModule,
    MatCardModule,
    MatCheckboxModule,
    MatExpansionModule,
    TrimTrailingZerosPipe,
    AdminListPageComponent,
  ],
  templateUrl: './ai-model-management.component.html',
  styleUrl: './ai-model-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DecimalPipe],
})
export class AIModelManagementComponent implements OnInit, OnDestroy {
  // ========== Template References ==========
  // Optimized cell templates (8 → 4 columns)
  @ViewChild('nameCell') nameCellTemplate!: TemplateRef<any>;
  @ViewChild('specsCell') specsCellTemplate!: TemplateRef<any>;
  @ViewChild('priceCell') priceCellTemplate!: TemplateRef<any>;
  @ViewChild('statusCell') statusCellTemplate!: TemplateRef<any>;

  // ========== Services ==========
  form!: FormGroup;
  private fb: FormBuilder = inject(FormBuilder);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private readonly adminScopeService = inject(AdminScopeService);
  readonly announcer = inject(LiveAnnouncer);
  readonly dialog = inject(MatDialog);
  private decimalPipe = inject(DecimalPipe);

  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  readonly aiProviderService: AIProviderManagerService = inject(AIProviderManagerService);
  readonly aiModelService: AIModelManagerService = inject(AIModelManagerService);
  readonly aiModelPricingService: AIModelPricingService = inject(AIModelPricingService);
  readonly g = inject(GService);
  readonly translate: TranslateService = inject(TranslateService);
  readonly tagService = inject(TagService);
  readonly authService = inject(AuthService);
  readonly exportService = inject(AdminExportService);

  // ========== Data ==========
  models: AIModelEntityForView[] = [];
  filteredModels: AIModelEntityForView[] = [];
  selectedModel: AIModelEntityForView | null = null;
  selectedIds: Set<string> = new Set();
  isLoading = false;

  // Subscriptions
  private subscriptions = new Subscription();

  // Selected scope from admin
  selectedScope: ScopeInfo | null = null;

  // ========== AdminListPage Configuration ==========
  columns: AdminColumnDef<AIModelEntityForView>[] = [];
  filters: AdminFilterDef[] = [];
  filterValues: AdminFilterValues = {
    search: '',
    provider: [],
    tag: [],
    status: '',
  };
  sortState: AdminSortState = { column: null, direction: 'desc' };

  headerActions: AdminHeaderAction[] = [
    {
      id: 'import-export',
      label: 'Import/Export',
      icon: 'import_export',
    },
    {
      id: 'manage-tags',
      label: 'Tags',
      icon: 'local_offer',
    },
    {
      id: 'create',
      label: 'New Model',
      icon: 'add',
      color: 'primary',
      disabled: () => !this.canCreateModel(),
      tooltip: () => !this.canCreateModel() ? 'You do not have permission to create models' : '',
    },
  ];

  bulkActions: AdminBulkAction[] = [
    { id: 'activate', label: 'Activate', icon: 'visibility', color: 'primary', disabled: () => !this.canBulkEdit() },
    { id: 'deactivate', label: 'Deactivate', icon: 'visibility_off', disabled: () => !this.canBulkEdit() },
    { id: 'add-tags', label: 'Add Tags', icon: 'local_offer', disabled: () => !this.canBulkEdit() },
    { id: 'set-providers', label: 'Set Providers', icon: 'settings', disabled: () => !this.canBulkEdit() },
    { id: 'delete', label: 'Delete', icon: 'delete', color: 'warn', disabled: () => !this.canBulkEdit() },
  ];

  rowActions: AdminRowAction<AIModelEntityForView>[] = [];

  // ========== 表示状態管理 ==========
  isFormVisible = false;
  isEditMode = false;
  isDuplicateMode = false;
  isViewOnlyMode = false;
  isOverrideMode = false;
  activeTab = 'basic';

  // Accordion expanded state
  expandedSections = {
    capabilities: false,
    pricing: false,
    advanced: false
  };

  // ========== 価格情報管理 ==========
  currentPricing: ModelPricing | null = null;
  pricingHistory: ModelPricing[] = [];
  hasExistingPricing = false;
  pricingSelectionMode: 'new' | 'edit' = 'new';
  selectedPricingId: string | undefined = undefined;

  // ========== ドロップダウンオプション ==========
  providerOptions: AIProviderEntity[] = [];
  statusOptions = Object.values(AIModelStatus);
  modalityOptions = Object.values(Modality);

  // ========== タグ関連 ==========
  availableTags: string[] = [];
  availableTagEntities: TagEntity[] = [];
  filteredTags: TagEntity[] = [];
  availableProviders: string[] = [];

  // ========== Scope management ==========
  readonly scopeTypeOptions = [
    { value: ScopeType.ORGANIZATION, label: 'Organization' },
    { value: ScopeType.DIVISION, label: 'Division' },
  ];
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
    this.loadData();
  }

  ngOnInit() {
    this.initForm();
    this.loadTags();
    this.initializeColumns();
    this.initializeFilters();
    this.initializeRowActions();

    // Subscribe to selected scope changes
    const scopeSubscription = this.adminScopeService.selectedScope$.subscribe(scope => {
      this.selectedScope = scope;
      this.updateScopeInForm(scope);
      this.loadModels();
    });
    this.subscriptions.add(scopeSubscription);

    this.loadModels();
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  // ========== Column/Filter/Action Initialization ==========

  private initializeColumns(): void {
    // Optimized columns: 8 → 4 columns for better readability
    setTimeout(() => {
      this.columns = [
        {
          key: 'name',
          label: 'Model',
          subLabel: 'Provider',
          sortable: true,
          template: this.nameCellTemplate,
        },
        {
          key: 'specs',
          label: 'Specs',
          subLabel: 'Context / Output',
          sortable: true,
          template: this.specsCellTemplate,
        },
        {
          key: 'price',
          label: 'Price',
          subLabel: '$/1M tokens',
          sortable: true,
          align: 'right',
          template: this.priceCellTemplate,
        },
        {
          key: 'status',
          label: 'Status',
          subLabel: 'Scope / Tags',
          sortable: true,
          template: this.statusCellTemplate,
        },
      ];
      this.cdr.markForCheck();
    });
  }

  private initializeFilters(): void {
    this.filters = [
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Search models...', icon: 'search' },
      { key: 'provider', label: 'Provider', type: 'multi-select', options: [], icon: 'filter_list' },
      { key: 'tag', label: 'Tags', type: 'multi-select', options: [], icon: 'local_offer' },
      { key: 'status', label: 'Status', type: 'boolean', icon: 'visibility' },
    ];
  }

  private initializeRowActions(): void {
    this.rowActions = [
      {
        id: 'edit',
        icon: 'edit',
        tooltip: 'Edit this model',
        visible: (item) => this.isModelsOwnScope(item) && this.shouldShowEditButton(item),
      },
      {
        id: 'view',
        icon: 'visibility',
        tooltip: 'View model details',
        visible: (item) => !this.isModelsOwnScope(item),
      },
      {
        id: 'duplicate',
        icon: 'file_copy',
        tooltip: 'Duplicate this model',
        visible: (item) => this.shouldShowDuplicateButton(item),
      },
      {
        id: 'override',
        icon: 'content_copy',
        tooltip: 'Create override in your scope',
        visible: (item) => this.shouldShowOverrideButton(item),
        class: 'override-button',
      },
      {
        id: 'delete',
        icon: 'delete',
        tooltip: 'Delete this model',
        visible: (item) => this.shouldShowDeleteButton(item),
        color: 'warn',
      },
    ];
  }

  private updateFilterOptions(): void {
    // Update provider options
    const providerFilter = this.filters.find(f => f.key === 'provider');
    if (providerFilter) {
      providerFilter.options = this.availableProviders.map(p => ({ value: p, label: p }));
    }

    // Update tag options
    const tagFilter = this.filters.find(f => f.key === 'tag');
    if (tagFilter) {
      tagFilter.options = this.availableTags.map(t => ({ value: t, label: this.getTagDisplayName(t) }));
    }
  }

  // ========== AdminListPage Event Handlers ==========

  onFilterChange(values: AdminFilterValues): void {
    this.filterValues = values;
    this.applyFilters();
  }

  onSortChange(state: AdminSortState): void {
    this.sortState = state;
    this.applySorting();
  }

  onItemSelect(model: AIModelEntityForView): void {
    this.selectModel(model);
  }

  onSelectionChange(ids: Set<string>): void {
    this.selectedIds = ids;
  }

  onActionClick(event: AdminActionEvent<AIModelEntityForView>): void {
    switch (event.actionId) {
      case 'import-export':
        this.openImportExportDialog();
        break;
      case 'manage-tags':
        this.openTagManagement();
        break;
      case 'create':
        this.createNew();
        break;
      case 'edit':
        if (event.item) this.editModel(event.item);
        break;
      case 'view':
        if (event.item) this.viewModel(event.item);
        break;
      case 'duplicate':
        if (event.item) this.duplicateModel(event.item);
        break;
      case 'override':
        if (event.item) this.startOverride(event.item);
        break;
      case 'delete':
        if (event.item) this.deleteModel(event.item.id);
        break;
      case 'activate':
        this.bulkToggleStatus(true);
        break;
      case 'deactivate':
        this.bulkToggleStatus(false);
        break;
      case 'add-tags':
        this.openBulkTagDialog();
        break;
      case 'set-providers':
        this.openBulkProviderDialog();
        break;
    }
  }

  getScopeLabel(scope: ScopeInfo): string {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    return this.scopeLabelsMap[key] || scope.scopeId;
  }

  getScopeDisplayName(scope: ScopeInfo): string {
    return `${this.getScopeTypeLabel(scope.scopeType)}: ${this.getScopeLabel(scope)}`;
  }

  // ========== スコープ関連メソッド ==========

  private updateScopeInForm(scope: ScopeInfo | null) {
    if (scope && this.form) {
      this.form.get('scopeInfo')?.patchValue({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId
      });
      this.form.get('scopeInfo.scopeType')?.disable();
      this.form.get('scopeInfo.scopeId')?.disable();
    } else if (this.form) {
      this.form.get('scopeInfo.scopeType')?.enable();
      this.form.get('scopeInfo.scopeId')?.enable();
    }
  }

  scopeLabelsList(type: keyof ScopeLabels) {
    return this.scopeLabels.scopeLabels[type] || [];
  }

  getScopeTypeLabel(scopeType: ScopeType): string {
    const typeOption = this.scopeTypeOptions.find(option => option.value === scopeType);
    return typeOption ? typeOption.label : scopeType;
  }

  // ========== 権限チェック ==========

  canCreateModel(): boolean {
    return this.adminScopeService.canCreateAIProvider();
  }

  canUserEditModel(model: AIModelEntityForView): boolean {
    return this.adminScopeService.canEditScope(model.scopeInfo.scopeType, model.scopeInfo.scopeId);
  }

  isModelsOwnScope(model: AIModelEntityForView): boolean {
    const currentScope = this.selectedScope;
    if (!currentScope) return false;
    return model.scopeInfo.scopeType === currentScope.scopeType && model.scopeInfo.scopeId === currentScope.scopeId;
  }

  // ========== UIヘルパーメソッド ==========

  shouldShowEditButton(model: AIModelEntityForView): boolean {
    return this.canUserEditModel(model) && this.isModelsOwnScope(model);
  }

  shouldShowOverrideButton(model: AIModelEntityForView): boolean {
    return !this.isModelsOwnScope(model) && this.canCreateModel();
  }

  shouldShowDuplicateButton(model: AIModelEntityForView): boolean {
    return this.isModelsOwnScope(model) && this.canCreateModel();
  }

  shouldShowDeleteButton(model: AIModelEntityForView): boolean {
    return this.shouldShowEditButton(model);
  }

  getRowClass(model: AIModelEntityForView): Record<string, boolean> {
    return {
      'own-scope': this.isModelsOwnScope(model),
      'other-scope': !this.isModelsOwnScope(model),
    };
  }

  trackByModel(model: AIModelEntityForView): string {
    return model.id;
  }

  // ========== データ読み込み ==========

  private loadModels() {
    this.isLoading = true;
    this.cdr.markForCheck();

    this.authService.getScopeLabels().subscribe(scopeLabels => {
      this.scopeLabels = scopeLabels;
      this.buildScopeLabelsMap(scopeLabels);
    });

    this.aiModelService.getAIModels(true, true).subscribe({
      next: (allModels) => {
        const visibleModels = this.adminScopeService.getVisibleItems(allModels);
        this.models = this.adminScopeService.getEffectiveItems(visibleModels);
        this.updateFilteredModels();
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error loading models:', err);
        this.showErrorMessage('Error loading models');
        this.isLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  loadData() {
    this.aiProviderService.getProviders(false).subscribe({
      next: (providers) => {
        this.providerOptions = this.adminScopeService.getEffectiveItems(providers);
      },
      error: (err) => {
        console.error('Error fetching provider names:', err);
        this.showErrorMessage('Error loading provider names');
      }
    });
  }

  private buildScopeLabelsMap(scopeLabels: ScopeLabelsResponse) {
    this.scopeLabelsMap = {};
    Object.entries(scopeLabels.scopeLabels).forEach(([type, labels]) => {
      (labels as any[]).forEach(label => {
        this.scopeLabelsMap[`${type}:${label.id}`] = label.label;
      });
    });
    this.models.forEach(model => {
      const key = `${model.scopeInfo.scopeType}:${model.scopeInfo.scopeId}`;
      if (!this.scopeLabelsMap[key]) {
        this.scopeLabelsMap[key] = this.adminScopeService.getScopeLabel(model.scopeInfo.scopeType, model.scopeInfo.scopeId);
      }
    });
  }

  // ========== モデル操作メソッド ==========

  createNew() {
    if (!this.canCreateModel()) {
      this.showErrorMessage('You do not have permission to create models');
      return;
    }
    this.resetFormState();
    this.isFormVisible = true;
    this.resetForm();
    if (this.selectedScope) {
      this.updateScopeInForm(this.selectedScope);
    }
    this.setFormReadOnly(false);
    this.setActiveTab('basic');
    this.cdr.markForCheck();
  }

  viewModel(model: AIModelEntityForView) {
    this.selectedModel = model;
    this.resetFormState();
    this.isViewOnlyMode = true;
    this.isFormVisible = true;
    this.loadModelToForm(model);
    this.setFormReadOnly(true);
    this.cdr.markForCheck();
  }

  editModel(model: AIModelEntityForView) {
    if (!this.isModelsOwnScope(model)) {
      this.showErrorMessage('You can only edit models in your own scope');
      return;
    }
    this.selectedModel = model;
    this.resetFormState();
    this.isEditMode = true;
    this.isFormVisible = true;
    this.loadModelToForm(model);
    this.setFormReadOnly(false);
    this.cdr.markForCheck();
  }

  startOverride(model: AIModelEntityForView, event?: Event) {
    if (event) event.stopPropagation();
    if (!this.canCreateModel()) {
      this.showErrorMessage('You do not have permission to create models');
      return;
    }
    if (this.isModelsOwnScope(model)) {
      this.editModel(model);
      return;
    }
    this.selectedModel = model;
    this.resetFormState();
    this.isOverrideMode = true;
    this.isFormVisible = true;
    this.prepareOverrideForm(model);
    this.setFormReadOnly(false);
    this.cdr.markForCheck();
  }

  switchToOverrideMode() {
    if (!this.selectedModel || !this.canCreateModel()) return;
    this.isViewOnlyMode = false;
    this.isOverrideMode = true;
    this.prepareOverrideForm(this.selectedModel);
    this.setFormReadOnly(false);
    this.cdr.markForCheck();
  }

  selectModel(model: AIModelEntityForView) {
    if (this.isModelsOwnScope(model) && this.canUserEditModel(model)) {
      this.editModel(model);
    } else {
      this.viewModel(model);
    }
  }

  duplicateModel(model: AIModelEntityForView, event?: Event) {
    if (event) event.stopPropagation();
    if (!this.canCreateModel()) {
      this.showErrorMessage('You do not have permission to create models');
      return;
    }
    this.selectedModel = model;
    this.resetFormState();
    this.isDuplicateMode = true;
    this.isFormVisible = true;
    this.initForm();
    this.loadModelToForm(model);
    this.form.patchValue({
      id: '',
      name: model.name + '_copy',
      providerModelId: model.providerModelId + '_copy',
      isActive: true,
    });
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;
    this.setFormReadOnly(false);
    this.updateCheckboxes();
    this.cdr.markForCheck();
  }

  // ========== フォーム関連ヘルパー ==========

  private resetFormState() {
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.isViewOnlyMode = false;
    this.isOverrideMode = false;
  }

  private loadModelToForm(model: AIModelEntityForView) {
    this.initForm();
    this.hasExistingPricing = model.pricingHistory && model.pricingHistory.length > 0;
    if (this.hasExistingPricing) {
      const latestPricing = model.pricingHistory[0];
      this.currentPricing = latestPricing;
      this.selectedPricingId = latestPricing.id;
      this.pricingHistory = [...model.pricingHistory];
      this.pricingHistory.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());
      this.selectExistingPricing(latestPricing);
    } else {
      this.currentPricing = null;
      this.selectedPricingId = undefined;
      this.pricingHistory = [];
      this.setPricingSelectionMode('new');
    }

    const knowledgeCutoff = model.knowledgeCutoff ? this.formatDateForInput(model.knowledgeCutoff) : '';
    const releaseDate = model.releaseDate ? this.formatDateForInput(model.releaseDate) : '';
    const deprecationDate = model.deprecationDate ? this.formatDateForInput(model.deprecationDate) : '';

    this.form.patchValue({
      id: model.id,
      providerNameList: model.providerNameList.filter(name => this.providerOptions.find(p => p.name === name)),
      providerModelId: model.providerModelId,
      name: model.name,
      aliases: model.aliases || [],
      shortName: model.shortName || '',
      throttleKey: model.throttleKey || '',
      status: model.status,
      description: model.description || '',
      modalities: model.modalities || [],
      maxContextTokens: model.maxContextTokens,
      maxOutputTokens: model.maxOutputTokens,
      inputFormats: model.inputFormats || [],
      outputFormats: model.outputFormats || [],
      defaultParameters: model.defaultParameters ? JSON.stringify(model.defaultParameters, null, 2) : '',
      capabilities: model.capabilities ? JSON.stringify(model.capabilities, null, 2) : '',
      metadata: model.metadata ? JSON.stringify(model.metadata, null, 2) : '',
      endpointTemplate: model.endpointTemplate || '',
      documentationUrl: model.documentationUrl || '',
      licenseType: model.licenseType || '',
      knowledgeCutoff: knowledgeCutoff,
      releaseDate: releaseDate,
      deprecationDate: deprecationDate,
      tags: model.tags || [],
      uiOrder: model.uiOrder || 0,
      isStream: model.isStream || false,
      isActive: model.isActive || false,
      scopeInfo: model.scopeInfo
    });
    this.updateCheckboxes();
  }

  private prepareOverrideForm(model: AIModelEntityForView) {
    this.initForm();
    this.loadModelToForm(model);
    this.form.patchValue({ id: '', isActive: true });
    if (this.selectedScope) {
      this.updateScopeInForm(this.selectedScope);
    }
  }

  getFormTitle(): string {
    if (this.isViewOnlyMode) return 'View Model';
    if (this.isOverrideMode) return 'Override Model';
    if (this.isDuplicateMode) return 'Duplicate Model';
    if (this.isEditMode) return 'Edit Model';
    return 'New Model';
  }

  closeForm(): void {
    this.isFormVisible = false;
    this.resetFormState();
    this.selectedModel = null;
    this.resetForm();
    this.cdr.markForCheck();
  }

  // ========== 保存・削除処理 ==========

  register() {
    if (this.isViewOnlyMode) return;
    if (this.form.invalid) {
      this.activateTabWithErrors();
      this.markFormGroupTouched(this.form);
      this.showErrorMessage('Please fix the validation errors');
      return;
    }

    try {
      const formValue = this.form.getRawValue();
      const scopeInfo = this.selectedScope;
      if (!scopeInfo) {
        this.showErrorMessage('No scope selected');
        return;
      }

      const isUpdate = formValue.id && this.isEditMode && !this.isOverrideMode;
      if (isUpdate) {
        if (!this.adminScopeService.canEditScope(scopeInfo.scopeType, scopeInfo.scopeId)) {
          this.showErrorMessage('You do not have permission to edit this model');
          return;
        }
      } else {
        if (!this.canCreateModel()) {
          this.showErrorMessage('You do not have permission to create models');
          return;
        }
      }

      const modelData: AIModelEntity & { aliases: string[] } = {
        ...genInitialBaseEntity(),
        id: isUpdate ? formValue.id : undefined,
        providerNameList: formValue.providerNameList,
        providerModelId: formValue.providerModelId,
        name: formValue.name,
        aliases: formValue.aliases || [],
        shortName: formValue.shortName || null,
        throttleKey: formValue.throttleKey || null,
        status: formValue.status,
        description: formValue.description || null,
        modalities: formValue.modalities,
        maxContextTokens: formValue.maxContextTokens,
        maxOutputTokens: formValue.maxOutputTokens,
        inputFormats: formValue.inputFormats?.length ? formValue.inputFormats : [],
        outputFormats: formValue.outputFormats?.length ? formValue.outputFormats : [],
        defaultParameters: this.parseJsonField(formValue.defaultParameters),
        capabilities: this.parseJsonField(formValue.capabilities),
        metadata: this.parseJsonField(formValue.metadata),
        endpointTemplate: formValue.endpointTemplate || undefined,
        documentationUrl: formValue.documentationUrl || undefined,
        licenseType: formValue.licenseType || undefined,
        knowledgeCutoff: formValue.knowledgeCutoff ? new Date(formValue.knowledgeCutoff) : null,
        releaseDate: formValue.releaseDate ? new Date(formValue.releaseDate) : null,
        deprecationDate: formValue.deprecationDate ? new Date(formValue.deprecationDate) : null,
        tags: formValue.tags || [],
        uiOrder: formValue.uiOrder || undefined,
        isStream: !!formValue.isStream,
        isActive: !!formValue.isActive,
        scopeInfo: scopeInfo,
      };

      const pricingData: Partial<ModelPricing> = {
        id: this.pricingSelectionMode === 'new' ? undefined : formValue.pricing?.id,
        modelId: formValue.id,
        name: formValue.name,
        scopeInfo: scopeInfo,
        inputPricePerUnit: formValue.pricing?.inputPricePerUnit || 0,
        outputPricePerUnit: formValue.pricing?.outputPricePerUnit || 0,
        unit: formValue.pricing?.unit || 'USD/1M tokens',
        validFrom: formValue.pricing?.validFrom ? new Date(formValue.pricing.validFrom) : new Date(),
      };

      const operationType = this.isOverrideMode ? 'override' : isUpdate ? 'update' : 'create';

      this.aiModelService.upsertAIModel(modelData).pipe(
        switchMap(savedModel => {
          if (savedModel) {
            pricingData.modelId = savedModel.id;
            if (this.pricingSelectionMode === 'new' || !this.isEditMode) {
              return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            } else if (this.pricingSelectionMode === 'edit' && this.isPricingChanged(pricingData)) {
              return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            }
          }
          return of(null);
        })
      ).subscribe({
        next: () => {
          const message = this.isOverrideMode ? 'Model override created' : operationType === 'create' ? 'Model created' : 'Model updated';
          this.showSuccessMessage(message);
          this.loadModels();
          this.closeForm();
        },
        error: (error) => {
          console.error(`Error ${operationType}ing model:`, error);
          this.showErrorMessage(`Error ${operationType}ing model`);
        }
      });
    } catch (error) {
      console.error('Error processing form data:', error);
      this.showErrorMessage('Error processing form data');
    }
  }

  deleteModel(id: string) {
    const model = this.models.find(m => m.id === id);
    if (!model) {
      this.showErrorMessage('Model not found');
      return;
    }
    if (!this.canUserEditModel(model)) {
      this.showErrorMessage('You do not have permission to delete this model');
      return;
    }

    if (confirm('Are you sure you want to delete this model?')) {
      this.aiModelPricingService.deletePricingByModelId(id).pipe(
        switchMap(() => this.aiModelService.deleteAIModel(id))
      ).subscribe({
        next: () => {
          this.showSuccessMessage('Model deleted');
          this.loadModels();
          if (this.form.value.id === id) this.closeForm();
        },
        error: (error) => {
          console.error('Error deleting model:', error);
          this.showErrorMessage('Failed to delete model');
        }
      });
    }
  }

  // ========== ユーティリティメソッド ==========

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

  private showSuccessMessage(message: string) {
    this.snackBar.open(message, 'Close', { duration: 3000 });
  }

  private showErrorMessage(message: string) {
    this.snackBar.open(message, 'Close', { duration: 3000, panelClass: 'error-snackbar' });
  }

  // ========== フォーム初期化と管理 ==========

  initForm() {
    const today = this.formatDateForInput(new Date());
    this.form = this.fb.group({
      id: [''],
      providerNameList: [[], Validators.required],
      providerModelId: ['', Validators.required],
      name: ['', Validators.required],
      aliases: [[]],
      shortName: ['', Validators.required],
      throttleKey: ['', Validators.required],
      status: [AIModelStatus.ACTIVE, Validators.required],
      description: [''],
      modalities: [[Modality.TEXT], Validators.required],
      maxContextTokens: [0, [Validators.required, Validators.min(0)]],
      maxOutputTokens: [0, [Validators.required, Validators.min(0)]],
      inputFormats: [[Modality.TEXT]],
      outputFormats: [[Modality.TEXT]],
      defaultParameters: [''],
      capabilities: [''],
      metadata: [''],
      endpointTemplate: [''],
      documentationUrl: [''],
      licenseType: [''],
      knowledgeCutoff: [''],
      releaseDate: [''],
      deprecationDate: [''],
      tags: [[]],
      uiOrder: [0],
      isStream: [true],
      isActive: [true],
      scopeInfo: this.fb.group({
        scopeType: ['', Validators.required],
        scopeId: ['', Validators.required]
      }),
      pricing: this.fb.group({
        id: [''],
        modelId: [''],
        inputPricePerUnit: [0.00, [Validators.required, Validators.min(0)]],
        outputPricePerUnit: [0.00, [Validators.required, Validators.min(0)]],
        unit: ['USD/1M tokens', Validators.required],
        validFrom: [today, Validators.required]
      })
    });
  }

  resetForm() {
    this.form.reset({
      id: '',
      providerNameList: [],
      providerModelId: '',
      name: '',
      aliases: [],
      shortName: '',
      throttleKey: '',
      status: AIModelStatus.ACTIVE,
      description: '',
      modalities: [Modality.TEXT],
      maxContextTokens: 0,
      maxOutputTokens: 0,
      inputFormats: [Modality.TEXT],
      outputFormats: [Modality.TEXT],
      defaultParameters: '',
      capabilities: '',
      metadata: '',
      endpointTemplate: '',
      documentationUrl: '',
      licenseType: '',
      knowledgeCutoff: '',
      releaseDate: '',
      deprecationDate: '',
      tags: [],
      uiOrder: 0,
      isStream: true,
      isActive: true,
      scopeInfo: { scopeType: '', scopeId: '' },
      pricing: {
        id: '',
        modelId: '',
        inputPricePerUnit: 0.00,
        outputPricePerUnit: 0.00,
        unit: 'USD/1M tokens',
        validFrom: this.formatDateForInput(new Date())
      }
    });
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;
  }

  setActiveTab(tabName: string) {
    this.activeTab = tabName;
  }

  // ========== JSON Field Parser ==========

  private parseJsonField(value: string): Record<string, any> {
    if (!value || value.trim() === '') return {};
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  // ========== タグ管理 ==========

  private loadTags() {
    const tagSubscription = this.tagService.getTags().subscribe({
      next: (tags) => {
        this.availableTagEntities = tags;
        this.filteredTags = tags;
      },
      error: (err) => {
        console.error('Error loading tags:', err);
        this.showErrorMessage('Error loading tags');
      }
    });
    this.subscriptions.add(tagSubscription);
  }

  openTagManagement() {
    const dialogRef = this.dialog.open(TagManagementDialogComponent, {
      width: '800px',
      maxHeight: '80vh',
      data: { tags: this.availableTags }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadTags();
    });
  }

  openImportExportDialog() {
    const dialogData: ImportExportDialogData = {
      mode: 'both',
      dataType: 'models',
      scopeInfo: this.selectedScope,
      models: this.models,
      providers: this.providerOptions,
    };

    const dialogRef = this.dialog.open(ImportExportDialogComponent, {
      width: '600px',
      maxHeight: '80vh',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result: ImportExportDialogResult) => {
      if (result?.action === 'imported') {
        // インポート後にデータをリロード
        this.loadModels();
        this.snackBar.open(
          `Imported ${result.importedModels || 0} models`,
          'Close',
          { duration: 3000 }
        );
      }
    });
  }

  filterTags(query: string): TagEntity[] {
    if (!query) return this.availableTagEntities;
    const filterValue = query.toLowerCase();
    return this.availableTagEntities.filter(tag =>
      tag.name.toLowerCase().includes(filterValue) ||
      (tag.label && tag.label.toLowerCase().includes(filterValue))
    );
  }

  getTagDisplayName(tagName: string): string {
    const tag = this.availableTagEntities.find(t => t.name === tagName);
    return tag?.label || tagName;
  }

  getTagDisplayNames(tagNames: string[]): string {
    return tagNames.map(t => this.getTagDisplayName(t)).join(', ');
  }

  getTagColor(tagName: string): string | undefined {
    const tag = this.availableTagEntities.find(t => t.name === tagName);
    return tag?.color;
  }

  getScopeShortLabel(scopeInfo: { scopeType: string; scopeId: string }): string {
    const label = this.scopeLabelsMap[`${scopeInfo.scopeType}:${scopeInfo.scopeId}`];
    if (label) {
      // Return first 6 chars with ellipsis if longer
      return label.length > 6 ? label.slice(0, 6) + '…' : label;
    }
    // Fallback: first letter of scopeType + first 4 chars of scopeId
    return scopeInfo.scopeType.charAt(0).toUpperCase() + ':' + scopeInfo.scopeId.slice(0, 4);
  }

  // ========== チェックボックス管理 ==========

  onCheckboxChange(event: Event, fieldName: string) {
    const checkbox = event.target as HTMLInputElement;
    const value = checkbox.value;
    const isChecked = checkbox.checked;
    const values = this.form.get(fieldName)?.value as string[] || [];

    if (isChecked && !values.includes(value)) {
      values.push(value);
    } else if (!isChecked && values.includes(value)) {
      const index = values.indexOf(value);
      values.splice(index, 1);
    }
    this.form.get(fieldName)?.setValue(values);
  }

  updateCheckboxes() {
    setTimeout(() => {
      this.updateCheckboxField('modalities');
      this.updateCheckboxField('inputFormats');
      this.updateCheckboxField('outputFormats');
    });
  }

  isChecked(fieldName: string, value: string): boolean {
    const values = this.form.get(fieldName)?.value as string[] || [];
    return values.includes(value);
  }

  updateCheckboxField(fieldName: string) {
    const values = this.form.get(fieldName)?.value as string[] || [];
    this.modalityOptions.forEach(option => {
      const selector = `input[type="checkbox"][value="${option}"]`;
      const allCheckboxes = document.querySelectorAll(selector);
      allCheckboxes.forEach(cb => {
        const checkbox = cb as HTMLInputElement;
        let parent = checkbox.parentElement;
        while (parent && !parent.textContent?.includes(fieldName) && parent.tagName !== 'FORM') {
          parent = parent.parentElement;
        }
        if (parent && parent.textContent?.includes(fieldName)) {
          checkbox.checked = values.includes(option);
        }
      });
    });
  }

  // ========== バリデーション関連 ==========

  activateTabWithErrors() {
    const tabFields = {
      'basic': ['providerNameList', 'providerModelId', 'name', 'shortName', 'throttleKey', 'status'],
      'capabilities': ['modalities', 'maxContextTokens', 'maxOutputTokens'],
      'pricing': ['pricing.inputPricePerUnit', 'pricing.outputPricePerUnit', 'pricing.unit', 'pricing.validFrom'],
      'advanced': ['endpointTemplate', 'documentationUrl', 'licenseType', 'releaseDate', 'knowledgeCutoff', 'deprecationDate', 'tags', 'uiOrder', 'metadata']
    };

    for (const [tab, fields] of Object.entries(tabFields)) {
      for (const field of fields) {
        if (field.includes('.')) {
          if (this.hasNestedError(field)) { this.setActiveTab(tab); return; }
        } else {
          if (this.hasError(field)) { this.setActiveTab(tab); return; }
        }
      }
    }
  }

  hasNestedError(path: string): boolean {
    const parts = path.split('.');
    if (parts.length !== 2) return false;
    const group = this.form.get(parts[0]) as FormGroup;
    if (!group) return false;
    const control = group.get(parts[1]);
    return !!control?.invalid && !!control?.touched;
  }

  getNestedErrorMessage(path: string): string {
    const parts = path.split('.');
    if (parts.length !== 2) return '';
    const group = this.form.get(parts[0]) as FormGroup;
    if (!group) return '';
    const control = group.get(parts[1]);
    if (!control) return '';
    if (control.errors?.['required']) return 'This field is required';
    if (control.errors?.['min']) return 'Value must be >= 0';
    if (control.errors?.['invalidJson']) return 'Invalid JSON format';
    return '';
  }

  formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString(this.g.lang);
  }

  formatDateForInput(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control) return '';
    if (control.errors?.['required']) return 'This field is required';
    if (control.errors?.['min']) return 'Value must be >= 0';
    if (control.errors?.['invalidJson']) return 'Invalid JSON format';
    return '';
  }

  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control?.invalid && !!control?.touched;
  }

  // ========== 価格情報管理 ==========

  setPricingSelectionMode(mode: 'new' | 'edit') {
    this.pricingSelectionMode = mode;
    if (mode === 'new') {
      const today = this.formatDateForInput(new Date());
      const pricingForm = this.form.get('pricing');
      if (pricingForm) {
        pricingForm.patchValue({
          id: '',
          modelId: this.form.get('id')?.value || '',
          inputPricePerUnit: 0.00,
          outputPricePerUnit: 0.00,
          unit: 'USD/1M tokens',
          validFrom: today
        });
      }
      this.selectedPricingId = undefined;
    } else if (mode === 'edit') {
      const selectedPricing = this.pricingHistory.find(p => p.id === this.selectedPricingId);
      if (selectedPricing) {
        const pricingForm = this.form.get('pricing');
        if (pricingForm) {
          pricingForm.patchValue({
            id: selectedPricing.id,
            modelId: selectedPricing.modelId,
            inputPricePerUnit: selectedPricing.inputPricePerUnit,
            outputPricePerUnit: selectedPricing.outputPricePerUnit,
            unit: selectedPricing.unit,
            validFrom: this.formatDateForInput(selectedPricing.validFrom)
          });
        }
      }
    }
  }

  selectExistingPricing(pricing: ModelPricing) {
    this.pricingSelectionMode = 'edit';
    this.selectedPricingId = pricing.id;
    const pricingForm = this.form.get('pricing');
    if (pricingForm) {
      pricingForm.patchValue({
        id: pricing.id,
        modelId: pricing.modelId,
        inputPricePerUnit: pricing.inputPricePerUnit,
        outputPricePerUnit: pricing.outputPricePerUnit,
        unit: pricing.unit,
        validFrom: this.formatDateForInput(pricing.validFrom)
      });
    }
  }

  isCurrentPricing(pricing: ModelPricing): boolean {
    if (!this.currentPricing) return false;
    return pricing.id === this.currentPricing.id;
  }

  isPricingChanged(newPricing: Partial<ModelPricing>): boolean {
    const selectedPricing = this.pricingHistory.find(p => p.id === this.selectedPricingId);
    if (!selectedPricing) return true;
    return selectedPricing.inputPricePerUnit.toString() !== (newPricing.inputPricePerUnit?.toString() || '') ||
      selectedPricing.outputPricePerUnit.toString() !== (newPricing.outputPricePerUnit?.toString() || '') ||
      selectedPricing.unit !== newPricing.unit ||
      this.formatDateForInput(selectedPricing.validFrom) !== this.formatDateForInput(newPricing.validFrom as Date);
  }

  // ========== チップ入力関連 ==========

  addReactiveKeyword(fieldName: string, event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      const control = this.form.get(fieldName);
      if (control) {
        const currentArray = control.value || [];
        if (!currentArray.includes(value)) {
          control.setValue([...currentArray, value]);
        }
      }
    }
    event.chipInput!.clear();
  }

  removeReactiveKeyword(fieldName: string, keyword: string): void {
    const control = this.form.get(fieldName);
    if (control) {
      const currentArray = control.value || [];
      const index = currentArray.indexOf(keyword);
      if (index >= 0) {
        currentArray.splice(index, 1);
        control.setValue([...currentArray]);
      }
    }
  }

  autocompleteSelect(fieldName: string, event: any): void {
    const tagName = event.option.value;
    const control = this.form.get(fieldName);
    if (control && tagName) {
      const currentArray = control.value || [];
      if (!currentArray.includes(tagName)) {
        control.setValue([...currentArray, tagName]);
      }
    }
  }

  // ========== フィルター・ソート関連 ==========

  applyFilters(): void {
    let filtered = [...this.models];
    const search = (this.filterValues['search'] || '').toLowerCase().trim();
    const providerFilter = this.filterValues['provider'] || [];
    const tagFilter = this.filterValues['tag'] || [];
    const statusFilter = this.filterValues['status'];

    if (search) {
      filtered = filtered.filter(model =>
        model.name.toLowerCase().includes(search) ||
        model.providerModelId.toLowerCase().includes(search) ||
        model.providerNameList.some(p => p.toLowerCase().includes(search)) ||
        (model.description && model.description.toLowerCase().includes(search))
      );
    }

    if (providerFilter.length > 0) {
      filtered = filtered.filter(model => model.providerNameList.some(p => providerFilter.includes(p)));
    }

    if (statusFilter !== '' && statusFilter !== undefined) {
      const isActive = statusFilter === 'true';
      filtered = filtered.filter(model => model.isActive === isActive);
    }

    if (tagFilter.length > 0) {
      filtered = filtered.filter(model => model.tags && model.tags.some(tag => tagFilter.includes(tag)));
    }

    this.filteredModels = filtered;
    this.applySorting();
    this.cdr.markForCheck();
  }

  applySorting(): void {
    const indexedModels = this.filteredModels.map((model, index) => ({ model, index }));
    const column = this.sortState.column;
    const direction = this.sortState.direction;

    indexedModels.sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (column) {
        case null:
        case '':
          const releaseDateA = a.model.releaseDate ? new Date(a.model.releaseDate).getTime() : 0;
          const releaseDateB = b.model.releaseDate ? new Date(b.model.releaseDate).getTime() : 0;
          if (releaseDateA !== releaseDateB) return releaseDateB - releaseDateA;
          return a.model.name.localeCompare(b.model.name);
        case 'name':
          valueA = a.model.name;
          valueB = b.model.name;
          break;
        case 'scope':
          valueA = `${a.model.scopeInfo.scopeType}:${a.model.scopeInfo.scopeId}`;
          valueB = `${b.model.scopeInfo.scopeType}:${b.model.scopeInfo.scopeId}`;
          break;
        case 'context':
          valueA = a.model.maxContextTokens || 0;
          valueB = b.model.maxContextTokens || 0;
          break;
        case 'price':
          valueA = a.model.pricingHistory?.[0]?.inputPricePerUnit || 0;
          valueB = b.model.pricingHistory?.[0]?.inputPricePerUnit || 0;
          break;
        case 'releaseDate':
          valueA = a.model.releaseDate ? new Date(a.model.releaseDate).getTime() : 0;
          valueB = b.model.releaseDate ? new Date(b.model.releaseDate).getTime() : 0;
          break;
        case 'status':
          valueA = a.model.isActive ? 1 : 0;
          valueB = b.model.isActive ? 1 : 0;
          break;
        default:
          return a.index - b.index;
      }

      if (valueA === valueB) return a.index - b.index;
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        const result = valueA.localeCompare(valueB);
        return direction === 'asc' ? result : -result;
      } else {
        const result = valueA - valueB;
        return direction === 'asc' ? result : -result;
      }
    });

    this.filteredModels = indexedModels.map(item => item.model);
  }

  // ========== 一括操作 ==========

  canBulkEdit(): boolean {
    return this.selectedIds.size > 0 && Array.from(this.selectedIds).every(id => {
      const model = this.models.find(m => m.id === id);
      return model && this.isModelsOwnScope(model);
    });
  }

  bulkToggleStatus(isActive: boolean): void {
    if (!this.canBulkEdit()) return;
    const action = isActive ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${action} ${this.selectedIds.size} models?`)) return;

    const updateObservables = Array.from(this.selectedIds).map(id => {
      const model = this.models.find(m => m.id === id);
      if (model && this.isModelsOwnScope(model)) {
        return this.aiModelService.upsertAIModel({ ...model, isActive });
      }
      return of(null);
    }).filter(obs => obs !== null);

    if (updateObservables.length === 0) {
      this.snackBar.open('No models to update', 'Close', { duration: 3000 });
      return;
    }

    forkJoin(updateObservables).subscribe({
      next: () => {
        this.snackBar.open(`${updateObservables.length} models ${isActive ? 'activated' : 'deactivated'}`, 'Close', { duration: 3000 });
        this.selectedIds = new Set();
        this.loadModels();
      },
      error: (error) => {
        console.error('Bulk update failed:', error);
        this.snackBar.open('Bulk update failed', 'Close', { duration: 3000 });
      }
    });
  }

  openBulkTagDialog(): void {
    if (!this.canBulkEdit()) return;
    const dialogRef = this.dialog.open(BulkTagDialogComponent, {
      width: '600px',
      data: { selectedModels: Array.from(this.selectedIds), availableTags: this.availableTagEntities, models: this.models }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && result.tags) this.bulkAddTags(result.tags);
    });
  }

  openBulkProviderDialog(): void {
    if (!this.canBulkEdit()) return;
    const dialogRef = this.dialog.open(BulkProviderDialogComponent, {
      width: '600px',
      data: { selectedModels: Array.from(this.selectedIds), availableProviders: this.providerOptions, models: this.models }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && result.providers) this.bulkSetProviders(result.providers);
    });
  }

  bulkAddTags(tags: string[]): void {
    if (!this.canBulkEdit() || !tags.length) return;
    const updateObservables = Array.from(this.selectedIds).map(id => {
      const model = this.models.find(m => m.id === id);
      if (model && this.isModelsOwnScope(model)) {
        const newTags = [...new Set([...(model.tags || []), ...tags])];
        return this.aiModelService.upsertAIModel({ ...model, tags: newTags });
      }
      return of(null);
    }).filter(obs => obs !== null);

    if (updateObservables.length === 0) return;
    forkJoin(updateObservables).subscribe({
      next: () => {
        this.snackBar.open(`Tags added to ${updateObservables.length} models`, 'Close', { duration: 3000 });
        this.selectedIds = new Set();
        this.loadModels();
      },
      error: () => this.snackBar.open('Bulk tag update failed', 'Close', { duration: 3000 })
    });
  }

  bulkSetProviders(providers: string[]): void {
    if (!this.canBulkEdit() || !providers.length) return;
    const updateObservables = Array.from(this.selectedIds).map(id => {
      const model = this.models.find(m => m.id === id);
      if (model && this.isModelsOwnScope(model)) {
        return this.aiModelService.upsertAIModel({ ...model, providerNameList: providers });
      }
      return of(null);
    }).filter(obs => obs !== null);

    if (updateObservables.length === 0) return;
    forkJoin(updateObservables).subscribe({
      next: () => {
        this.snackBar.open(`Providers updated for ${updateObservables.length} models`, 'Close', { duration: 3000 });
        this.selectedIds = new Set();
        this.loadModels();
      },
      error: () => this.snackBar.open('Bulk provider update failed', 'Close', { duration: 3000 })
    });
  }

  private updateAvailableProviders(): void {
    const providers = new Set<string>();
    this.models.forEach(model => model.providerNameList.forEach(provider => providers.add(provider)));
    this.availableProviders = Array.from(providers).sort();
  }

  private updateAvailableTags(): void {
    const tags = new Set<string>();
    this.models.forEach(model => {
      if (model.tags) model.tags.forEach(tag => tags.add(tag));
    });
    this.availableTags = Array.from(tags).sort();
  }

  private updateFilteredModels(): void {
    this.filteredModels = [...this.models];
    this.updateAvailableProviders();
    this.updateAvailableTags();
    this.updateFilterOptions();
    this.applyFilters();
  }

  // ========== Cell Value Formatters (for template usage) ==========

  formatNumber(value: number): string {
    return this.decimalPipe.transform(value) || '';
  }

  formatPrice(price: number): string {
    return this.decimalPipe.transform(price, '0.2-2') || '';
  }
}
