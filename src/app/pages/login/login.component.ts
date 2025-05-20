import { Component, inject } from '@angular/core';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';

import { AuthService } from '../../services/auth.service';
import { GService } from '../../services/g.service';
import { CommonModule } from '@angular/common';
import { DialogComponent } from '../../parts/dialog/dialog.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../environments/environment';
import { MatExpansionModule } from '@angular/material/expansion';
import { ExtApiProviderAuthType, ExtApiProviderEntity } from '../../models/models';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { MatButtonModule } from '@angular/material/button';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-login',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatSnackBarModule, MatCardModule, MatDialogModule, TranslateModule, MatIconModule,
    MatExpansionModule, MatButtonModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  loginState: 'login' | 'password-reset' | 'sendmail' | 'sendmailfine' = 'login';

  loginForm!: FormGroup;
  sendMailForm!: FormGroup;
  passwordResetForm!: FormGroup;

  firstView = '/home';

  errorMessageList: string[] = [];
  hidePassword = true;
  hidePasswordConfirm = true;

  curEnv = environment;

  readonly authService: AuthService = inject(AuthService);
  readonly userService: UserService = inject(UserService);
  readonly formBuilder: FormBuilder = inject(FormBuilder);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly g: GService = inject(GService);
  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);

  apiProviderKeys: string[] = [];
  apiProviderGroupedList: { [type: string]: ExtApiProviderEntity[] } = {};

  ngOnInit(): void {
    document.title = `Ribbon UI`;

    this.extApiProviderService.getApiProvidersNonAuth(this.g.orgKey).subscribe({
      next: (apiProviderList) => {
        this.apiProviderGroupedList = apiProviderList.filter(obj => obj.authType === ExtApiProviderAuthType.OAuth2).reduce((acc: { [type: string]: ExtApiProviderEntity[] }, apiProvider: ExtApiProviderEntity) => {
          const type = apiProvider.type;
          if (!acc[type]) {
            this.apiProviderKeys.push(type);
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
        console.log('complete');
      }
    });

    const onetimeToken = this.activatedRoute.snapshot.paramMap.get('onetimeToken');
    if (onetimeToken) {
      // ワンタイムトークンが設定されていたらパスワードリセット
      this.loginState = 'password-reset';
      this.authService.onetimeLogin('passwordReset', onetimeToken).subscribe({
        next: next => {
          console.log(next);
        },
        error: error => {
          alert('このリンクは無効です。初めからやり直してください。');
          this.router.navigate(['/login']);
        }
      });
    } else {
      // 認証トークンが生きてたら自動ログイン
      this.authService.getUser().subscribe({
        next: next => {
          console.log(next);
          this.router.navigate([this.firstView]);
        },
        error: error => {
          // 未ログイン
          // console.log(error);
        },
        complete: () => {
          // console.log('complete');
        }
      });
    }
    this.loginForm = this.formBuilder.group({
      email: ['', Validators.required],
      password: ['', Validators.required],
    });
    this.sendMailForm = this.formBuilder.group({
      email: ['', Validators.required],
    });
    this.passwordResetForm = this.formBuilder.group({
      password: ['', Validators.required],
      passwordConfirm: ['', Validators.required],
    });
  }

  onSubmit(): void {
    console.log(this.loginForm.value);

    if (this.loginForm.valid) {
      this.authService.login(this.loginForm.value.email || '', this.loginForm.value.password || '').subscribe({
        next: (user) => {
          console.log(user);
          this.router.navigate([this.firstView]);
        },
        error: (error) => {
          this.errorMessageList = ['認証に失敗しました。'];
          console.log(error);
        },
      });
    } else {
      console.log('invalid');
    }
  }

  guestLogin(): void {
    this.authService.guestLogin().subscribe({
      next: user => {
        console.log(user);
        this.dialog.open(DialogComponent, { data: { title: 'Alert', message: `ゲストモードは全ての履歴が他のゲストと共有されます。\n使い終わったらスレッドを消すようにしてください。`, options: ['OK', 'キャンセル'] } }).afterClosed().subscribe({
          next: next => {
            if (next === 0) {
              // OKならログイン
              this.router.navigate([this.firstView]);
            } else {
              // キャンセルならログアウト
              this.authService.logout();
            }
          }
        });
      },
      error: (error) => {
        this.errorMessageList = ['ゲストモードは現在停止中です。'];
        console.log(error);
      },
    });
  }

  onSend(): void {
    console.log(this.loginForm.value);

    if (this.sendMailForm.valid) {
      this.authService.requestForPasswordReset(this.sendMailForm.value.email).subscribe({
        next: (user) => {
          console.log(user);
          this.loginState = 'sendmailfine';
        },
        error: (error) => {
          this.snackBar.open(`無効なメールアドレスです。\n${JSON.stringify(error)}`, 'close', { duration: 3000 });
          console.log(error);
        },
      });
    } else {
      console.log('invalid');
    }
  }

  onReset(): void {
    const password = this.passwordResetForm.value.password;
    this.errorMessageList = [];
    if (this.passwordResetForm.value.password === this.passwordResetForm.value.passwordConfirm) {
    } else {
      this.errorMessageList.push('パスワードが一致していません。');
      return;
    }
    if (password.length >= 15) {
    } else {
      this.errorMessageList.push('パスワードは15文字以上にしてください。');
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase) {
      this.errorMessageList.push('パスワードには少なくとも1つの大文字を含めてください。');
    }
    if (!hasLowerCase) {
      this.errorMessageList.push('パスワードには少なくとも1つの小文字を含めてください。');
    }
    if (!hasNumbers) {
      this.errorMessageList.push('パスワードには少なくとも1つの数字を含めてください。');
    }
    if (!hasSpecialChar) {
      this.errorMessageList.push('パスワードには少なくとも1つの記号を含めてください。');
    }

    if (this.errorMessageList.length == 0) {
    } else {
      return;
    }

    this.authService.passwordReset(this.passwordResetForm.value.password, this.passwordResetForm.value.passwordConfirm).subscribe({
      next: (user) => {
        console.log(user);
        this.router.navigate([this.firstView]);
      },
      error: (error) => {
        console.log(error);
        if (error.error && Array.isArray(error.error.errors)) {
          this.errorMessageList = error.error.errors;
        } else {
          alert(JSON.stringify(error));
        }
        // this.snackBar.open(`${error.error.errors.join('\n')}`);
      },
    });
  }

  onChangeState(state: 'login' | 'password-reset' | 'sendmail' | 'sendmailfine'): void {
    this.loginState = state;
    this.errorMessageList = [];
    this.loginForm.reset();
    this.sendMailForm.reset();
    this.passwordResetForm.reset();
  }

  onGeneratePassword(): void {
    const password = this.generatePassword();
    this.passwordResetForm.patchValue({ password: password, passwordConfirm: password, });
    this.hidePassword = false;
    this.hidePasswordConfirm = false;
  }

  generatePassword(): string {
    const upperCaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerCaseChars = 'abcdefghijklmnopqrstuvwxyz';
    const numberChars = '0123456789';
    const specialChars = '!@#$%^&*(),.?":{}|<>';

    const allChars = upperCaseChars + lowerCaseChars + numberChars + specialChars;
    const passwordLength = 15;

    let password = '';

    // Ensure the password meets all requirements
    password += upperCaseChars.charAt(Math.floor(Math.random() * upperCaseChars.length));
    password += lowerCaseChars.charAt(Math.floor(Math.random() * lowerCaseChars.length));
    password += numberChars.charAt(Math.floor(Math.random() * numberChars.length));
    password += specialChars.charAt(Math.floor(Math.random() * specialChars.length));

    // Fill the rest of the password length with random characters
    for (let i = password.length; i < passwordLength; i++) {
      password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    // Shuffle the password to avoid predictable patterns
    password = password.split('').sort(() => 0.5 - Math.random()).join('');

    return password;
  }
}
