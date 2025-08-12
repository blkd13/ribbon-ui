// api-key-manager.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ExtApiProviderAuthType, ExtApiProviderEntity } from '../../models/models';
import { AuthService, OAuthAccount } from '../../services/auth.service';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { GService } from '../../services/g.service';
import { LoggerService } from '../../services/logger';
import { NotificationService } from '../../shared/services/notification.service';


@Component({
  selector: 'app-api-key-manager-dialog',
  imports: [
    CommonModule, FormsModule, TranslateModule,
    ReactiveFormsModule, MatButtonModule, MatCardModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatSnackBarModule, MatIconModule, MatTableModule,],
  templateUrl: './api-key-manager-dialog.component.html',
  styleUrl: './api-key-manager-dialog.component.scss'
})
export class ApiKeyManagerDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private notificationService = inject(NotificationService);
  private dialog = inject(MatDialog);
  readonly g: GService = inject(GService);
  readonly authServices: AuthService = inject(AuthService);
  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);
  readonly translate: TranslateService = inject(TranslateService);
  readonly logger = inject(LoggerService);

  apiLabelForm!: FormGroup;
  apiKeyForm!: FormGroup;
  hideKey = true;

  firstProviderValue: string = '';

  apiProviderMap: { [key: string]: ExtApiProviderEntity } = {};
  apiProviderGroupedKeys: string[] = [];
  apiProviderGroupedList: { [type: string]: ExtApiProviderEntity[] } = {};

  apiKeys: OAuthAccount[] = [];
  // displayedColumns: string[] = ['provider', 'label', 'createdAt', 'updatedAt', 'actions'];
  displayedColumns: string[] = ['provider', 'createdAt', 'updatedAt', 'actions'];

  constructor() {
    this.apiLabelForm = this.fb.group({
      label: ['', Validators.required]
    });

    this.extApiProviderService.getApiProviders(true).subscribe({
      next: (apiProviderList) => {
        this.apiProviderMap = apiProviderList.reduce((acc: { [key: string]: ExtApiProviderEntity }, apiProvider: ExtApiProviderEntity) => {
          acc[`${apiProvider.type}-${apiProvider.name}`] = apiProvider;
          return acc;
        }, {});
        this.apiProviderGroupedList = apiProviderList.filter(obj => obj.authType === ExtApiProviderAuthType.APIKey).reduce((acc: { [type: string]: ExtApiProviderEntity[] }, apiProvider: ExtApiProviderEntity) => {
          const type = apiProvider.type;
          if (!acc[type]) {
            this.apiProviderGroupedKeys.push(type);
            acc[type] = [];
          }
          acc[type].push(apiProvider);
          return acc;
        }, {});
        // this.logger.debug(this.apiProviderGroupedList);
        this.logger.debug(apiProviderList);
      },
      error: (error) => {
        this.logger.error(error);
        this.notificationService.showError(this.translate.instant('API_PROVIDER_FETCH_ERROR'));
      },
      complete: () => {
        if (this.apiProviderGroupedKeys.length === 0) {
          // this.snackBar.open('APIプロバイダが登録されていません。', '閉じる', { duration: 3000 });
          return;
        }
        const apiProvider0 = this.apiProviderGroupedList[this.apiProviderGroupedKeys[0]][0];
        this.firstProviderValue = `${apiProvider0.type}-${apiProvider0.name}`;

        this.apiKeyForm = this.fb.group({
          provider: [this.firstProviderValue, Validators.required],
          key: ['', Validators.required]
        });
        this.logger.debug('complete');
        this.loadApiKeys();
      }
    });
  }

  ngOnInit(): void {
  }

  loadApiKeys(): void {
    this.authServices.getOAuthAccountList().subscribe({
      next: next => {
        this.apiKeys = next.oauthAccounts;
        this.apiKeys.forEach(key => {
          key.label = key.label || this.apiProviderMap[key.provider] ? this.apiProviderMap[key.provider].label : key.provider;
        });
      },
      error: error => {
        this.notificationService.showError(this.translate.instant('API_KEY_FETCH_FAILED'));
      },
    });
  }

  labelFormat(element: OAuthAccount): string {
    if (element.provider.startsWith('local-')) {
      return `ribbon-ui(${element.label})`;
    } else {
      return element.label || element.provider;
    }
  }

  genAPIKey(): void {
    if (this.apiLabelForm.invalid || !this.apiLabelForm.value.label) {
      this.notificationService.showValidationError(this.translate.instant('ENTER_LABEL'));
      return;
    }
    if (this.apiKeys.find(key => key.provider === `local-${this.apiLabelForm.value.label}`)) {
      this.notificationService.showError(this.translate.instant('API_KEY_ALREADY_EXISTS', { label: this.apiLabelForm.value.label }));
      return;
    } else { }
    this.authServices.genApiKey(this.apiLabelForm.value.label).subscribe({
      next: next => {
        this.dialog.open(ApiKeyDialogComponent, { data: { apiKey: next.apiToken } });
        this.loadApiKeys();
      },
      error: error => {
        this.notificationService.showError(this.translate.instant('API_KEY_GENERATION_FAILED'));
      },
    });
  }

  onSubmit(): void {
    if (this.apiKeyForm.valid) {
      const formValue = { provider: this.apiKeyForm.value.provider, accessToken: this.apiKeyForm.value.key };

      // TODO ここはいけてない。メッセージをsnackbarじゃなくて画面に載せた方が良い。
      this.authServices.registApiKey(formValue as any).subscribe({
        next: next => {
          this.notificationService.showSuccess(this.translate.instant('API_KEY_REGISTERED'));
          this.loadApiKeys();
          // リセット時に初期値をセットすることで、バリデーションエラーを回避する
          this.apiKeyForm.reset({
            provider: this.firstProviderValue,
            key: ''
          });
          // フォームの状態をクリアする
          // this.apiKeyForm.markAsPristine();
          this.apiKeyForm.markAsUntouched();
        },
        error: error => {
          this.notificationService.showLongError(error, this.translate.instant('API_KEY_REGISTRATION_ERROR'));
        }
      });
    }
  }

  deleteApiKey(key: OAuthAccount): void {
    if (confirm(this.translate.instant('CONFIRM_DELETE_API_KEY', { provider: key.provider }))) {
      this.authServices.deleteApiKey(key.provider, key.id).subscribe({
        next: next => {
          // TODO: APIサービスでの削除処理に置き換え
          this.apiKeys = this.apiKeys.filter(k => k.id !== key.id);

          this.notificationService.showOperationResult(this.translate.instant('DELETE_API_KEY'), true);
          this.loadApiKeys();
        }
      });
    }
  }
}

@Component({
  selector: 'app-api-key-dialog',
  imports: [
    CommonModule, TranslateModule,
    MatButtonModule, MatIconModule, MatTableModule,
    MatDialogModule, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'API_KEY_DIALOG_TITLE' | translate }}</h2>
    <mat-dialog-content>
      <div style="display: flex; align-items: center;">
        <input readonly [value]="data.apiKey" style="width: 800px; background: black; font-size: 18pt; padding: 8px;"/>
        <button mat-icon-button (click)="copyToClipboard()" class="m-5">
          <mat-icon>content_copy</mat-icon>
        </button>
      </div>
      <p>{{ 'API_KEY_WARNING_MESSAGE' | translate }}</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button mat-dialog-close>{{ 'CLOSE' | translate }}</button>
    </mat-dialog-actions>
  `,
})
export class ApiKeyDialogComponent implements OnInit {
  readonly data = inject<{ apiKey: string }>(MAT_DIALOG_DATA);
  private notificationService = inject(NotificationService);
  private translate = inject(TranslateService);

  ngOnInit(): void { }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.data.apiKey).then(() => {
      this.notificationService.showCopySuccess(this.translate.instant('API_KEY_COPIED'));
    });
  }
}
