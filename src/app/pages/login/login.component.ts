import { Component } from '@angular/core';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';

import { AuthService } from '../../services/auth.service';
import { GService } from '../../services/g.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, MatSnackBarModule, MatCardModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {

  loginState: 'login' | 'password-reset' | 'sendmail' | 'sendmailfine' = 'login';

  loginForm!: FormGroup;
  sendMailForm!: FormGroup;
  passwordResetForm!: FormGroup;

  constructor(
    public g: GService,
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private snackBar: MatSnackBar,
  ) {
  }

  ngOnInit(): void {
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
          this.router.navigate(['/home']);
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
          this.router.navigate(['/home']);
        },
        error: (error) => {
          console.log(error);
        },
      });
    } else {
      console.log('invalid');
    }
  }

  onSend(): void {
    console.log(this.loginForm.value);

    if (this.sendMailForm.value.email) {
      this.authService.requestForPasswordReset(this.sendMailForm.value.email).subscribe({
        next: (user) => {
          console.log(user);
          this.loginState = 'sendmailfine';
        },
        error: (error) => {
          console.log(error);
        },
      });
    } else {
      console.log('invalid');
    }
  }

  errorMessageList: string[] = [];
  onReset(): void {
    const password = this.passwordResetForm.value.password;
    this.errorMessageList = [];
    if (this.passwordResetForm.value.password === this.passwordResetForm.value.passwordConfirm) {
    } else {
      this.errorMessageList.push('パスワードが一致していません。');
      return;
    }
    if (password.length >= 16) {
    } else {
      this.errorMessageList.push('パスワードは16文字以上にしてください。');
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
      this.errorMessageList.push('パスワードには少なくとも1つの特殊文字を含めてください。');
    }

    if (this.errorMessageList.length == 0) {
    } else {
      return;
    }

    this.authService.passwordReset(this.passwordResetForm.value.password, this.passwordResetForm.value.passwordConfirm).subscribe({
      next: (user) => {
        console.log(user);
        this.router.navigate(['/home']);
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
}
