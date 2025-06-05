// api-key-manager.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { AuthService, OAuthAccount } from '../../services/auth.service';
import { ExtApiProviderAuthType, ExtApiProviderEntity } from '../../models/models';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { GService } from '../../services/g.service';


@Component({
  selector: 'app-api-key-manager-dialog',
  imports: [
    CommonModule, FormsModule,
    ReactiveFormsModule, MatButtonModule, MatCardModule, MatDialogModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatSnackBarModule, MatIconModule, MatTableModule,],
  templateUrl: './api-key-manager-dialog.component.html',
  styleUrl: './api-key-manager-dialog.component.scss'
})
export class ApiKeyManagerDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  readonly g: GService = inject(GService);
  readonly authServices: AuthService = inject(AuthService);
  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);

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
        // console.log(this.apiProviderGroupedList);
        console.log(apiProviderList);
      },
      error: (error) => {
        console.log(error);
        this.snackBar.open(`APIプロバイダの取得に失敗しました。`, 'close', { duration: 3000 });
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
        console.log('complete');
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
        this.snackBar.open('API鍵の取得に失敗しました', '閉じる', { duration: 3000 });
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
      this.snackBar.open('ラベルを入力してください', '閉じる', { duration: 3000 });
      return;
    }
    if (this.apiKeys.find(key => key.provider === `local-${this.apiLabelForm.value.label}`)) {
      this.snackBar.open(`${this.apiLabelForm.value.label}\n既に同名のAPI鍵が存在します。別のラベルを入力してください。`, '閉じる', { duration: 3000 });
      return;
    } else { }
    this.authServices.genApiKey(this.apiLabelForm.value.label).subscribe({
      next: next => {
        this.dialog.open(ApiKeyDialogComponent, { data: { apiKey: next.apiToken } });
        this.loadApiKeys();
      },
      error: error => {
        this.snackBar.open('API鍵の生成に失敗しました', '閉じる', { duration: 3000 });
      },
    });
  }

  onSubmit(): void {
    if (this.apiKeyForm.valid) {
      const formValue = { provider: this.apiKeyForm.value.provider, accessToken: this.apiKeyForm.value.key };

      // TODO ここはいけてない。メッセージをsnackbarじゃなくて画面に載せた方が良い。
      this.authServices.registApiKey(formValue as any).subscribe({
        next: next => {
          this.snackBar.open('API鍵を登録しました', '閉じる', {
            duration: 10000
          });
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
          this.snackBar.open(JSON.stringify(error), '閉じる', {
            duration: 10000
          });
        }
      });
    }
  }

  deleteApiKey(key: OAuthAccount): void {
    if (confirm(`${key.provider}のAPI鍵を削除してもよろしいですか？`)) {
      this.authServices.deleteApiKey(key.provider, key.id).subscribe({
        next: next => {
          // TODO: APIサービスでの削除処理に置き換え
          this.apiKeys = this.apiKeys.filter(k => k.id !== key.id);

          this.snackBar.open('API鍵を削除しました', '閉じる', { duration: 3000 });
          this.loadApiKeys();
        }
      });
    }
  }
}

@Component({
  selector: 'app-api-key-dialog',
  imports: [
    CommonModule,
    MatButtonModule, MatIconModule, MatTableModule,
    MatDialogModule, MatSnackBarModule,
  ],
  template: `
    <h2 mat-dialog-title>APIキー</h2>
    <mat-dialog-content>
      <div style="display: flex; align-items: center;">
        <input readonly [value]="data.apiKey" style="width: 800px; background: black; font-size: 18pt; padding: 8px;"/>
        <button mat-icon-button (click)="copyToClipboard()" class="m-5">
          <mat-icon>content_copy</mat-icon>
        </button>
      </div>
      <p>API鍵はこの画面を一度閉じると二度と表示されません。</p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button mat-dialog-close>閉じる</button>
    </mat-dialog-actions>
  `,
})
export class ApiKeyDialogComponent implements OnInit {
  readonly data = inject<{ apiKey: string }>(MAT_DIALOG_DATA);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void { }

  copyToClipboard(): void {
    navigator.clipboard.writeText(this.data.apiKey).then(() => {
      this.snackBar.open('APIキーをコピーしました', '閉じる', { duration: 2000 });
    });
  }
}
