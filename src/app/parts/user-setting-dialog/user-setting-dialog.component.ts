import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AnimationService } from '../../services/animation.service';
import { UserService } from '../../services/user.service';
import { BaseDialogComponent } from '../../shared/base/base-dialog.component';

declare var _paq: any;

export interface UserSettingData { }

export interface UserSettingResult {
  needsReload: boolean;
}

@Component({
  selector: 'app-user-setting-dialog',
  imports: [CommonModule,
    MatDialogModule, MatDividerModule, MatSlideToggleModule, MatButtonModule, MatRadioModule, MatButtonToggleModule,
    TranslateModule,
  ],
  templateUrl: './user-setting-dialog.component.html',
  styleUrl: './user-setting-dialog.component.scss'
})
export class UserSettingDialogComponent extends BaseDialogComponent<UserSettingData, UserSettingResult> {

  readonly animationService: AnimationService = inject(AnimationService);
  readonly userService: UserService = inject(UserService);
  readonly translate: TranslateService = inject(TranslateService);

  isAnimationEnabled$ = this.animationService.animationEnabled$;
  needsReload = false;
  current = false;
  theme: 'system' | 'dark' | 'light';
  enterMode: 'Enter' | 'Ctrl+Enter';
  historyCloseMode: 0 | 1 | 2;
  language: 'auto' | 'ja' | 'en' | 'zh';

  constructor() {
    super();
    this.enterMode = this.userService.enterMode;
    this.theme = this.userService.theme;
    this.language = this.userService.language;
    this.historyCloseMode = this.userService.historyCloseMode;
    this.animationService.animationEnabled$.subscribe(enabled => {
      this.current = enabled;
    });

    this.dialogRef.beforeClosed().subscribe(() => {
      if (this.needsReload) {
      } else {
        // キャンセルしたときにテーマと言語を元に戻す
        this.userService.applyTheme(this.userService.theme);
        const savedLanguage = this.userService.language === 'auto' ? this.translate.getBrowserLang() || 'en' : this.userService.language;
        this.translate.use(savedLanguage);
      }
    });
  }

  toggleAnimation(event: MatSlideToggleChange) {
    _paq.push(['trackEvent', this.translate.instant('USER_SETTINGS'), this.translate.instant('ANIMATION_TOGGLE'), this.current]);
    this.needsReload = true;
    this.current = event.checked;
  }

  toggleTheme(event: MatButtonToggleChange) {
    _paq.push(['trackEvent', this.translate.instant('USER_SETTINGS'), this.translate.instant('THEME_TOGGLE'), event.value]);
    this.theme = event.value;
    this.userService.applyTheme(event.value);
  }

  toggleEnterMode(event: MatRadioChange) {
    this.enterMode = event.value;
  }

  toggleHistoryCloseMode(event: MatRadioChange) {
    this.historyCloseMode = event.value;
  }

  toggleLanguage(event: MatButtonToggleChange) {
    _paq.push(['trackEvent', this.translate.instant('USER_SETTINGS'), this.translate.instant('LANGUAGE_SETTING'), event.value]);
    this.language = event.value;
    // 言語変更は即座に適用して確認できるようにする
    this.translate.use(event.value === 'auto' ? this.translate.getBrowserLang() || 'en' : event.value);
  }

  saveAndClose() {
    if (this.needsReload) {
      if (confirm(this.translate.instant('CONFIRM_RELOAD_FOR_SETTINGS'))) {
        this.executeAsync(async () => {
          return this.userService.saveSetting(this.theme, this.enterMode, this.historyCloseMode, this.language).toPromise();
        }).then(success => {
          if (success) {
            _paq.push(['trackEvent', this.translate.instant('USER_SETTINGS'), this.translate.instant('ANIMATION_SETTINGS_SAVED'), this.current]);
            this.animationService.toggleAnimation(this.current);
            this.close({ needsReload: true });
            window.location.reload();
          }
        });
      }
    } else {
      this.executeAsync(async () => {
        return this.userService.saveSetting(this.theme, this.enterMode, this.historyCloseMode, this.language).toPromise();
      }).then(success => {
        if (success) {
          this.close({ needsReload: false });
        }
      });
    }
  }
}
