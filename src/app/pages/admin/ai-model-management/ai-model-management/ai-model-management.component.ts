import { LiveAnnouncer } from '@angular/cdk/a11y';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValueChangeEvent } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { AIModelManagerService, AIModelPricingService, ModelPricing, AIModelEntity, AIModelStatus, AIProviderType, Modality, AIModelEntityForView, AIProviderManagerService, AIProviderEntity, ScopeInfo } from '../../../../services/model-manager.service';
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

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  readonly aiProviderService: AIProviderManagerService = inject(AIProviderManagerService);
  readonly aiModelService: AIModelManagerService = inject(AIModelManagerService);
  readonly aiModelPricingService: AIModelPricingService = inject(AIModelPricingService);

  models: AIModelEntityForView[] = [];

  // Subscriptions
  private subscriptions = new Subscription();

  // Selected scope from admin
  selectedScope: ScopeInfo | null = null;

  // 表示状態管理
  isFormVisible = false;
  isEditMode = false;
  isDuplicateMode = false; // 複製モードフラグを追加
  activeTab = 'basic'; // basic, capabilities, pricing, advanced

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

  constructor() {
    this.loadData();
  }
  ngOnInit() {
    this.initForm();

    // Subscribe to selected scope changes
    const scopeSubscription = this.adminScopeService.selectedScope$.subscribe(scope => {
      this.selectedScope = scope;
      this.filterProvidersByScope();
    });
    this.subscriptions.add(scopeSubscription);
  } ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }
  private filterProvidersByScope() {
    if (this.selectedScope) {
      // Filter providers to only show those that match the selected scope
      this.providerOptions = this.providerOptions.filter(provider =>
        provider.scopeInfo?.scopeType === this.selectedScope?.scopeType &&
        provider.scopeInfo?.scopeId === this.selectedScope?.scopeId
      );
    }
    // If no scope is selected, show all providers (handled by loadData)
  }

  getScopeDisplayName(scope: ScopeInfo): string {
    // You can customize this method to display a more user-friendly scope name
    // For now, just show the scope type and ID
    return `${scope.scopeType}: ${scope.scopeId}`;
  }  // データの読み込み（モデルと価格情報）
  loadData() {
    this.aiProviderService.getProviders().pipe().subscribe({
      next: (providers) => {
        // Use AdminScopeService to get only effective (highest priority) providers
        this.providerOptions = this.adminScopeService.getEffectiveItems(providers);
        this.filterProvidersByScope(); // Filter providers based on selected scope
      },
      error: (err) => {
        console.error('Error fetching provider names:', err);
        this.snackBar.open('Error loading provider names', 'Close', {
          duration: 3000,
          panelClass: 'error-snackbar'
        });
      }
    });
    // モデルと各モデルの最新価格情報を取得
    this.aiModelService.getAIModels(true).pipe(
      tap(models => {
        // Filter models by effective items logic - since AIModelEntityForView doesn't have scopeInfo,
        // we'll use a simple name-based grouping approach similar to the effective items logic
        const modelGroups = new Map<string, AIModelEntityForView[]>();

        // Group models by name
        models.forEach(model => {
          const key = model.name || 'unnamed';
          if (!modelGroups.has(key)) {
            modelGroups.set(key, []);
          }
          modelGroups.get(key)!.push(model);
        });

        // For each group, select the most recent or active model
        this.models = Array.from(modelGroups.values()).map(group => {
          // Sort by creation date (if available) or use the first one
          return group.sort((a, b) => {
            // Prioritize active models
            if (a.isActive && !b.isActive) return -1;
            if (!a.isActive && b.isActive) return 1;

            // Then by UI order
            const aOrder = a.uiOrder || 0;
            const bOrder = b.uiOrder || 0;
            return aOrder - bOrder;
          })[0];
        });
      }),
    ).subscribe({
      next: (pricingResults) => {
        // Models are already processed in the tap operator
      },
      error: (err) => {
        console.error('Error fetching data:', err);
        this.snackBar.open('Error loading data', 'Close', {
          duration: 3000,
          panelClass: 'error-snackbar'
        });
      }
    });
  }

  // フォームの初期化
  initForm() {
    // 現在の日付を取得してYYYY-MM-DD形式に変換
    const today = this.formatDateForInput(new Date());

    this.form = this.fb.group({
      id: [''],
      providerId: ['', Validators.required],
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
      defaultParameters: [{}], // JSON文字列として扱う
      capabilities: [{}], // JSON文字列として扱う
      metadata: [{}], // JSON文字列として扱う
      endpointTemplate: [''],
      documentationUrl: [''],
      licenseType: [''],
      knowledgeCutoff: [''],
      releaseDate: [''],
      deprecationDate: [''],
      tags: [[]], // コンマ区切りで処理
      uiOrder: [0],
      isStream: [true],
      isActive: [true],
      // 価格設定用のネストされたフォームグループ
      pricing: this.fb.group({
        id: [''],
        modelId: [''],
        inputPricePerUnit: [0.00, [Validators.required, Validators.min(0)]],
        outputPricePerUnit: [0.00, [Validators.required, Validators.min(0)]],
        unit: ['USD/1Mtokens', Validators.required],
        validFrom: [today, Validators.required]
      })
    });
  }

  // 完全なフォームリセット
  resetForm() {
    this.form.reset({
      id: '',
      providerId: '',
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
      pricing: {
        id: '',
        modelId: '',
        inputPricePerUnit: 0.00,
        outputPricePerUnit: 0.00,
        unit: 'USD/1Mtokens',
        validFrom: this.formatDateForInput(new Date())
      }
    });

    // 価格情報関連の状態をリセット
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;
  }

  // タブの切り替え
  setActiveTab(tabName: string) {
    this.activeTab = tabName;
  }
  // 新規作成モードを開始
  createNew() {
    this.isEditMode = false;
    this.isDuplicateMode = false;

    // フォームを完全にリセット
    this.resetForm();

    // Ensure form is editable for new creation
    this.setFormReadOnly(false);

    this.isFormVisible = true;
    this.setActiveTab('basic'); // 初期タブを設定
  }

  // 既存モデルを複製して新規作成
  duplicateModel(model: AIModelEntityForView, event?: Event) {
    if (event) {
      event.stopPropagation();
    }

    this.isEditMode = false;
    this.isDuplicateMode = true;
    this.isFormVisible = true;
    this.setActiveTab('basic');

    // モデルデータをコピー（IDはクリア）
    const knowledgeCutoff = model.knowledgeCutoff ? this.formatDateForInput(model.knowledgeCutoff) : '';
    const releaseDate = model.releaseDate ? this.formatDateForInput(model.releaseDate) : '';
    const deprecationDate = model.deprecationDate ? this.formatDateForInput(model.deprecationDate) : '';

    const provider = this.providerOptions.find(provider => provider.type === model.providerType && provider.name === model.providerName);

    this.form.patchValue({
      id: '', // IDはクリア
      providerId: provider ? provider.id : '', // プロバイダIDを設定
      providerModelId: model.providerModelId + '_copy', // 識別のため_copyを付加
      name: model.name + ' (Copy)',
      aliases: [...(model.aliases || [])],
      shortName: model.shortName,
      throttleKey: model.throttleKey,
      status: model.status,
      description: model.description || '',
      modalities: [...(model.modalities || [])],
      maxContextTokens: model.maxContextTokens,
      maxOutputTokens: model.maxOutputTokens,
      inputFormats: [...(model.inputFormats || [])],
      outputFormats: [...(model.outputFormats || [])],
      defaultParameters: { ...(model.defaultParameters || {}) },
      capabilities: { ...(model.capabilities || {}) },
      metadata: { ...(model.metadata || {}) },
      endpointTemplate: model.endpointTemplate || '',
      documentationUrl: model.documentationUrl || '',
      licenseType: model.licenseType || '',
      knowledgeCutoff: knowledgeCutoff,
      releaseDate: releaseDate,
      deprecationDate: deprecationDate,
      tags: [...(model.tags || [])],
      uiOrder: model.uiOrder || 0,
      isStream: model.isStream || false,
      isActive: true, // 新規作成時はアクティブに
    });

    // 価格情報は最新のものをコピー（新規作成扱い）
    if (model.pricingHistory && model.pricingHistory.length > 0) {
      const latestPricing = model.pricingHistory[0];
      this.form.get('pricing')?.patchValue({
        id: '', // IDはクリア
        modelId: '', // モデルIDもクリア
        inputPricePerUnit: latestPricing.inputPricePerUnit,
        outputPricePerUnit: latestPricing.outputPricePerUnit,
        unit: latestPricing.unit,
        validFrom: this.formatDateForInput(new Date()) // 今日の日付
      });
    }    // 価格情報の状態を新規作成モードに
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;

    // Ensure form is editable for duplication
    this.setFormReadOnly(false);

    // チェックボックスの状態を更新
    this.updateCheckboxes();
  }
  // 既存モデルの選択（編集モード）
  selectModel(model: AIModelEntityForView) {
    // Check if user has edit permission for this model's provider scope
    const provider = this.providerOptions.find(provider => provider.type === model.providerType && provider.name === model.providerName);
    const canEdit = provider ? this.adminScopeService.canEditScope(
      provider.scopeInfo.scopeType,
      provider.scopeInfo.scopeId
    ) : false;

    this.isEditMode = canEdit;
    this.isDuplicateMode = false;
    this.isFormVisible = true;
    // this.setActiveTab('basic'); // 初期タブを設定

    // モデルの価格情報を取得
    this.hasExistingPricing = model.pricingHistory && model.pricingHistory.length > 0;
    if (this.hasExistingPricing) {
      // 最新の価格情報を取得
      const latestPricing = model.pricingHistory[0];
      this.currentPricing = latestPricing;
      this.selectedPricingId = latestPricing.id;
      this.pricingHistory = [...model.pricingHistory];
      this.pricingHistory.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());

      // 最新の価格情報をフォームに設定
      this.selectExistingPricing(latestPricing);
    } else {
      this.currentPricing = null;
      this.selectedPricingId = undefined;
      this.pricingHistory = [];
      this.setPricingSelectionMode('new');
    }

    // 日付のフォーマット
    const knowledgeCutoff = model.knowledgeCutoff ? this.formatDateForInput(model.knowledgeCutoff) : '';
    const releaseDate = model.releaseDate ? this.formatDateForInput(model.releaseDate) : '';
    const deprecationDate = model.deprecationDate ? this.formatDateForInput(model.deprecationDate) : '';

    // モデルデータをフォームに設定
    this.form.patchValue({
      id: model.id,
      providerId: provider ? provider.id : '', // プロバイダIDを設定
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
    });

    // If user cannot edit, make form read-only
    if (!canEdit) {
      this.setFormReadOnly(true);
    }

    // チェックボックスの状態を更新
    this.updateCheckboxes();
  }

  // 登録/更新処理
  register() {
    if (this.form.invalid) {
      // バリデーションエラーの詳細をログ出力
      Object.keys(this.form.controls).forEach(key => {
        const controlErrors = this.form.get(key)?.errors;
        if (controlErrors) {
          console.log('エラーのあるフィールド:', key);
          console.log('エラー内容:', controlErrors);
        }
      });

      // 価格情報のバリデーションエラーもチェック
      const pricingGroup = this.form.get('pricing') as FormGroup;
      if (pricingGroup) {
        Object.keys(pricingGroup.controls).forEach(key => {
          const controlErrors = pricingGroup.get(key)?.errors;
          if (controlErrors) {
            console.log('価格情報のエラー:', key, controlErrors);
          }
        });
      }

      // バリデーションエラーのあるタブをアクティブにする
      this.activateTabWithErrors();

      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched(this.form);

      // エラーメッセージを表示
      this.snackBar.open('Please fix the validation errors', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
      return;
    }

    try {
      // フォームの値を取得
      const formValue = this.form.value;

      // 日付の処理
      const knowledgeCutoff = formValue.knowledgeCutoff ? new Date(formValue.knowledgeCutoff) : null;
      const releaseDate = formValue.releaseDate ? new Date(formValue.releaseDate) : null;
      const deprecationDate = formValue.deprecationDate ? new Date(formValue.deprecationDate) : null;

      const provider = this.providerOptions.find(provider => provider.id === formValue.providerId);
      if (!provider) {
        this.snackBar.open('Selected provider is invalid', 'Close', {
          duration: 3000,
          panelClass: 'error-snackbar'
        });
        return;
      }

      // モデルデータの構築
      const modelData: AIModelEntity & { aliases: string[] } = {
        ...genInitialBaseEntity(),
        id: this.isEditMode ? formValue.id : undefined, // 新規作成時はIDを設定しない
        providerType: provider.type,
        providerName: provider.name,
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
      };

      // 価格情報の構築
      const pricingData: Partial<ModelPricing> = {
        id: this.pricingSelectionMode === 'new' ? undefined : formValue.pricing?.id,
        modelId: formValue.id, // 一時的にフォームのIDを設定（後で更新される）
        inputPricePerUnit: formValue.pricing?.inputPricePerUnit || 0,
        outputPricePerUnit: formValue.pricing?.outputPricePerUnit || 0,
        unit: formValue.pricing?.unit || 'USD/1Mtokens',
        validFrom: formValue.pricing?.validFrom ? new Date(formValue.pricing.validFrom) : new Date(),
      };

      const operationType = this.isEditMode ? 'update' : 'create';

      // モデルの作成または更新
      this.aiModelService.upsertAIModel(modelData).pipe(
        switchMap(savedModel => {
          if (savedModel) {
            // 保存されたモデルIDを価格情報に設定
            pricingData.modelId = savedModel.id;

            // 価格情報の処理
            if (this.pricingSelectionMode === 'new' || !this.isEditMode) {
              // 新規価格情報の作成
              return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            } else if (this.pricingSelectionMode === 'edit' && this.isPricingChanged(pricingData)) {
              // 既存価格情報の更新（変更がある場合のみ）
              return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            } else {
              // 変更がなければ何もしない
              return of(null);
            }
          } else {
            return of(null);
          }
        })
      ).subscribe({
        next: () => {
          const message = operationType === 'create'
            ? 'Model and pricing created successfully'
            : 'Model and pricing updated successfully';
          this.snackBar.open(message, 'Close', {
            duration: 3000
          });
          this.loadData();
          this.closeForm();
        },
        error: (error) => {
          console.error(`Error ${operationType}ing model or pricing:`, error);
          this.snackBar.open(`Error ${operationType}ing data`, 'Close', {
            duration: 3000,
            panelClass: 'error-snackbar'
          });
        }
      });
    } catch (error) {
      console.error('Error processing form data:', error);
      this.snackBar.open('Error processing form data', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
    }
  }

  // 価格情報が変更されたかチェック
  isPricingChanged(newPricing: Partial<ModelPricing>): boolean {
    // 編集中の価格情報IDに基づいて該当する価格情報を取得
    const selectedPricing = this.pricingHistory.find(p => p.id === this.selectedPricingId);
    if (!selectedPricing) return true; // 選択した価格情報が見つからなければ変更とみなす

    // 数値を文字列に変換して比較
    const currentInput = selectedPricing.inputPricePerUnit.toString();
    const newInput = newPricing.inputPricePerUnit?.toString() || '';

    const currentOutput = selectedPricing.outputPricePerUnit.toString();
    const newOutput = newPricing.outputPricePerUnit?.toString() || '';

    // 変更がないかチェック
    return currentInput !== newInput ||
      currentOutput !== newOutput ||
      selectedPricing.unit !== newPricing.unit ||
      this.formatDateForInput(selectedPricing.validFrom) !== this.formatDateForInput(newPricing.validFrom as Date);
  }

  // モデルの削除
  deleteModel(id: string) {
    if (confirm('Are you sure you want to delete this model and its pricing information?')) {
      // モデルと関連する価格情報を削除
      this.aiModelPricingService.deletePricingByModelId(id).pipe(
        switchMap(() => this.aiModelService.deleteAIModel(id))
      ).subscribe({
        next: () => {
          this.snackBar.open('Model and pricing deleted successfully', 'Close', {
            duration: 3000
          });
          this.loadData();
          if (this.form.value.id === id) {
            this.closeForm();
          }
        },
        error: (error) => {
          console.error('Error deleting model or pricing:', error);
          this.snackBar.open('Error deleting data', 'Close', {
            duration: 3000,
            panelClass: 'error-snackbar'
          });
        }
      });
    }
  }

  // フォームを閉じる
  closeForm() {
    this.isFormVisible = false;
    this.isEditMode = false;
    this.isDuplicateMode = false;
    this.resetForm();
  }

  // チェックボックスの変更処理（汎用）
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

  // チェックボックスの状態を更新
  updateCheckboxes() {
    setTimeout(() => {
      // モダリティのチェックボックスを更新
      this.updateCheckboxField('modalities');

      // 入力フォーマットのチェックボックスを更新
      this.updateCheckboxField('inputFormats');

      // 出力フォーマットのチェックボックスを更新
      this.updateCheckboxField('outputFormats');
    });
  }

  isChecked(fieldName: string, value: string): boolean {
    const values = this.form.get(fieldName)?.value as string[] || [];
    return values.includes(value);
  }

  // 特定のフィールドのチェックボックスを更新する
  updateCheckboxField(fieldName: string) {
    const values = this.form.get(fieldName)?.value as string[] || [];

    this.modalityOptions.forEach(option => {
      const selector = `input[type="checkbox"][value="${option}"]`;
      // 特定のフィールド用のチェックボックスのみを選択
      const allCheckboxes = document.querySelectorAll(selector);

      // 適切なチェックボックスを見つけて更新
      allCheckboxes.forEach(cb => {
        const checkbox = cb as HTMLInputElement;
        // 親要素を遡って、このチェックボックスが特定のフィールドに関連しているか確認
        let parent = checkbox.parentElement;
        while (parent && !parent.textContent?.includes(fieldName) && parent.tagName !== 'FORM') {
          parent = parent.parentElement;
        }

        // 適切なフィールドに関連するチェックボックスを更新
        if (parent && parent.textContent?.includes(fieldName)) {
          checkbox.checked = values.includes(option);
        }
      });
    });
  }

  // バリデーションエラーがあるタブをアクティブにする
  activateTabWithErrors() {
    // 各タブに関連するフィールドのグループを定義
    const tabFields = {
      'basic': ['providerId', 'providerModelId', 'name', 'aliases', 'shortName', 'throttleKey', 'status', 'description', 'isStream', 'isActive'],
      'capabilities': ['modalities', 'maxContextTokens', 'maxOutputTokens', 'inputFormats', 'outputFormats', 'defaultParameters', 'capabilities'],
      'pricing': ['pricing.inputPricePerUnit', 'pricing.outputPricePerUnit', 'pricing.unit', 'pricing.validFrom'],
      'advanced': ['endpointTemplate', 'documentationUrl', 'licenseType', 'releaseDate', 'knowledgeCutoff', 'deprecationDate', 'tags', 'uiOrder', 'metadata']
    };

    // 各タブのフィールドのバリデーションエラーを確認
    for (const [tab, fields] of Object.entries(tabFields)) {
      for (const field of fields) {
        // ネストされたフィールドの場合
        if (field.includes('.')) {
          if (this.hasNestedError(field)) {
            this.setActiveTab(tab);
            return;
          }
        } else {
          // 通常のフィールドの場合
          if (this.hasError(field)) {
            this.setActiveTab(tab);
            return;
          }
        }
      }
    }
  }

  // ネストされたエラーチェック
  hasNestedError(path: string): boolean {
    const parts = path.split('.');
    if (parts.length !== 2) return false;

    const group = this.form.get(parts[0]) as FormGroup;
    if (!group) return false;

    const control = group.get(parts[1]);
    return !!control?.invalid && !!control?.touched;
  }

  // ネストされたエラーメッセージの取得
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

  // 日付のフォーマット（UI表示用）
  formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString();
  }

  // 日付をInput要素に適した形式に変換
  formatDateForInput(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Recursively mark all controls in a form group as touched
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

  // Get error message for a form control
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

  // Check if a control has an error and has been touched
  hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!control?.invalid && !!control?.touched;
  }

  // 新規作成モードに設定
  setPricingSelectionMode(mode: 'new' | 'edit') {
    this.pricingSelectionMode = mode;

    if (mode === 'new') {
      // 新規作成モードの場合、フォームをリセット
      const today = this.formatDateForInput(new Date());
      const pricingForm = this.form.get('pricing');
      if (pricingForm) {
        pricingForm.patchValue({
          id: '',  // IDをクリア
          modelId: this.form.get('id')?.value || '',
          inputPricePerUnit: 0.00,
          outputPricePerUnit: 0.00,
          unit: 'USD/1Mtokens',
          validFrom: today
        });
      }
      this.selectedPricingId = undefined;
    } else if (mode === 'edit') {
      // 編集モードの場合、選択された価格情報を取得
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

  // 既存の価格情報を選択
  selectExistingPricing(pricing: ModelPricing) {
    this.pricingSelectionMode = 'edit';
    this.selectedPricingId = pricing.id;

    // 選択した価格情報をフォームに設定
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

  // 現在適用中の価格情報かどうかを判定
  isCurrentPricing(pricing: ModelPricing): boolean {
    if (!this.currentPricing) return false;
    return pricing.id === this.currentPricing.id;
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
   * Check if user can edit a specific model based on its provider scope
   */
  canUserEditModel(model: AIModelEntityForView): boolean {
    const provider = this.providerOptions.find(provider =>
      provider.type === model.providerType && provider.name === model.providerName
    );
    return provider ? this.adminScopeService.canEditScope(
      provider.scopeInfo.scopeType,
      provider.scopeInfo.scopeId
    ) : false;
  }

  /**
   * Get form title based on current mode
   */
  getFormTitle(): string {
    if (this.isDuplicateMode) {
      return 'Duplicate Model';
    } else if (this.isEditMode) {
      return 'Edit Model';
    } else if (this.isFormVisible && this.form.get('id')?.value) {
      // If form is visible with an ID but not in edit mode, it's read-only
      return 'View Model (Read Only)';
    } else {
      return 'New Model';
    }
  }

  /**
   * Add a keyword to a reactive form array (for aliases, tags, etc.)
   */
  addReactiveKeyword(fieldName: string, event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      const control = this.form.get(fieldName);
      if (control) {
        const currentArray = control.value || [];
        control.setValue([...currentArray, value]);
      }
    }
    event.chipInput!.clear();
  }

  /**
   * Remove a keyword from a reactive form array
   */
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

  /**
   * Handle autocomplete selection for chip inputs
   */
  autocompleteSelect(fieldName: string, event: any): void {
    const value = event.option.value;
    const control = this.form.get(fieldName);
    if (control && value) {
      const currentArray = control.value || [];
      if (!currentArray.includes(value)) {
        control.setValue([...currentArray, value]);
      }
    }
  }
}