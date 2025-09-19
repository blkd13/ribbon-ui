import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs/operators';
import { NewFeatureDialogComponent } from './parts/new-feature-dialog/new-feature-dialog.component';
import { UserSettingsComponent } from "./parts/user-mark/user-mark.component";
import { AnnouncementsService } from './services/announcements.service';
import { AuthService } from './services/auth.service';
import { GService, Lang, Locale } from './services/g.service';
import { LoggerService } from './services/logger';
import { UserSettingService } from './services/user-setting.service';
import { UserService } from './services/user.service';

declare var _paq: any;

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    MatIconModule,
    MatDialogModule,
    TranslateModule,
    UserSettingsComponent,
    CommonModule,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  isChecked = false;
  showInfo = true;
  readonly authService: AuthService = inject(AuthService);
  readonly userService: UserService = inject(UserService);
  readonly translateService: TranslateService = inject(TranslateService);
  readonly g: GService = inject(GService);
  readonly router: Router = inject(Router);
  readonly announcementsService: AnnouncementsService = inject(AnnouncementsService);
  readonly userSettingService: UserSettingService = inject(UserSettingService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly logger: LoggerService = inject(LoggerService);

  private readonly swUpdate: SwUpdate = inject(SwUpdate);
  private readonly snackBar: MatSnackBar = inject(MatSnackBar);

  title = this.translateService.instant('APP_TITLE');
  isLoginpage = false;

  constructor() {
  }

  ngOnInit(): void {
    this.initializeApp();
    this.setupPwaUpdateCheck();

    // matomo
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        _paq.push(['setCustomUrl', event.urlAfterRedirects]);
        _paq.push(['trackPageView']);
        console.log('Tracking page view:', event.urlAfterRedirects);
        this.isLoginpage = event.urlAfterRedirects.endsWith('/login');
      }
    });
  }

  private initializeApp(): void {
    let userLang = this.translateService.getBrowserLang() as Locale || 'ja-JP';
    // userLang = 'ja-JP';
    // userLang = 'en-US';
    // userLang = 'zh-CN';
    this.g.lang = userLang.split('-')[0] as Lang;
    this.g.locale = userLang as Locale;
    this.translateService.setDefaultLang(this.g.lang);
    this.authService.isAuthorized().subscribe({
      next: next => {
        /* matomoにUserIDを送る */
        _paq.push(['setUserId', next.id]);

        this.g.info.user = next;
        this.g.info$.next({ user: next });

        this.userService.getUserSetting().subscribe({
          next: next => {
            // ユーザーの言語設定を適用
            const savedLanguage = this.userService.language;
            if (savedLanguage && savedLanguage !== 'auto') {
              this.translateService.use(savedLanguage);
              this.g.lang = savedLanguage.split('-')[0] as Lang;
              this.g.locale = savedLanguage as Locale;
            }
            this.isChecked = true;
            this.checkForUnreadAnnouncements();
          },
          error: error => {
            this.isChecked = true;
          },
          complete: () => {
            // this.logger.debug('complete');
          }
        });
      },
      error: error => {
        this.isChecked = true;
      },
      complete: () => {
        // this.logger.debug('complete');
      }
    });
  }

  private checkForUnreadAnnouncements(): void {
    this.userSettingService.getUnreadAnnouncements().subscribe(
      unreadIds => {
        if (unreadIds.length > 0) {
          this.showNewFeatureDialog();
        }
      },
      error => {
        this.logger.error('Failed to check unread announcements:', error);
      }
    );
  }

  private showNewFeatureDialog(): void {
    this.dialog.open(NewFeatureDialogComponent, {
      width: '600px',
      disableClose: true
    });
  }

  isUpdated = false;
  reload(): void {
    window.location.reload();
  }

  private setupPwaUpdateCheck(): void {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(evt => {
          const snack = this.snackBar.open(this.translateService.instant('UPDATE_AVAILABLE'), this.translateService.instant('UPDATE'), {
            duration: 6000,
          });
          this.isUpdated = true;
          snack.onAction().subscribe(() => {
            this.reload();
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
