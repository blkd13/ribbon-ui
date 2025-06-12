// ai-model-management.component.ts - Enhanced version with scope management

import { LiveAnnouncer } from '@angular/cdk/a11y';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValueChangeEvent } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AIModelManagerService, AIModelPricingService, ModelPricing, AIModelEntity, AIModelStatus, AIProviderType, Modality, AIModelEntityForView, AIProviderManagerService, AIProviderEntity, ScopeInfo, ScopeType } from '../../../../services/model-manager.service';
import { forkJoin, of } from 'rxjs';
import { map, catchError, switchMap, tap } from 'rxjs/operators';
import { genInitialBaseEntity } from '../../../../services/project.service';
import { JsonEditorComponent } from "../../../../parts/json-editor/json-editor.component";
import { TrimTrailingZerosPipe } from '../../../../pipe/trim-trailing-zeros.pipe';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteActivatedEvent, MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminScopeService } from '../../../../services/admin-scope.service';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TagService, TagEntity } from '../../../../services/model-manager.service';
import { TagManagementDialogComponent } from '../tag-management-dialog/tag-management-dialog.component';
import { AuthService, ScopeLabels, ScopeLabelsResponse } from '../../../../services/auth.service';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-ai-model-management',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatIconModule,
    MatButtonModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatChipsModule,
    MatTooltipModule,
    MatSelectModule,
    MatDialogModule,
    MatCardModule,
    JsonEditorComponent,
    TrimTrailingZerosPipe,
  ],
  templateUrl: './ai-model-management.component.html',
  styleUrl: './ai-model-management.component.scss'
})
export class AIModelManagementComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  private fb: FormBuilder = inject(FormBuilder);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  private readonly adminScopeService = inject(AdminScopeService);
  readonly announcer = inject(LiveAnnouncer);
  readonly dialog = inject(MatDialog);

  readonly separatorKeysCodes = [ENTER, COMMA] as const;
  readonly aiProviderService: AIProviderManagerService = inject(AIProviderManagerService);
  readonly aiModelService: AIModelManagerService = inject(AIModelManagerService);
  readonly aiModelPricingService: AIModelPricingService = inject(AIModelPricingService);
  readonly tagService = inject(TagService);
  readonly authService = inject(AuthService);

  models: AIModelEntityForView[] = [];
  selectedModel: AIModelEntityForView | null = null;

  // Subscriptions
  private subscriptions = new Subscription();

  // Selected scope from admin
  selectedScope: ScopeInfo | null = null;

  // 表示状態管理
  isFormVisible = false;
  isEditMode = false;
  isDuplicateMode = false;
  isViewOnlyMode = false;
  isOverrideMode = false;
  activeTab = 'basic';

  // 価格情報管理
  currentPricing: ModelPricing | null = null;
  pricingHistory: ModelPricing[] = [];
  hasExistingPricing = false;

  // ドロップダウンオプション
  providerOptions: AIProviderEntity[] = [];
  statusOptions = Object.values(AIModelStatus);
  modalityOptions = Object.values(Modality);

  // 価格情報の選択モード管理
  pricingSelectionMode: 'new' | 'edit' = 'new';
  selectedPricingId: string | undefined = undefined;

  // タグ関連
  availableTags: TagEntity[] = [];
  filteredTags: TagEntity[] = [];

  // Scope management
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

  // ===== スコープ関連メソッド =====

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

  getScopeLabel(scope: ScopeInfo): string {
    const key = `${scope.scopeType}:${scope.scopeId}`;
    return this.scopeLabelsMap[key] || scope.scopeId;
  }

  getScopeDisplayName(scope: ScopeInfo): string {
    return `${this.getScopeTypeLabel(scope.scopeType)}: ${this.getScopeLabel(scope)}`;
  }

  // ===== 権限チェック =====

  canCreateModel(): boolean {
    return this.adminScopeService.canCreateAIProvider(); // Same permission as AI Provider
  }

  canUserEditModel(model: AIModelEntityForView): boolean {
    return this.adminScopeService.canEditScope(
      model.scopeInfo.scopeType,
      model.scopeInfo.scopeId
    );
  }

  isModelsOwnScope(model: AIModelEntityForView): boolean {
    const currentScope = this.selectedScope;
    if (!currentScope) return false;

    return model.scopeInfo.scopeType === currentScope.scopeType &&
      model.scopeInfo.scopeId === currentScope.scopeId;
  }

  // ===== UIヘルパーメソッド =====

  shouldShowEditButton(model: AIModelEntityForView): boolean {
    return this.canUserEditModel(model) && this.isModelsOwnScope(model);
  }

  shouldShowViewButton(model: AIModelEntityForView): boolean {
    return !this.isModelsOwnScope(model);
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

  // ===== データ読み込み =====

  private loadModels() {
    this.authService.getScopeLabels().subscribe(scopeLabels => {
      this.scopeLabels = scopeLabels;
      this.buildScopeLabelsMap(scopeLabels);
    });

    this.aiModelService.getAIModels(true).subscribe({
      next: (allModels) => {
        const visibleModels = this.adminScopeService.getVisibleProviders(allModels);
        this.models = this.adminScopeService.getEffectiveItems(visibleModels);
      },
      error: (err) => {
        console.error('Error loading models:', err);
        this.showErrorMessage('Error loading models');
      }
    });
  }

  loadData() {
    // Load providers for dropdown
    this.aiProviderService.getProviders().subscribe({
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
        this.scopeLabelsMap[key] = this.adminScopeService.getScopeLabel(
          model.scopeInfo.scopeType,
          model.scopeInfo.scopeId
        );
      }
    });
  }

  // ===== モデル操作メソッド =====

  createNew() {
    if (!this.canCreateModel()) {
      this.showErrorMessage('You do not have permission to create models in the current scope');
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
  }

  viewModel(model: AIModelEntityForView) {
    this.selectedModel = model;
    this.resetFormState();
    this.isViewOnlyMode = true;
    this.isFormVisible = true;

    this.loadModelToForm(model);
    this.setFormReadOnly(true);
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
  }

  startOverride(model: AIModelEntityForView, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    if (!this.canCreateModel()) {
      this.showErrorMessage('You do not have permission to create models in the current scope');
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
  }

  switchToOverrideMode() {
    if (!this.selectedModel || !this.canCreateModel()) {
      return;
    }

    this.isViewOnlyMode = false;
    this.isOverrideMode = true;
    this.prepareOverrideForm(this.selectedModel);
    this.setFormReadOnly(false);
  }

  selectModel(model: AIModelEntityForView) {
    // Determine the appropriate action based on permissions
    if (this.isModelsOwnScope(model) && this.canUserEditModel(model)) {
      this.editModel(model);
    } else {
      this.viewModel(model);
    }
  }

  duplicateModel(model: AIModelEntityForView, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    if (!this.canCreateModel()) {
      this.showErrorMessage('You do not have permission to create models in the current scope');
      return;
    }

    this.selectedModel = model;
    this.resetFormState();
    this.isDuplicateMode = true;
    this.isFormVisible = true;

    this.initForm();
    this.loadModelToForm(model);

    // Clear ID and modify name for duplication
    this.form.patchValue({
      id: '',
      name: model.name + '_copy',
      providerModelId: model.providerModelId + '_copy',
      isActive: true,
    });

    // Clear pricing information for new model
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;

    this.setFormReadOnly(false);
    this.updateCheckboxes();
  }

  // ===== フォーム関連ヘルパー =====

  private resetFormState() {
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.isViewOnlyMode = false;
    this.isOverrideMode = false;
  }

  private loadModelToForm(model: AIModelEntityForView) {
    this.initForm();

    // Load pricing information
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

    // Format dates
    const knowledgeCutoff = model.knowledgeCutoff ? this.formatDateForInput(model.knowledgeCutoff) : '';
    const releaseDate = model.releaseDate ? this.formatDateForInput(model.releaseDate) : '';
    const deprecationDate = model.deprecationDate ? this.formatDateForInput(model.deprecationDate) : '';

    // Set form values
    this.form.patchValue({
      id: model.id,
      providerNameList: model.providerNameList.filter(name => this.providerOptions.find(provider => provider.name === name)),
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
      defaultParameters: model.defaultParameters || {},
      capabilities: model.capabilities || {},
      metadata: model.metadata || {},
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

    // Clear ID for new model creation
    this.form.patchValue({
      id: '',
      isActive: true,
    });

    // Use selected scope for override
    if (this.selectedScope) {
      this.updateScopeInForm(this.selectedScope);
    }
  }

  getFormTitle(): string {
    if (this.isViewOnlyMode) {
      return 'View Model';
    } else if (this.isOverrideMode) {
      return `Override Model`;
    } else if (this.isDuplicateMode) {
      return 'Duplicate Model';
    } else if (this.isEditMode) {
      return 'Edit Model';
    } else {
      return 'New Model';
    }
  }

  closeForm(): void {
    this.isFormVisible = false;
    this.resetFormState();
    this.selectedModel = null;
    this.resetForm();
  }

  // ===== 保存・削除処理 =====

  register() {
    if (this.isViewOnlyMode) {
      return;
    }

    if (this.form.invalid) {
      this.activateTabWithErrors();
      this.markFormGroupTouched(this.form);
      this.showErrorMessage('Please fix the validation errors');
      return;
    }

    try {
      const formValue = this.form.getRawValue(); // disabled フィールドも含めて取得

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
          this.showErrorMessage('You do not have permission to create models in the current scope');
          return;
        }
      }

      // Build model data
      const knowledgeCutoff = formValue.knowledgeCutoff ? new Date(formValue.knowledgeCutoff) : null;
      const releaseDate = formValue.releaseDate ? new Date(formValue.releaseDate) : null;
      const deprecationDate = formValue.deprecationDate ? new Date(formValue.deprecationDate) : null;

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
        defaultParameters: formValue.defaultParameters,
        capabilities: formValue.capabilities,
        metadata: formValue.metadata,
        endpointTemplate: formValue.endpointTemplate || undefined,
        documentationUrl: formValue.documentationUrl || undefined,
        licenseType: formValue.licenseType || undefined,
        knowledgeCutoff: knowledgeCutoff,
        releaseDate: releaseDate,
        deprecationDate: deprecationDate,
        tags: formValue.tags || [],
        uiOrder: formValue.uiOrder || undefined,
        isStream: !!formValue.isStream,
        isActive: !!formValue.isActive,
        scopeInfo: scopeInfo,
      };

      // Build pricing data
      const pricingData: Partial<ModelPricing> = {
        id: this.pricingSelectionMode === 'new' ? undefined : formValue.pricing?.id,
        modelId: formValue.id,
        inputPricePerUnit: formValue.pricing?.inputPricePerUnit || 0,
        outputPricePerUnit: formValue.pricing?.outputPricePerUnit || 0,
        unit: formValue.pricing?.unit || 'USD/1M tokens',
        validFrom: formValue.pricing?.validFrom ? new Date(formValue.pricing.validFrom) : new Date(),
      };

      const operationType = this.isOverrideMode
        ? 'override'
        : isUpdate
          ? 'update'
          : 'create';

      // Save model and pricing
      this.aiModelService.upsertAIModel(modelData).pipe(
        switchMap(savedModel => {
          if (savedModel) {
            pricingData.modelId = savedModel.id;

            // if (this.pricingSelectionMode === 'new' || !this.isEditMode) {
            //   return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            // } else if (this.pricingSelectionMode === 'edit' && this.isPricingChanged(pricingData)) {
            //   return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            // } else {
            //   return of(null);
            // }
            return of(null);
          } else {
            return of(null);
          }
        })
      ).subscribe({
        next: () => {
          const message = this.isOverrideMode
            ? 'Model override created successfully'
            : operationType === 'create'
              ? 'Model created successfully'
              : 'Model updated successfully';

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

    if (confirm('Are you sure you want to delete this model and its pricing information?')) {
      this.aiModelPricingService.deletePricingByModelId(id).pipe(
        switchMap(() => this.aiModelService.deleteAIModel(id))
      ).subscribe({
        next: () => {
          this.showSuccessMessage('Model deleted successfully');
          this.loadModels();

          if (this.form.value.id === id) {
            this.closeForm();
          }
        },
        error: (error) => {
          console.error('Error deleting model:', error);
          this.showErrorMessage('Failed to delete model');
        }
      });
    }
  }

  // ===== ユーティリティメソッド =====

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
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: 'error-snackbar'
    });
  }

  // ===== フォーム初期化と管理 =====

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
      defaultParameters: [{}],
      capabilities: [{}],
      metadata: [{}],
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
      defaultParameters: {},
      capabilities: {},
      metadata: {},
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
      scopeInfo: {
        scopeType: '',
        scopeId: ''
      },
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

  // ===== タグ管理 =====

  private loadTags() {
    const tagSubscription = this.tagService.getTags().subscribe({
      next: (tags) => {
        this.availableTags = tags;
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
      if (result) {
        this.loadTags();
      }
    });
  }

  filterTags(query: string): TagEntity[] {
    if (!query) {
      return this.availableTags;
    }
    const filterValue = query.toLowerCase();
    return this.availableTags.filter(tag =>
      tag.name.toLowerCase().includes(filterValue) ||
      (tag.label && tag.label.toLowerCase().includes(filterValue))
    );
  }

  getTagDisplayName(tagName: string): string {
    const tag = this.availableTags.find(t => t.name === tagName);
    return tag?.label || tagName;
  }

  getTagColor(tagName: string): string | undefined {
    const tag = this.availableTags.find(t => t.name === tagName);
    return tag?.color;
  }

  // ===== チェックボックス管理 =====

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

  // ===== バリデーション関連 =====

  activateTabWithErrors() {
    const tabFields = {
      'basic': ['providerNameList', 'providerModelId', 'name', 'aliases', 'shortName', 'throttleKey', 'status', 'description', 'isStream', 'isActive'],
      'capabilities': ['modalities', 'maxContextTokens', 'maxOutputTokens', 'inputFormats', 'outputFormats', 'defaultParameters', 'capabilities'],
      'pricing': ['pricing.inputPricePerUnit', 'pricing.outputPricePerUnit', 'pricing.unit', 'pricing.validFrom'],
      'advanced': ['endpointTemplate', 'documentationUrl', 'licenseType', 'releaseDate', 'knowledgeCutoff', 'deprecationDate', 'tags', 'uiOrder', 'metadata']
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

    if (control.errors?.['required']) {
      return 'This field is required';
    }
    if (control.errors?.['min']) {
      return 'Value must be greater than or equal to 0';
    }
    if (control.errors?.['invalidJson']) {
      return 'Invalid JSON format';
    }
    return '';
  }

  // ===== 日付関連ユーティリティ =====

  formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString();
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

    if (control.errors?.['required']) {
      return 'This field is required';
    }
    if (control.errors?.['min']) {
      return 'Value must be greater than or equal to 0';
    }
    if (control.errors?.['invalidJson']) {
      return 'Invalid JSON format';
    }
    return '';
  }

  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control?.invalid && !!control?.touched;
  }

  // ===== 価格情報管理 =====

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

    const currentInput = selectedPricing.inputPricePerUnit.toString();
    const newInput = newPricing.inputPricePerUnit?.toString() || '';

    const currentOutput = selectedPricing.outputPricePerUnit.toString();
    const newOutput = newPricing.outputPricePerUnit?.toString() || '';

    return currentInput !== newInput ||
      currentOutput !== newOutput ||
      selectedPricing.unit !== newPricing.unit ||
      this.formatDateForInput(selectedPricing.validFrom) !== this.formatDateForInput(newPricing.validFrom as Date);
  }

  // ===== チップ入力関連 =====

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
}