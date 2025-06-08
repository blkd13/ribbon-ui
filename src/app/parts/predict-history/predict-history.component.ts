import { AuthService } from './../../services/auth.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DepartmentMember, DepartmentService, PredictTransaction } from './../../services/department.service';
import { Component, inject, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Utils } from '../../utils';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { PredictDetailComponent } from '../predict-detail/predict-detail.component';

@Component({
  selector: 'app-predict-history',
  imports: [CommonModule, MatProgressSpinnerModule, MatPaginatorModule],
  templateUrl: './predict-history.component.html',
  styleUrl: './predict-history.component.scss'
})
export class PredictHistoryComponent implements OnInit {

  readonly authService: AuthService = inject(AuthService);
  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<PredictHistoryComponent> = inject(MatDialogRef<PredictHistoryComponent>);
  readonly data = inject<{ member: DepartmentMember }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);

  predictHistory: PredictTransaction[] = [];
  member?: DepartmentMember;
  monthlySummary: MonthlySummary[] = [];
  isLoading = false;

  // ページング関連
  totalCount = 0;
  pageSize = 20;
  currentPage = 0;
  pageSizeOptions = [10, 20, 50, 100];

  ngOnInit(): void {
    this.loadPredictHistory();
    this.loadMonthlySummary();
  }

  loadPredictHistory(page: number = 0, pageSize: number = this.pageSize): void {
    this.isLoading = true;
    const offset = page * pageSize;

    if (this.data && this.data.member) {
      this.member = this.data.member;
      const userId = this.data.member.user?.id;
      if (userId) {
        this.departmentService.predictHistory(userId, offset, pageSize).subscribe(response => {
          this.predictHistory = response.predictHistory;
          this.totalCount = response.totalCount || 0;
          this.isLoading = false;
        });
      }
    } else {
      this.authService.getPredictHistory(offset, pageSize).subscribe(response => {
        this.predictHistory = response.predictHistory;
        this.totalCount = response.totalCount || 0;
        this.isLoading = false;
      });
    }
  }

  loadMonthlySummary(): void {
    this.departmentService.getPredictHistorySummary().subscribe(response => {
      this.monthlySummary = response.monthlySummary || [];
      // this.calcSum(response.predictHistory);
    });
  }

  onPageChange(event: PageEvent): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadPredictHistory(this.currentPage, this.pageSize);
  }

  // 詳細ダイアログを開く
  openPredictDetail(predict: PredictTransaction): void {
    const userId = this.data?.member?.user?.id;

    this.dialog.open(PredictDetailComponent, {
      data: {
        predict: predict,
        userId: userId // 部門メンバーの場合はuserIdを渡す
      },
      width: '90vw',
      maxWidth: '1200px',
      height: '80vh',
      // maxHeight: '800px',
      panelClass: 'predict-detail-dialog-container'
    });
  }

  // calcSum(allPredictHistory: PredictTransaction[]): void {
  //   const summaryMap = new Map<string, MonthlySummary>();

  //   allPredictHistory.forEach(predict => {
  //     const month = Utils.formatDate(new Date(predict.created_at), 'yyyy-MM');
  //     const summary = summaryMap.get(month) || {
  //       month,
  //       totalCost: 0,
  //       totalReqTokens: 0,
  //       totalResTokens: 0,
  //       count: 0
  //     };

  //     summary.totalCost += predict.cost * 150;
  //     summary.totalReqTokens += predict.req_token;
  //     summary.totalResTokens += predict.res_token;
  //     summary.count += 1;

  //     summaryMap.set(month, summary);
  //   });

  //   this.monthlySummary = Array.from(summaryMap.values()).sort((a, b) => b.month.localeCompare(a.month));
  //   console.log(this.monthlySummary);
  // }
}

interface MonthlySummary {
  month: string;
  totalCost: number;
  totalReqTokens: number;
  totalResTokens: number;
  count: number;
}