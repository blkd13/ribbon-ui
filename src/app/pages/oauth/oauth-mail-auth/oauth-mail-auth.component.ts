import { Component, inject } from '@angular/core';
import { FormBuilder, FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { GService } from '../../../services/g.service';
import { LoggerService } from '../../../services/logger';

@Component({
  selector: 'app-oauth-mail-auth',
  imports: [FormsModule],
  templateUrl: './oauth-mail-auth.component.html',
  styleUrl: './oauth-mail-auth.component.scss'
})
export class OAuthMailAuthComponent {
  readonly authService: AuthService = inject(AuthService);
  readonly formBuilder: FormBuilder = inject(FormBuilder);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly g: GService = inject(GService);
  readonly logger = inject(LoggerService);

  pincode: string = '';

  ngOnInit(): void {
    const onetimeToken = this.activatedRoute.snapshot.paramMap.get('onetimeToken');
    if (onetimeToken) {
      // ワンタイムトークンが設定されていたらパスワードリセット
      // this.loginState = 'password-reset';
      this.authService.onetimeLogin('oauth2MailAuth', onetimeToken).subscribe({
        next: next => {
          this.logger.debug(next);
          this.submit();
        },
        error: error => {
          this.logger.error(error);
          alert('このリンクは無効です。初めからやり直してください。');
          this.router.navigate(['/', 'login']);
        }
      });
    } else {
      // ワンタイムトークンが設定されていなかったらログイン
      alert('このリンクは無効です。初めからやり直してください。');
      this.router.navigate(['/', 'login']);
    }
  }

  submit(): void {
    this.authService.postPincode(this.pincode).subscribe({
      next: next => {
        this.logger.debug(next);
        if (this.pincode) {
        } else {
          // 自動認証の場合はメッセージを出す。
          this.snackBar.open('自動認証されました。認証コードは不要になりました。', 'OK');
        }
        this.router.navigate(['/', 'home']);
      },
      error: error => {
        if (this.pincode) {
          this.snackBar.open('認証コードが正しくありません。', 'OK');
          this.pincode = '';
        } else {
        }
      }
    });
  }
}
