import { AuthService } from './../../services/auth.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DepartmentMember, DepartmentService, PredictTransaction } from './../../services/department.service';
import { Component, inject, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { Utils } from '../../utils';

@Component({
    selector: 'app-predict-history',
    imports: [CommonModule],
    templateUrl: './predict-history.component.html',
    styleUrl: './predict-history.component.scss'
})
export class PredictHistoryComponent implements OnInit {

  readonly aAuthService: AuthService = inject(AuthService);
  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<PredictHistoryComponent> = inject(MatDialogRef<PredictHistoryComponent>);
  readonly data = inject<{ member: DepartmentMember }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);

  predictHistory: PredictTransaction[] = [];
  member?: DepartmentMember;
  monthlySummary: MonthlySummary[] = [];

  ngOnInit(): void {
    if (this.data && this.data.member) {
      this.member = this.data.member;
      const userId = this.data.member.user?.id;
      if (userId) {
        this.departmentService.predictHistory(userId).subscribe(response => {
          this.predictHistory = response.predictHistory;
          this.calcSum();
        });
      }
    } else {
      this.aAuthService.getPredictHistory().subscribe(response => {
        this.predictHistory = response.predictHistory;
        this.calcSum();
      });
    }
  }
  calcSum(): void {
    const summaryMap = new Map<string, MonthlySummary>();

    this.predictHistory.forEach(predict => {
      const month = Utils.formatDate(new Date(predict.created_at), 'yyyy-MM');
      const summary = summaryMap.get(month) || {
        month,
        totalCost: 0,
        totalReqTokens: 0,
        totalResTokens: 0,
        count: 0
      };

      summary.totalCost += predict.cost * 150;
      summary.totalReqTokens += predict.req_token;
      summary.totalResTokens += predict.res_token;
      summary.count += 1;

      summaryMap.set(month, summary);
    });

    this.monthlySummary = Array.from(summaryMap.values()).sort((a, b) => b.month.localeCompare(a.month));
    console.log(this.monthlySummary);
  }
}

interface MonthlySummary {
  month: string;
  totalCost: number;
  totalReqTokens: number;
  totalResTokens: number;
  count: number;
}
