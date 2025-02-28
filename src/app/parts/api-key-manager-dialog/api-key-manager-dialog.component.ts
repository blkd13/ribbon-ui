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
import { environment } from '../../../environments/environment';


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

  apiLabelForm: FormGroup;
  apiKeyForm: FormGroup;
  hideKey = true;

  providerGroups = environment.apiKeyProviders;

  readonly authServices: AuthService = inject(AuthService);

  apiKeys: OAuthAccount[] = [];
  // displayedColumns: string[] = ['provider', 'label', 'createdAt', 'updatedAt', 'actions'];
  displayedColumns: string[] = ['provider', 'createdAt', 'updatedAt', 'actions'];

  constructor() {
    this.apiLabelForm = this.fb.group({
      label: ['', Validators.required]
    });
    this.apiKeyForm = this.fb.group({
      provider: [this.providerGroups[0].value, Validators.required],
      key: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadApiKeys();
  }

  loadApiKeys(): void {
    this.authServices.getOAuthAccountList().subscribe({
      next: next => {
        this.apiKeys = next.oauthAccounts;
      },
    });
  }

  genAPIKey(): void {
    this.authServices.genApiKey(this.apiLabelForm.value.label).subscribe({
      next: next => {
        this.dialog.open(ApiKeyDialogComponent, { data: { apiKey: next.apiToken } });
        this.loadApiKeys();
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
            provider: this.providerGroups[0].value + (this.providerGroups[0].providers[0].id ? ('-' + this.providerGroups[0].providers[0].id) : ''),
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
      <p>API鍵はこの画面は一度閉じると二度と表示されません。</p>
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
