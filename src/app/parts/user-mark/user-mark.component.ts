import { AuthService } from './../../services/auth.service';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { PredictHistoryComponent } from '../predict-history/predict-history.component';
import { MatDividerModule } from '@angular/material/divider';
import { UserSettingDialogComponent } from '../user-setting-dialog/user-setting-dialog.component';
import { ApiKeyManagerDialogComponent } from '../api-key-manager-dialog/api-key-manager-dialog.component';
@Component({
  selector: 'app-user-mark',
  imports: [CommonModule, MatMenuModule, MatDividerModule, MatIconModule, MatButtonModule],
  templateUrl: './user-mark.component.html',
  styleUrl: './user-mark.component.scss'
})
export class UserMarkComponent {

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
