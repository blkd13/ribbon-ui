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

declare var _paq: any;

@Component({
  selector: 'app-user-setting-dialog',
  imports: [CommonModule, MatDialogModule, MatDividerModule, MatSlideToggleModule, MatButtonModule, MatRadioModule],
  templateUrl: './user-setting-dialog.component.html',
  styleUrl: './user-setting-dialog.component.scss'
})
export class UserSettingDialogComponent {

  readonly dialogRef: MatDialogRef<UserSettingDialogComponent> = inject(MatDialogRef<UserSettingDialogComponent>);
  readonly animationService: AnimationService = inject(AnimationService);
  readonly userService: UserService = inject(UserService);

  isAnimationEnabled$ = this.animationService.animationEnabled$;
  needsReload = false;
  current = false;

  enterMode!: 'Enter' | 'Ctrl+Enter';

  constructor() {
    this.enterMode = this.userService.enterMode;
    this.animationService.animationEnabled$.subscribe(enabled => {
      this.current = enabled;
    });
  }

  toggleAnimation(event: MatSlideToggleChange) {
    _paq.push(['trackEvent', 'ユーザー設定', 'アニメーション切替', this.current]);
    this.needsReload = true;
    this.current = event.checked;
  }

  toggleEnterMode(event: MatRadioChange) {
    this.enterMode = event.value;
  }

  saveAndClose() {
    if (this.needsReload) {
      if (confirm('設定を反映するにはページをリロードする必要があります。よろしいですか？')) {
        this.userService.setEnterMode(this.enterMode).subscribe({
          complete: () => {
            _paq.push(['trackEvent', 'ユーザー設定', 'アニメーション設定保存', this.current]);
            this.animationService.toggleAnimation(this.current);
            window.location.reload();
          }
        });
      } else { }
    } else {
      this.userService.setEnterMode(this.enterMode).subscribe({
        complete: () => {
          this.dialogRef.close();
        }
      });
    }
  }
}
