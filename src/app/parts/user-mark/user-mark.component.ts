import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule } from '@ngx-translate/core';
import { GService } from '../../services/g.service';
import { ApiKeyManagerDialogComponent } from '../api-key-manager-dialog/api-key-manager-dialog.component';
import { PredictHistoryComponent } from '../predict-history/predict-history.component';
import { UserSettingDialogComponent } from '../user-setting-dialog/user-setting-dialog.component';
import { AuthService } from './../../services/auth.service';
@Component({
  selector: 'app-user-mark',
  imports: [CommonModule, MatMenuModule, MatDividerModule, MatIconModule, MatButtonModule, TranslateModule],
  templateUrl: './user-mark.component.html',
  styleUrl: './user-mark.component.scss'
})
export class UserMarkComponent {

  readonly g: GService = inject(GService);
  readonly authService: AuthService = inject(AuthService);
  readonly dialog: MatDialog = inject(MatDialog);

  openHistory(): void {
    this.dialog.open(PredictHistoryComponent);
  }

  openUserSetting(): void {
    this.dialog.open(UserSettingDialogComponent);
  }

  openApiKeyManager(): void {
    this.dialog.open(ApiKeyManagerDialogComponent);
  }
}

@Component({
  selector: 'app-user-settings',
  imports: [CommonModule, MatMenuModule, MatDividerModule, MatIconModule, MatButtonModule, TranslateModule],
  templateUrl: './user-settings.component.html',
  styleUrl: './user-mark.component.scss'
})
export class UserSettingsComponent extends UserMarkComponent { }
