import { Component, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from './services/auth.service';
import { GService } from './services/g.service';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { filter } from 'rxjs/operators';
import { UserService } from './services/user.service';

declare var _paq: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'Ribbon UI';
  isChecked = false;
  showInfo = true;
  readonly authService: AuthService = inject(AuthService);
  readonly userService: UserService = inject(UserService);
  readonly translateService: TranslateService = inject(TranslateService);
  readonly g: GService = inject(GService);
  readonly router: Router = inject(Router);

  private readonly swUpdate: SwUpdate = inject(SwUpdate);
  private readonly snackBar: MatSnackBar = inject(MatSnackBar);

  constructor() {
    // v1.0からv2.0への移行
    const v1 = localStorage.getItem('settings-v1.0');
    if (v1 && JSON.parse(v1).model) {
      // localStorage.removeItem('settings-v1.0');
      localStorage.setItem('settings-v2.0', JSON.stringify([JSON.parse(v1)]));
    } else { }
  }

  ngOnInit(): void {
    this.initializeApp();
    this.setupPwaUpdateCheck();

    // matomo
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        _paq.push(['setCustomUrl', event.urlAfterRedirects]);
        _paq.push(['trackPageView']);
      }
    });

  }

  private initializeApp(): void {
    this.translateService.setDefaultLang('ja');
    this.g.autoRedirectToLoginPageIfAuthError = false;
    this.authService.getUser().subscribe({
      next: next => {
        this.g.autoRedirectToLoginPageIfAuthError = true;
        this.userService.getUserSetting().subscribe({
          next: next => {
            this.isChecked = true;
          },
          error: error => {
            this.isChecked = true;
          },
          complete: () => {
            // console.log('complete');
          }
        });
      },
      error: error => {
        this.g.autoRedirectToLoginPageIfAuthError = true;
        this.isChecked = true;
      },
      complete: () => {
        // console.log('complete');
      }
    });
  }

  private setupPwaUpdateCheck(): void {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(evt => {
          const snack = this.snackBar.open('更新が利用可能です', '更新', {
            duration: 6000,
          });

          snack.onAction().subscribe(() => {
            window.location.reload();
          });
        });

      // 1時間ごとに更新をチェック
      setInterval(() => {
        this.swUpdate.checkForUpdate();
      }, 1 * 60 * 60 * 1000);
    } else {
    }
  }
}