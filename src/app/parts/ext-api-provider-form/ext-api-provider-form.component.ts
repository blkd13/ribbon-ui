import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import {
    ExtApiProviderEntity,
    ExtApiProviderTemplateEntity,
    ExtApiProviderAuthType,
    ExtApiProviderPostType
} from '../../models/models';
import { BaseEntityFields } from '../../models/project-models';
import { MakeOptional } from '../../utils';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { GService } from '../../services/g.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

@Component({
    selector: 'app-ext-api-provider-form',
    imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatButtonModule, MatSnackBarModule, MatButtonToggleModule],
    templateUrl: './ext-api-provider-form.component.html',
    styleUrl: './ext-api-provider-form.component.scss'
})
export class ExtApiProviderFormComponent implements OnInit {
    form!: FormGroup;
    private fb: FormBuilder = inject(FormBuilder);

    readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);
    readonly snackBar: MatSnackBar = inject(MatSnackBar);
    readonly g: GService = inject(GService);

    providers: ExtApiProviderEntity[] = [];
    providerTemplates: ExtApiProviderTemplateEntity[] = [];
    templateMap: { [key: string]: ExtApiProviderTemplateEntity } = {};

    // 表示状態管理
    isFormVisible = false;
    isEditMode = false;

    constructor() {
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
        console.log(this.g.info, this.g.tenantKey);
        this.extApiProviderService.getApiProviders().subscribe({
            next: (providers) => {
                this.providers = providers;
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
        this.form.reset();
        this.initForm();
        this.resetTemplateRelatedFields();
        this.isFormVisible = true;
    }

    // 既存プロバイダーの選択
    selectProvider(provider: ExtApiProviderEntity) {
        this.isEditMode = true;
        this.isFormVisible = true;

        // フォームをリセット
        this.form.reset();
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
        this.form.reset();
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
        if (this.form.invalid) {
            // Mark all fields as touched to show validation errors
            this.markFormGroupTouched(this.form);

            // デバッグ用：無効なフィールドを特定
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

        if (this.isEditMode) {
            // 更新処理
            this.extApiProviderService.updateApiProvider(apiProvider as ExtApiProviderEntity).subscribe({
                next: (response) => {
                    console.log('API Provider updated successfully:', response);
                    this.loadProviders();
                    this.closeForm();
                },
                error: (error) => {
                    console.error('Error updating API Provider:', error);
                }
            });
        } else {
            // 新規登録処理 
            this.extApiProviderService.createApiProvider(apiProvider).subscribe({
                next: (response) => {
                    console.log('API Provider created successfully:', response);
                    this.loadProviders();
                    this.closeForm();
                },
                error: (error) => {
                    console.error('Error creating API Provider:', error);
                }
            });
        }
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
        if (control?.errors?.['required']) {
            return 'This field is required';
        }
        return '';
    }

    // Check if a control has an error and has been touched
    hasError(controlName: string): boolean {
        const control = this.form.get(controlName);
        return !!control?.invalid && !!control?.touched;
    }

    // Get error message for a nested form control
    getNestedErrorMessage(path: string): string {
        const parts = path.split('.');
        if (parts.length !== 2) return '';

        const group = this.form.get(parts[0]) as FormGroup;
        if (!group) return '';

        const control = group.get(parts[1]);
        if (control?.errors?.['required']) {
            return 'This field is required';
        }
        return '';
    }

    // Check if a nested control has an error and has been touched
    hasNestedError(path: string): boolean {
        const parts = path.split('.');
        if (parts.length !== 2) return false;

        const group = this.form.get(parts[0]) as FormGroup;
        if (!group) return false;

        const control = group.get(parts[1]);
        return !!control?.invalid && !!control?.touched;
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
}