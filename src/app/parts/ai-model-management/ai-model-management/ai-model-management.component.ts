import { LiveAnnouncer } from '@angular/cdk/a11y';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, ValueChangeEvent } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { AIModelManagerService, AIModelPricingService, ModelPricing, AIModelEntity, AIModelStatus, AIProviderType, Modality, AIModelEntityForView } from '../../../services/model-manager.service';
import { forkJoin, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { genInitialBaseEntity } from '../../../services/project.service';
import { JsonEditorComponent } from "../../json-editor/json-editor.component";
import { TrimTrailingZerosPipe } from '../../../pipe/trim-trailing-zeros.pipe';
import { MatChipInputEvent, MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatAutocompleteActivatedEvent, MatAutocompleteModule } from '@angular/material/autocomplete';

interface ModelPricingMap {
  [modelId: string]: ModelPricing[];
}

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
    JsonEditorComponent,
    TrimTrailingZerosPipe,
  ],
  templateUrl: './ai-model-management.component.html',
  styleUrl: './ai-model-management.component.scss'
})
export class AIModelManagementComponent implements OnInit {
  form!: FormGroup;
  private fb: FormBuilder = inject(FormBuilder);
  private snackBar: MatSnackBar = inject(MatSnackBar);
  readonly announcer = inject(LiveAnnouncer);

  readonly separatorKeysCodes = [ENTER, COMMA] as const;

  readonly aiModelService: AIModelManagerService = inject(AIModelManagerService);
  readonly aiModelPricingService: AIModelPricingService = inject(AIModelPricingService);

  models: AIModelEntityForView[] = [];
  modelPricingMap: ModelPricingMap = {};

  // 表示状態管理
  isFormVisible = false;
  isEditMode = false;
  activeTab = 'basic'; // basic, capabilities, pricing, advanced

  // 価格情報管理
  currentPricing: ModelPricing | null = null;
  pricingHistory: ModelPricing[] = [];
  hasExistingPricing = false;

  // ドロップダウンオプション
  providerOptions = Object.values(AIProviderType);
  statusOptions = Object.values(AIModelStatus);
  modalityOptions = Object.values(Modality);

  constructor() {
    this.loadData();
    this.announcer.announce(`hello`, 'assertive');
  }

  ngOnInit() {
    this.initForm();
  }

