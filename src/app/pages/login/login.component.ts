import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
// import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs/operators';

import { environment } from '../../../environments/environment';
import { ExtApiProviderAuthType, ExtApiProviderEntity } from '../../models/models';
// import { DialogComponent } from '../../parts/dialog/dialog.component';
import { AuthService } from '../../services/auth.service';
import { ConfigKeys, UserService } from '../../services/user.service';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { GService } from '../../services/g.service';
import { LoggerService } from '../../services/logger';

@Component({
  selector: 'app-login',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatSnackBarModule, MatCardModule, /* MatDialogModule, */ TranslateModule, MatIconModule,
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

  errorMessageList: string[] = [];
  hidePassword = true;
  hidePasswordConfirm = true;
  isSubmitting = false;
  selectedLanguage: ConfigKeys.Language = 'auto';
  selectedTheme: ConfigKeys.Theme = 'light';

  curEnv = environment;

  readonly authService: AuthService = inject(AuthService);
  readonly userService: UserService = inject(UserService);
  readonly formBuilder: FormBuilder = inject(FormBuilder);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  // readonly dialog: MatDialog = inject(MatDialog);
  readonly g: GService = inject(GService);
  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);
  readonly logger: LoggerService = inject(LoggerService);
  readonly translate: TranslateService = inject(TranslateService);

  apiProviderKeys: string[] = [];
  apiProviderGroupedList: { [type: string]: ExtApiProviderEntity[] } = {};
  readonly firstView = `chat`;

  ngOnInit(): void {
    document.title = this.translate.instant('APP_TITLE');

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
        this.logger.debug('API provider list loaded:', apiProviderList);
      },
      error: (error) => {
        this.logger.error('Failed to fetch API providers:', error);
        this.snackBar.open(this.translate.instant('API_PROVIDER_FETCH_ERROR'), 'close', { duration: 3000 });
      },
      complete: () => {
        this.logger.debug('API provider fetch completed');
      }
    });

    const onetimeToken = this.activatedRoute.snapshot.paramMap.get('onetimeToken');
    if (onetimeToken) {
      // ワンタイムトークンが設定されていたらパスワードリセット
      this.loginState = 'password-reset';
      this.authService.onetimeLogin('passwordReset', onetimeToken).subscribe({
        next: next => {
          this.logger.debug('Onetime login response:', next);
        },
        error: error => {
          alert(this.translate.instant('INVALID_LINK_ALERT'));
          this.router.navigate([`${this.g.isMobilePrefix}login`]);
        }
      });
    } else {
      // 認証トークンが生きてたら自動ログイン
      this.authService.getUser().subscribe({
        next: next => {
          this.logger.info('User authenticated, redirecting to main view:', next);
          this.router.navigate([`${this.g.isMobilePrefix}${this.firstView}`]);
        },
        error: error => {
          // 未ログイン
          this.logger.debug('User not authenticated:', error);
        },
        complete: () => {
          this.logger.debug('Authentication check completed');
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

    // 未ログインでも選べる表示用の初期値
    this.selectedLanguage = this.userService.language || 'auto';
    this.selectedTheme = this.userService.theme || 'light';
  }

  onSubmit(): void {
    this.logger.debug('Login form submitted:', { email: this.loginForm.value.email });

    if (this.loginForm.valid) {
      this.isSubmitting = true;
      this.authService.login(this.loginForm.value.email || '', this.loginForm.value.password || '')
        .pipe(finalize(() => this.isSubmitting = false))
        .subscribe({
        next: (user) => {
          this.logger.info('Login successful, redirecting:', user);
          // ログイン前に選択したテーマ/言語を保存（任意・失敗しても遷移継続）
          this.userService.saveSetting(this.selectedTheme, this.userService.enterMode, this.userService.historyCloseMode, this.selectedLanguage).subscribe({
            next: () => {},
            error: () => {}
          });
          this.router.navigate([`${this.g.isMobilePrefix}${this.firstView}`]);
        },
        error: (error) => {
          this.errorMessageList = [this.translate.instant('AUTHENTICATION_FAILED')];
          this.logger.error('Login failed:', error);
        },
      });
    } else {
      this.logger.warn('Login form is invalid');
    }
  }

  changeLanguage(lang: ConfigKeys.Language): void {
    this.selectedLanguage = lang;
    this.userService.language = lang;
    const useLang = lang === 'auto' ? this.translate.getBrowserLang() || 'en' : lang;
    this.translate.use(useLang);
            }

  toggleTheme(): void {
    const order: ConfigKeys.Theme[] = ['system', 'light', 'dark'];
    const currentIndex = Math.max(0, order.indexOf(this.selectedTheme));
    const next = order[(currentIndex + 1) % order.length];
    this.selectedTheme = next;
    this.userService.applyTheme(next);
    this.userService.theme = next;
  }

  guestLogin(): void {
    this.isSubmitting = true;
    this.authService.guestLogin()
      .pipe(finalize(() => this.isSubmitting = false))
      .subscribe({
      next: user => {
        this.logger.info('Guest login successful, redirecting:', user);
        this.userService.saveSetting(this.selectedTheme, this.userService.enterMode, this.userService.historyCloseMode, this.selectedLanguage).subscribe({
          next: () => {},
          error: () => {}
        });
        this.router.navigate([`${this.g.isMobilePrefix}${this.firstView}`]);
      },
      error: (error) => {
        this.errorMessageList = [this.translate.instant('AUTHENTICATION_FAILED')];
        this.logger.error('Guest login failed:', error);
      },
    });
  }

  onSend(): void {
    this.logger.debug('Password reset email send requested:', { email: this.sendMailForm.value.email });

    if (this.sendMailForm.valid) {
      this.authService.requestForPasswordReset(this.sendMailForm.value.email).subscribe({
        next: (user) => {
          this.logger.info('Password reset email sent successfully:', user);
          this.loginState = 'sendmailfine';
        },
        error: (error) => {
          this.snackBar.open(`${this.translate.instant('INVALID_EMAIL')}\n${JSON.stringify(error)}`, 'close', { duration: 3000 });
          this.logger.error('Password reset email send failed:', error);
        },
      });
    } else {
      this.logger.warn('Password reset form is invalid');
    }
  }

  onReset(): void {
    const password = this.passwordResetForm.value.password;
    this.errorMessageList = [];
    if (this.passwordResetForm.value.password === this.passwordResetForm.value.passwordConfirm) {
    } else {
      this.errorMessageList.push(this.translate.instant('PASSWORD_MISMATCH'));
      return;
    }
    if (password.length >= 15) {
    } else {
      this.errorMessageList.push(this.translate.instant('PASSWORD_TOO_SHORT'));
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase) {
      this.errorMessageList.push(this.translate.instant('PASSWORD_NEEDS_UPPERCASE'));
    }
    if (!hasLowerCase) {
      this.errorMessageList.push(this.translate.instant('PASSWORD_NEEDS_LOWERCASE'));
    }
    if (!hasNumbers) {
      this.errorMessageList.push(this.translate.instant('PASSWORD_NEEDS_NUMBER'));
    }
    if (!hasSpecialChar) {
      this.errorMessageList.push(this.translate.instant('PASSWORD_NEEDS_SPECIAL_CHAR'));
    }

    if (this.errorMessageList.length == 0) {
    } else {
      return;
    }

    this.authService.passwordReset(this.passwordResetForm.value.password, this.passwordResetForm.value.passwordConfirm).subscribe({
      next: (resDto) => {
        this.logger.info('Password reset successful, redirecting:', resDto);
        this.router.navigate([`${this.g.isMobilePrefix}${this.firstView}`]);
      },
      error: (error) => {
        this.logger.error('Password reset failed:', error);
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
