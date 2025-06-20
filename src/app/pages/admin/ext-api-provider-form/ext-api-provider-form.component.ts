import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { BaseFormComponent } from '../../../shared/base/base-form.component';
import { ExtApiProviderService } from '../../../services/ext-api-provider.service';
import {
    ExtApiProviderEntity,
    ExtApiProviderTemplateEntity,
    ExtApiProviderAuthType,
    ExtApiProviderPostType
} from '../../../models/models';
import { BaseEntityFields } from '../../../models/project-models';
import { MakeOptional } from '../../../utils';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { GService } from '../../../services/g.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule, MatCheckboxChange } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-ext-api-provider-form',
    imports: [
        CommonModule, 
        ReactiveFormsModule, 
        FormsModule,
        MatIconModule, 
        MatButtonModule, 
        MatSnackBarModule, 
        MatButtonToggleModule,
        MatFormFieldModule,
        MatInputModule,
        MatSelectModule,
        MatCheckboxModule,
        MatTooltipModule
    ],
    templateUrl: './ext-api-provider-form.component.html',
    styleUrl: './ext-api-provider-form.component.scss'
})
export class ExtApiProviderFormComponent extends BaseFormComponent implements OnInit {
    protected form!: FormGroup;
    private fb: FormBuilder = inject(FormBuilder);

    readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);
    readonly snackBar: MatSnackBar = inject(MatSnackBar);
    readonly g: GService = inject(GService);

    providers: ExtApiProviderEntity[] = [];
    filteredProviders: ExtApiProviderEntity[] = [];
    providerTemplates: ExtApiProviderTemplateEntity[] = [];
    templateMap: { [key: string]: ExtApiProviderTemplateEntity } = {};

    // 表示状態管理
    isFormVisible = false;
    isEditMode = false;

    // フィルター・ソート・一括操作関連
    searchFilter = '';
    typeFilter: string[] = [];
    sortBy: string | null = null;
    sortDirection: 'asc' | 'desc' = 'asc';
    selectedProviders: string[] = [];
    availableTypes: string[] = [];

    constructor() {
        super();
        this.loadProviders();
        this.loadProviderTemplates();
    }

    ngOnInit() {
        this.initForm();

        // Subscribe to type changes to update the form based on selected template
        this.form.get('type')?.valueChanges.subscribe(type => {
            if (type) {
                this.updateFormBasedOnTemplate(type);
            }
        });
    }

    // APIプロバイダーの読み込み
    loadProviders() {
        console.log(this.g.info, this.g.orgKey);
        this.extApiProviderService.getApiProviders(true).subscribe({
            next: (providers) => {
                this.providers = providers;
                this.updateFilteredProviders();
            },
            error: (err) => {
                console.error('Error fetching API Providers:', err);
            }
        });
    }

    // APIプロバイダーテンプレートの読み込み
    loadProviderTemplates() {
        this.extApiProviderService.getApiProviderTemplates().subscribe({
            next: (templates) => {
                this.providerTemplates = templates;
                this.templateMap = {} as { [key: string]: ExtApiProviderTemplateEntity };
                templates.forEach(template => {
                    this.templateMap[template.name] = template;
                });
            },
            error: (err) => {
                console.error('Error fetching API Provider Templates:', err);
            }
        });
    }

    // フォームの初期化
    initForm() {
        // オプショナルな、または条件に応じて必須となるフィールドには初期値で必須バリデーションを適用しない
        this.form = this.fb.group({
            id: [''],
            type: ['', Validators.required],
            name: ['', Validators.required],
            label: ['', Validators.required],
            authType: ['', Validators.required],
            uriBase: ['', Validators.required],
            uriBaseAuth: [''],
            pathUserInfo: ['', Validators.required],
            description: [''],
            oAuth2Config: this.fb.group({
                pathAuthorize: [''],
                pathAccessToken: [''],
                scope: [''],
                postType: [ExtApiProviderPostType.json],
                redirectUri: [''],
                clientId: [''],
                clientSecret: [''],
                requireMailAuth: [false]
            })
        });
    }

    // テンプレートタイプが変更されたときの処理
    onTemplateTypeChanged() {
        const templateName = this.form.get('type')?.value;
        if (!templateName || !this.templateMap[templateName]) {
            this.resetTemplateRelatedFields();
            return;
        }

        // updateFormBasedOnTemplateを呼び出し、重複コードを削除
        this.updateFormBasedOnTemplate(templateName);
    }

    // テンプレート関連フィールドのリセット
    resetTemplateRelatedFields() {
        this.disableOAuth2Config();
    }

    // OAuth2Configを有効化する
    enableOAuth2Config() {
        const oAuth2ConfigGroup = this.form.get('oAuth2Config') as FormGroup;

        // 必須フィールドにバリデーションを追加
        oAuth2ConfigGroup.get('pathAuthorize')?.setValidators(Validators.required);
        oAuth2ConfigGroup.get('pathAccessToken')?.setValidators(Validators.required);
        oAuth2ConfigGroup.get('scope')?.setValidators(Validators.required);
        oAuth2ConfigGroup.get('clientId')?.setValidators(Validators.required);
        oAuth2ConfigGroup.get('clientSecret')?.setValidators(Validators.required);

        // 各フィールドを有効化して検証ステータスを更新
        Object.keys(oAuth2ConfigGroup.controls).forEach(controlName => {
            const control = oAuth2ConfigGroup.get(controlName);
            if (control) {
                control.enable();
                control.updateValueAndValidity();
            }
        });
    }

    // OAuth2Configを無効化する
    disableOAuth2Config() {
        const oAuth2ConfigGroup = this.form.get('oAuth2Config') as FormGroup;

        // 全てのバリデーションをクリア
        Object.keys(oAuth2ConfigGroup.controls).forEach(controlName => {
            const control = oAuth2ConfigGroup.get(controlName);
            if (control) {
                control.clearValidators();
                control.disable();
                control.updateValueAndValidity();
            }
        });
    }

    // テンプレートに基づいてフォームを更新 (単一の責任を持つメソッドに統合)
    updateFormBasedOnTemplate(templateName: string) {
        if (!templateName || !this.templateMap[templateName]) return;

        const template = this.templateMap[templateName];

        // テンプレートからの基本値を設定
        this.form.patchValue({
            authType: template.authType,
            pathUserInfo: template.pathUserInfo || '',
            uriBaseAuth: template.uriBaseAuth || ''
        });

        // OAuth2特有の設定
        if (template.authType === ExtApiProviderAuthType.OAuth2) {
            this.enableOAuth2Config();
            const oAuth2ConfigGroup = this.form.get('oAuth2Config') as FormGroup;

            // OAuth2テンプレート値を設定
            if (template.oAuth2Config) {
                oAuth2ConfigGroup.patchValue({
                    pathAuthorize: template.oAuth2Config.pathAuthorize || '',
                    pathAccessToken: template.oAuth2Config.pathAccessToken || '',
                    scope: template.oAuth2Config.scope || '',
                    postType: template.oAuth2Config.postType || ExtApiProviderPostType.json,
                    redirectUri: template.oAuth2Config.redirectUri || '',
                });
            } else { }
        } else {
            this.disableOAuth2Config();
        }

        // フォーム全体の検証ステータスを更新
        this.form.updateValueAndValidity();
    }

    // 新規作成モードを開始
    createNew() {
        this.isEditMode = false;
        this.resetForm();
        this.initForm();
        this.resetTemplateRelatedFields();
        this.isFormVisible = true;
    }

    // 既存プロバイダーの選択
    selectProvider(provider: ExtApiProviderEntity) {
        this.isEditMode = true;
        this.isFormVisible = true;

        // フォームをリセット
        this.resetForm();
        this.initForm();

        // テンプレートタイプを設定（これにより自動的にフォームが更新される）
        this.form.get('type')?.setValue(provider.type);

        // テンプレートにない基本値を設定
        this.form.patchValue({
            id: provider.id,
            name: provider.name,
            label: provider.label,
            uriBase: provider.uriBase,
            uriBaseAuth: provider.uriBaseAuth,
            authType: provider.authType,
            pathUserInfo: provider.pathUserInfo,
            description: provider.description,
        });

        // OAuth2 specific config - 必要な場合のみClientIDとSecretを設定
        if (provider.oAuth2Config && provider.authType === ExtApiProviderAuthType.OAuth2) {
            this.form.get('oAuth2Config')?.patchValue({
                pathAuthorize: provider.oAuth2Config.pathAuthorize,
                pathAccessToken: provider.oAuth2Config.pathAccessToken,
                scope: provider.oAuth2Config.scope,
                postType: provider.oAuth2Config.postType,
                redirectUri: provider.oAuth2Config.redirectUri,

                clientId: provider.oAuth2Config.clientId,
                clientSecret: provider.oAuth2Config.clientSecret,
                requireMailAuth: provider.oAuth2Config.requireMailAuth
            });
        }
    }

    // フォームを閉じる
    closeForm() {
        this.isFormVisible = false;
        this.resetForm();
        this.resetTemplateRelatedFields();
    }

    // プロバイダーの削除
    deleteProvider(id: string) {
        if (confirm('Are you sure you want to delete this provider?')) {
            this.extApiProviderService.deleteApiProvider(id).subscribe({
                next: () => {
                    console.log('API Provider deleted successfully');
                    this.loadProviders();
                    if (this.form.value.id === id) {
                        this.closeForm();
                    }
                },
                error: (error) => {
                    console.error('Error deleting API Provider:', error);
                }
            });
        }
    }

    // プロバイダーの登録・更新
    register() {
        if (!this.beforeSubmit()) {
            this.logInvalidControls(this.form);
            return;
        }

        const formValue = this.form.value;
        const isOAuth2 = formValue.authType === ExtApiProviderAuthType.OAuth2;

        const apiProvider: MakeOptional<ExtApiProviderEntity, BaseEntityFields> = {
            id: formValue.id,
            type: formValue.type,
            name: formValue.name,
            label: formValue.label,
            authType: isOAuth2 ? ExtApiProviderAuthType.OAuth2 : ExtApiProviderAuthType.APIKey,
            uriBase: formValue.uriBase,
            uriBaseAuth: formValue.uriBaseAuth,
            pathUserInfo: formValue.pathUserInfo,
            description: formValue.description,
            sortSeq: 0
        };

        // Add OAuth2 config if template type is OAuth2
        if (isOAuth2 && formValue.oAuth2Config) {
            apiProvider.oAuth2Config = {
                pathAuthorize: formValue.oAuth2Config.pathAuthorize,
                pathAccessToken: formValue.oAuth2Config.pathAccessToken,
                scope: formValue.oAuth2Config.scope,
                postType: formValue.oAuth2Config.postType,
                redirectUri: formValue.oAuth2Config.redirectUri,
                clientId: formValue.oAuth2Config.clientId,
                clientSecret: formValue.oAuth2Config.clientSecret,
                requireMailAuth: formValue.oAuth2Config.requireMailAuth
            };
        }

        this.setSaving(true);

        const successMessage = this.isEditMode ? 'APIプロバイダーを更新しました' : 'APIプロバイダーを作成しました';
        const errorMessage = this.isEditMode ? 'APIプロバイダーの更新に失敗しました' : 'APIプロバイダーの作成に失敗しました';

        const operation = this.isEditMode ?
            this.extApiProviderService.updateApiProvider(apiProvider as ExtApiProviderEntity) :
            this.extApiProviderService.createApiProvider(apiProvider);

        operation.subscribe({
            next: (response) => {
                this.afterSubmit(true, successMessage);
                this.loadProviders();
                this.closeForm();
            },
            error: (error) => {
                this.afterSubmit(false, errorMessage);
                console.error('Error with API Provider operation:', error);
            }
        });
    }

    // デバッグ用：無効なフィールドを特定するヘルパーメソッド
    logInvalidControls(formGroup: FormGroup) {
        Object.keys(formGroup.controls).forEach(key => {
            const control = formGroup.get(key);
            if (control instanceof FormGroup) {
                this.logInvalidControls(control);
            } else if (control?.invalid) {
                console.log(`Invalid control: ${key}`);
                console.log('Errors:', control.errors);
            }
        });
    }

    // Get error message for a nested form control (overrides base implementation for specific needs)
    override getNestedErrorMessage(path: string): string {
        return super.getNestedErrorMessage(path) || this.getCustomErrorMessage(path);
    }

    // Check if a nested control has an error and has been touched (delegates to base implementation)
    override hasNestedError(path: string): boolean {
        return super.hasNestedError(path);
    }

    private getCustomErrorMessage(path: string): string {
        const parts = path.split('.');
        if (parts.length !== 2) return '';

        const control = this.form.get(path);
        if (control?.errors?.['required']) {
            return 'This field is required';
        }
        return '';
    }

    // リダイレクトURIをクリップボードにコピー
    copyRedirectUri() {
        const redirectUriInput = document.getElementById('redirectUri') as HTMLInputElement;
        redirectUriInput.select();
        document.execCommand('copy');

        this.snackBar.open('Redirect URI copied to clipboard', 'Close', {
            duration: 2000,
        });
    }

    // ===== フィルター・ソート・一括操作関連 =====

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
                case 'type':
                    valueA = a.provider.type;
                    valueB = b.provider.type;
                    break;
                case 'name':
                    valueA = a.provider.name;
                    valueB = b.provider.name;
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
        return this.selectedProviders.length > 0;
    }

    bulkDelete(): void {
        if (!this.canBulkEdit()) return;

        const confirmed = confirm(`Are you sure you want to delete ${this.selectedProviders.length} providers? This action cannot be undone.`);
        if (!confirmed) return;

        const deletePromises = this.selectedProviders.map(id => 
            this.extApiProviderService.deleteApiProvider(id)
        );

        Promise.all(deletePromises)
            .then(() => {
                this.snackBar.open(`${this.selectedProviders.length} providers deleted`, 'Close', { duration: 3000 });
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