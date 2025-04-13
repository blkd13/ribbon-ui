import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { ExtApiProviderTemplateEntity, ExtApiProviderAuthType, ExtApiProviderPostType } from '../../models/models';
import { BaseEntityFields } from '../../models/project-models';
import { MakeOptional } from '../../utils';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-ext-api-provider-template-form',
  imports: [CommonModule, ReactiveFormsModule, MatButtonToggleModule, MatIconModule, MatButtonModule],
  templateUrl: './ext-api-provider-template-form.component.html',
  styleUrl: './ext-api-provider-template-form.component.scss'
})
export class ExtApiProviderTemplateFormComponent implements OnInit {
  form!: FormGroup;
  private fb: FormBuilder = inject(FormBuilder);

  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);

  providerTemplates: ExtApiProviderTemplateEntity[] = [];
  providerTemplateMap: { [key: string]: ExtApiProviderTemplateEntity } = {};

  // 表示状態管理
  isFormVisible = false;
  isEditMode = false;

  constructor() {
    this.loadProviderTemplates();
  }

  ngOnInit() {
    this.initForm();
  }

  // APIプロバイダーテンプレートの読み込み
  loadProviderTemplates() {
    this.extApiProviderService.getApiProviderTemplates().subscribe({
      next: (providers) => {
        this.providerTemplates = providers;
        this.providerTemplateMap = {};
        this.providerTemplates.forEach(provider => {
          this.providerTemplateMap[provider.name] = provider;
        });
      },
      error: (err) => {
        console.error('Error fetching API Providers:', err);
      }
    });
  }

  // フォームの初期化
  initForm() {
    this.form = this.fb.group({
      id: [''],
      authType: [ExtApiProviderAuthType.OAuth2, Validators.required],
      name: ['', Validators.required],
      pathUserInfo: ['', Validators.required],
      uriBaseAuth: [''],
      oAuth2Config: this.fb.group({
        pathAuthorize: ['', Validators.required],
        pathAccessToken: ['', Validators.required],
        scope: ['', Validators.required],
        postType: [ExtApiProviderPostType.json],
        redirectUri: [`${window.location.origin}/api/public/oauth/callback`],
      }),
      description: [''],
    });
    // 初期値に対してバリデーターを適用
    this.updateValidatorsBasedOnType(this.form.get('authType')?.value);
  }

  // Update validators based on selected type
  updateValidatorsBasedOnType(authType: ExtApiProviderAuthType) {
    if (!authType) {
      // authTypeが未定義の場合は処理しない
      return;
    }
    // Get form controls
    const pathUserInfo = this.form.get('pathUserInfo');
    const uriBaseAuth = this.form.get('uriBaseAuth');
    const oAuth2ConfigGroup = this.form.get('oAuth2Config');

    // Clear all validators first
    pathUserInfo?.clearValidators();
    uriBaseAuth?.clearValidators();

    // Always set pathUserInfo as required for both types
    pathUserInfo?.setValidators(Validators.required);

    if (oAuth2ConfigGroup) {
      const pathAuthorize = oAuth2ConfigGroup.get('pathAuthorize');
      const pathAccessToken = oAuth2ConfigGroup.get('pathAccessToken');
      const scope = oAuth2ConfigGroup.get('scope');
      const postType = oAuth2ConfigGroup.get('postType');
      const redirectUri = oAuth2ConfigGroup.get('redirectUri');

      // 全てのOAuth2関連のバリデーターをクリア
      pathAuthorize?.clearValidators();
      pathAccessToken?.clearValidators();
      scope?.clearValidators();
      postType?.clearValidators();
      redirectUri?.clearValidators();

      if (authType === ExtApiProviderAuthType.OAuth2) {
        // OAuth2 required fields
        pathAuthorize?.setValidators(Validators.required);
        pathAccessToken?.setValidators(Validators.required);
        scope?.setValidators(Validators.required);
        postType?.setValidators(Validators.required);
        redirectUri?.setValidators(Validators.required);
      }

      // Update the validity of OAuth2 controls
      pathAuthorize?.updateValueAndValidity();
      pathAccessToken?.updateValueAndValidity();
      scope?.updateValueAndValidity();
      postType?.updateValueAndValidity();
      redirectUri?.updateValueAndValidity();
    }

    if (authType === ExtApiProviderAuthType.APIKey) {
      // APIKey required fields
      uriBaseAuth?.setValidators(Validators.required);
    }

    // Update the validity of the controls
    pathUserInfo?.updateValueAndValidity();
    uriBaseAuth?.updateValueAndValidity();
  }

  // 新規作成モードを開始
  createNew() {
    this.isEditMode = false;
    this.form.reset();
    this.initForm();
    this.isFormVisible = true;
  }

  // 既存テンプレートの選択
  selectProvider(providerTemplate: ExtApiProviderTemplateEntity) {
    this.isEditMode = true;
    this.isFormVisible = true;

    // First reset the form to clear any previous values
    this.form.reset();

    // Then patch the form with the template data
    this.form.patchValue({
      id: providerTemplate.id,
      authType: providerTemplate.authType,
      name: providerTemplate.name,
      pathUserInfo: providerTemplate.pathUserInfo,
      uriBaseAuth: providerTemplate.uriBaseAuth,
      description: providerTemplate.description,
    });

    // Handle OAuth2Config if it exists
    if (providerTemplate.oAuth2Config) {
      this.form.get('oAuth2Config')?.patchValue({
        pathAuthorize: providerTemplate.oAuth2Config.pathAuthorize,
        pathAccessToken: providerTemplate.oAuth2Config.pathAccessToken,
        scope: providerTemplate.oAuth2Config.scope,
        postType: providerTemplate.oAuth2Config.postType,
        redirectUri: providerTemplate.oAuth2Config.redirectUri
      });
    }

    // Ensure validators are applied after setting values
    this.updateValidatorsBasedOnType(providerTemplate.authType);
  }

  // フォームを閉じる
  closeForm() {
    this.isFormVisible = false;
    this.form.reset();
    this.initForm();
  }

  // プロバイダーテンプレートの削除
  deleteProvider(id: string) {
    if (confirm('Are you sure you want to delete this provider template?')) {
      this.extApiProviderService.deleteApiProviderTemplate(id).subscribe({
        next: () => {
          console.log('API Provider Template deleted successfully');
          this.loadProviderTemplates();
          if (this.form.value.id === id) {
            this.closeForm();
          }
        },
        error: (error) => {
          console.error('Error deleting API Provider Template:', error);
        }
      });
    }
  }

  // テンプレートの登録・更新
  register() {
    if (this.form.invalid) {
      // Mark all fields as touched to show validation errors
      Object.keys(this.form.controls).forEach(key => {
        const control = this.form.get(key);
        if (control instanceof FormGroup) {
          Object.keys(control.controls).forEach(subKey => {
            control.get(subKey)?.markAsTouched();
          });
        } else {
          control?.markAsTouched();
        }
      });
      return;
    }

    const formValue = this.form.value;
    const apiProviderTemplate: MakeOptional<ExtApiProviderTemplateEntity, BaseEntityFields> = {
      id: formValue.id,
      authType: formValue.authType,
      name: formValue.name,
      pathUserInfo: formValue.pathUserInfo,
      uriBaseAuth: formValue.uriBaseAuth,
      description: formValue.description
    };

    // Only add OAuth2Config if authType is OAuth2
    if (formValue.authType === ExtApiProviderAuthType.OAuth2 && formValue.oAuth2Config) {
      apiProviderTemplate.oAuth2Config = {
        pathAuthorize: formValue.oAuth2Config.pathAuthorize,
        pathAccessToken: formValue.oAuth2Config.pathAccessToken,
        scope: formValue.oAuth2Config.scope,
        postType: formValue.oAuth2Config.postType,
        redirectUri: formValue.oAuth2Config.redirectUri
      };
    }

    if (this.isEditMode) {
      // 更新処理
      this.extApiProviderService.updateApiProviderTemplate(apiProviderTemplate as ExtApiProviderTemplateEntity).subscribe({
        next: (response) => {
          console.log('API Provider Template updated successfully:', response);
          this.loadProviderTemplates();
          this.closeForm();
        },
        error: (error) => {
          console.error('Error updating API Provider Template:', error);
        }
      });
    } else {
      // 新規登録処理 
      this.extApiProviderService.createApiProviderTemplate(apiProviderTemplate).subscribe({
        next: (response) => {
          console.log('API Provider Template created successfully:', response);
          this.loadProviderTemplates();
          this.closeForm();
        },
        error: (error) => {
          console.error('Error creating API Provider Template:', error);
        }
      });
    }
  }

  // Get error message for a form control
  getErrorMessage(controlName: string, groupName?: string): string {
    const control = groupName
      ? this.form.get(groupName)?.get(controlName)
      : this.form.get(controlName);

    if (control?.errors?.['required']) {
      return 'This field is required';
    }
    return '';
  }

  // Check if a control has an error and has been touched
  hasError(controlName: string, groupName?: string): boolean {
    const control = groupName
      ? this.form.get(groupName)?.get(controlName)
      : this.form.get(controlName);

    return !!control?.invalid && !!control?.touched;
  }
}