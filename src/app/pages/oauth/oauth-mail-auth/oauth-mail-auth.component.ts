import { Component, inject } from '@angular/core';
import { AuthService } from '../../../services/auth.service';
import { FormBuilder, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { GService } from '../../../services/g.service';

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

  pincode: string = '';

  ngOnInit(): void {
    const onetimeToken = this.activatedRoute.snapshot.paramMap.get('onetimeToken');
    if (onetimeToken) {
      // ワンタイムトークンが設定されていたらパスワードリセット
      // this.loginState = 'password-reset';
      this.authService.onetimeLogin('oauth2MailAuth', onetimeToken).subscribe({
        next: next => {
          console.log(next);
          this.submit();
        },
        error: error => {
          alert('このリンクは無効です。初めからやり直してください。');
          this.router.navigate(['/login']);
        }
      });
    } else {
      alert('このリンクは無効です。初めからやり直してください。');
      this.router.navigate(['/login']);
    }
  }

  submit(): void {
    this.authService.postPincode(this.pincode).subscribe({
      next: next => {
        console.log(next);
        if (this.pincode) {
        } else {
          // 自動認証の場合はメッセージを出す。
          this.snackBar.open('自動認証されました。認証コードは不要になりました。', 'OK');
        }
        this.router.navigate(['/home']);
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
