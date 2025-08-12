import { Component, inject } from '@angular/core';
import { AnimationService } from '../../services/animation.service';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { UserSettingService } from '../../services/user-setting.service';
import { UserService } from '../../services/user.service';
import { MatRadioChange, MatRadioModule } from '@angular/material/radio';
import { MatButtonToggleChange, MatButtonToggleModule } from '@angular/material/button-toggle';
import { BaseDialogComponent } from '../../shared/base/base-dialog.component';
import { TranslateService, TranslateModule } from '@ngx-translate/core';

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

  constructor() {
    super();
    this.enterMode = this.userService.enterMode;
    this.theme = this.userService.theme;
    this.historyCloseMode = this.userService.historyCloseMode;
    this.animationService.animationEnabled$.subscribe(enabled => {
      this.current = enabled;
    });

    this.dialogRef.beforeClosed().subscribe(() => {
      if (this.needsReload) {
      } else {
        // キャンセルしたときにテーマを元に戻す
        this.userService.applyTheme(this.userService.theme);
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

  saveAndClose() {
    if (this.needsReload) {
      if (confirm(this.translate.instant('CONFIRM_RELOAD_FOR_SETTINGS'))) {
        this.executeAsync(async () => {
          return this.userService.saveSetting(this.theme, this.enterMode, this.historyCloseMode).toPromise();
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
        return this.userService.saveSetting(this.theme, this.enterMode, this.historyCloseMode).toPromise();
      }).then(success => {
        if (success) {
          this.close({ needsReload: false });
        }
      });
    }
  }
}
