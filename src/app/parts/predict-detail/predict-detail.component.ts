import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DepartmentService, PredictTransaction } from './../../services/department.service';
import { AuthService } from './../../services/auth.service';
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-predict-detail',
  imports: [
    CommonModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MarkdownModule,
  ],
  templateUrl: './predict-detail.component.html',
  styleUrl: './predict-detail.component.scss'
})
export class PredictDetailComponent implements OnInit {

  readonly dialogRef: MatDialogRef<PredictDetailComponent> = inject(MatDialogRef<PredictDetailComponent>);
  readonly data = inject<{ predict: PredictTransaction, userId?: string }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly authService: AuthService = inject(AuthService);

  predict?: PredictTransaction;
  predictDetail?: PredictDetail;
  isLoading = false;
  selectedTabIndex = 0;

  ngOnInit(): void {
    this.predict = this.data.predict;
    this.loadPredictDetail();
  }

  loadPredictDetail(): void {
    if (!this.predict) return;

    this.isLoading = true;
    const userId = this.data.userId;

    if (userId) {
      // 部門メンバーの詳細を取得
      this.departmentService.getPredictJournal(this.predict.idempotency_key, this.predict.args_hash, 'request').subscribe({
        next: (response) => {
          this.predictDetail = response;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading predict detail:', error);
          this.snackBar.open('詳細データの取得に失敗しました', '閉じる', { duration: 3000 });
          this.isLoading = false;
        }
      });
    } else {
      // 自分の詳細を取得
      this.departmentService.getPredictJournal(this.predict.idempotency_key, this.predict.args_hash, 'request').subscribe({
        next: (response) => {
          this.predictDetail = response;
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error loading predict detail:', error);
          this.snackBar.open('詳細データの取得に失敗しました', '閉じる', { duration: 3000 });
          this.isLoading = false;
        }
      });
    }
  }

  formatJson(data: any): string {
    let formattedData: string = '';
    if (!data) return '';
    if (typeof data === 'string') {
      try {
        formattedData = `\`\`\`json\n${JSON.stringify(JSON.parse(data), null, 2)}\n\`\`\`\n`;
      } catch {
        formattedData = data;
      }
    } else {
      formattedData = `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
    }
    return formattedData;
  }

  formatJsonl(data: any): string {
    if (!data) return '';
    if (typeof data === 'string') {
      // JSONLの場合、各行を整形
      try {
        return '```json\n' + data.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.stringify(JSON.parse(line), null, 2))
          .join('\n---\n') + '\n```';
      } catch {
        return data;
      }
    }
    return '```json\n' + JSON.stringify(data, null, 2) + '\n```';
  }

  copyToClipboard(text: string, type: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open(`${type}をクリップボードにコピーしました`, '閉じる', { duration: 2000 });
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      this.snackBar.open('コピーに失敗しました', '閉じる', { duration: 2000 });
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}

interface PredictDetail {
  request: any;
  stream: any;
  response: any;
}