  // データの読み込み（モデルと価格情報）
  loadData() {
    // モデルと各モデルの最新価格情報を取得
    this.aiModelService.getAIModels().pipe(
      switchMap(models => {
        this.models = models;

        // モデルがない場合は空の配列を返す
        if (models.length === 0) {
          return of([]);
        }

        // 各モデルの最新価格情報を取得
        const requests = models.map(model =>
          this.aiModelPricingService.getPricings(model.id).pipe(
            catchError(() => of(null))
          )
        );

        return forkJoin(requests);
      })
    ).subscribe({
      next: (pricingResults) => {
        // 価格情報をマップに設定
        this.modelPricingMap = {};
        pricingResults.forEach((pricing, index) => {
          if (pricing && pricing.length > 0) {
            this.modelPricingMap[this.models[index].id] = pricing;
          }
        });
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
      provider: ['', Validators.required],
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
      inputFormats: [[]],
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

    // // JSONフィールドにカスタムバリデータを設定
    // this.form.get('defaultParameters')?.setValidators([jsonValidator]);
    // this.form.get('capabilities')?.setValidators([jsonValidator]);
    // this.form.get('metadata')?.setValidators([jsonValidator]);
  }

  // タブの切り替え
  setActiveTab(tabName: string) {
    this.activeTab = tabName;
  }

  // 新規作成モードを開始
  // createNew メソッドを修正
  createNew() {
    this.isEditMode = false;
    // this.form.reset();
    this.initForm();
    this.form.patchValue({ isActive: true }); // デフォルトでアクティブに設定

    // 価格情報をリセット
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;

    this.isFormVisible = true;
    // this.setActiveTab('basic'); // 初期タブを設定
  }

  // 既存モデルの選択
  selectModel(model: AIModelEntityForView) {
    this.isEditMode = true;
    this.isFormVisible = true;
    // this.setActiveTab('basic'); // 初期タブを設定

    // モデルの価格情報を取得
    this.hasExistingPricing = model.pricingHistory.length > 0;
    if (this.hasExistingPricing) {
      // 最新の価格情報を取得
      const latestPricing = model.pricingHistory[0];
      this.currentPricing = latestPricing;
      this.selectedPricingId = latestPricing.id;
      this.pricingHistory = model.pricingHistory;
      this.pricingHistory.sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime());
      this.setPricingSelectionMode('edit');
    } else {
      this.currentPricing = null;
      this.selectedPricingId = undefined;
      this.pricingHistory = [];
      this.setPricingSelectionMode('new');
    }

    // フォームをリセットや再初期化せず、既存のフォームコントロールを維持したまま値を更新

    // 日付のフォーマット
    const knowledgeCutoff = model.knowledgeCutoff ? this.formatDateForInput(model.knowledgeCutoff) : '';
    const releaseDate = model.releaseDate ? this.formatDateForInput(model.releaseDate) : '';
    const deprecationDate = model.deprecationDate ? this.formatDateForInput(model.deprecationDate) : '';

    // モデルデータをフォームに設定
    this.form.patchValue({
      id: model.id,
      provider: model.provider,
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

    // チェックボックスの状態を更新
    this.updateCheckboxes();
  }

  // register メソッドを修正
  register() {
    if (this.form.invalid) {
      Object.keys(this.form.controls).forEach(key => {
        const controlErrors = this.form.get(key)?.errors;
        if (controlErrors) {
          console.log('エラーのあるフィールド:', key);
          console.log('エラー内容:', controlErrors);
        }
      });


      // バリデーションエラーのあるタブをアクティブにする
      this.activateTabWithErrors();

      // Mark all fields as touched to show validation errors
      this.markFormGroupTouched(this.form);

      // フォームのエラーメッセージを表示
      this.announcer.announce('Please fix the validation errors', 'assertive');
      // エラー内容を表示
      console.error('Form validation errors:', this.form.errors);
      // スナックバーでエラーメッセージを表示
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

      // モデルデータの構築
      const modelData: AIModelEntity & { aliases: string[] } = {
        ...genInitialBaseEntity(),
        id: formValue.id,
        provider: formValue.provider,
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
        modelId: formValue.id, // モデルIDを設定
        inputPricePerUnit: formValue.pricing?.inputPricePerUnit,
        outputPricePerUnit: formValue.pricing?.outputPricePerUnit,
        unit: formValue.pricing?.unit,
        validFrom: formValue.pricing?.validFrom ? new Date(formValue.pricing.validFrom) : new Date(),
      };

      if (this.isEditMode) {
        // モデル更新処理
        this.aiModelService.upsertAIModel(modelData).pipe(
          switchMap(updatedModel => {
            // モデルの更新が成功したら、価格情報も更新または作成
            if (updatedModel) {
              // 価格情報に最新のモデルIDを設定
              pricingData.modelId = updatedModel.id;

              // pricingSelectionModeに基づいて処理を分岐
              if (this.pricingSelectionMode === 'new') {
                // 新規価格情報の作成
                return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
              } else {
                // 既存価格情報の更新（変更があれば）
                if (this.isPricingChanged(pricingData)) {
                  return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
                } else {
                  // 変更がなければ何もしない
                  return of(null);
                }
              }
            } else {
              return of(null);
            }
          })
        ).subscribe({
          next: () => {
            this.snackBar.open('Model and pricing updated successfully', 'Close', {
              duration: 3000
            });
            this.loadData();
            this.closeForm();
          },
          error: (error) => {
            console.error('Error updating model or pricing:', error);
            this.snackBar.open('Error updating data', 'Close', {
              duration: 3000,
              panelClass: 'error-snackbar'
            });
          }
        });
      } else {
        // 新規登録処理
        this.aiModelService.upsertAIModel(modelData).pipe(
          switchMap(newModel => {
            if (newModel) {
              // 新しいモデルIDを価格情報に設定
              pricingData.modelId = newModel.id;
              return this.aiModelPricingService.upsertPricing(pricingData as ModelPricing);
            } else {
              return of(null);
            }
          })
        ).subscribe({
          next: () => {
            this.snackBar.open('Model and pricing created successfully', 'Close', {
              duration: 3000
            });
            this.loadData();
            this.closeForm();
          },
          error: (error) => {
            console.error('Error creating model or pricing:', error);
            this.snackBar.open('Error creating data', 'Close', {
              duration: 3000,
              panelClass: 'error-snackbar'
            });
          }
        });
      }
    } catch (error) {
      console.error('Error processing form data:', error);
      this.snackBar.open('Error processing form data', 'Close', {
        duration: 3000,
        panelClass: 'error-snackbar'
      });
    }
  }

  // 価格情報が変更されたかチェック
  // isPricingChanged メソッドを修正
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
  // closeForm メソッドを修正
  closeForm() {
    this.isFormVisible = false;
    this.form.reset();
    this.currentPricing = null;
    this.pricingHistory = [];
    this.hasExistingPricing = false;
    this.pricingSelectionMode = 'new';
    this.selectedPricingId = undefined;
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
      'basic': ['provider', 'providerModelId', 'name', 'aliases', 'shortName', 'throttleKey', 'status', 'description', 'isStream', 'isActive'],
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

  // Add these new properties to the BaseModelComponent class

  // 価格情報の選択モード管理
  pricingSelectionMode: 'new' | 'edit' = 'new';
  selectedPricingId: string | undefined = undefined;

  // このメソッドを追加：新規作成モードに設定
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

  // このメソッドを追加：既存の価格情報を選択
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

  // このメソッドを追加：現在適用中の価格情報かどうかを判定
  isCurrentPricing(pricing: ModelPricing): boolean {
    if (!this.currentPricing) return false;
    return pricing.id === this.currentPricing.id;
  }

  autocompleteSelect(keyword: string, event: MatAutocompleteActivatedEvent): void {
    const value = event.option?.value;
    const currentValues = this.form.get(keyword)?.value || [];
    if (!currentValues.includes(value)) {
      this.form.get(keyword)?.setValue([...currentValues, value]);
    }
  }
  removeReactiveKeyword(keyword: string, value: string) {
    this.form.get(keyword)?.setValue(
      this.form.get(keyword)?.value.filter((k: string) => k !== value)
    );
  }

  addReactiveKeyword(keyword: string, event: MatChipInputEvent): void {
    const value = (event.value || '').trim();

    // Add our keyword
    if (value) {
      this.form.get(keyword)?.setValue([
        ...(this.form.get(keyword)?.value || []),
        value
      ]);
    }
    // Clear the input value
    event.chipInput!.clear();
  }
}