import { MatDialog } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Chart, registerables } from 'chart.js';

import { Cost, DepartmentForView, DepartmentMember, DepartmentService } from '../../../services/department.service';
import { UserStatus } from '../../../models/models';
import { DialogComponent, DialogData } from '../../../parts/dialog/dialog.component';
import { PredictHistoryComponent } from '../../../parts/predict-history/predict-history.component';

Chart.register(...registerables);

@Component({
  selector: 'app-department-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatRadioModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule
  ],
  templateUrl: './department-management.component.html',
  styleUrl: './department-management.component.scss'
})
export class DepartmentManagementComponent implements OnInit, AfterViewInit, OnDestroy {

  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly matDialog: MatDialog = inject(MatDialog);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly dialog: MatDialog = inject(MatDialog);

  @ViewChild('departmentCostChart', { static: false }) departmentCostChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('memberCostChart', { static: false }) memberCostChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild('periodTrendChart', { static: false }) periodTrendChart!: ElementRef<HTMLCanvasElement>;

  selectYyyyMm: string = 'ALL';
  yyyyMmList: string[] = [];

  departmentList: {
    department: DepartmentForView,
    cost: { [key: string]: Cost },
    members: DepartmentMember[]
  }[] = [];

  private deptChart!: Chart;
  private trendChart!: Chart;
  private mbrChart!: Chart;
  // パイチャート用のカラーパレット
  private readonly pieColors: string[] = [
    '#69B8CD', // primary
    '#B0CCCB', // secondary
    '#FFB787', // tertiary
    '#FFB4AB', // error
    '#004F4F', // primary-container
    '#324B4B', // secondary-container
    '#723600', // tertiary-container
    '#93000A', // error-container
    '#003737', // on-primary
    '#1B3534'  // on-secondary
  ];
  // // 旧パイチャート用のカラーパレット（必要に応じてコメントアウト）
  // private readonly pieColors: string[] = [
  //   '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
  //   '#9966FF', '#FF9F40', '#E7E9ED', '#71B37C',
  //   '#C9CBCF', '#8E5EA2'
  // ];
  ngOnInit(): void {
    this.loadDepartmentData();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initializeCharts(), 0);
  }

  ngOnDestroy(): void {
    this.deptChart?.destroy();
    this.trendChart?.destroy();
    this.mbrChart?.destroy();
  }

  private loadDepartmentData(): void {
    this.departmentService.getDepartment().subscribe({
      next: response => {
        this.departmentList = response.departmentList;
        const set = this.departmentList.reduce((bef, curr) => {
          curr.members.forEach(member => {
            if (member.cost) {
              Object.keys(member.cost).forEach(key => bef.add(key));
            }
          });
          return bef;
        }, new Set<string>());

        this.yyyyMmList = Array.from(set).filter(k => k !== 'ALL').sort().reverse();
        if (this.yyyyMmList.length) {
          this.selectYyyyMm = this.yyyyMmList[0];
        }

        this.updateCharts();
      },
      error: err => {
        console.error('Error loading department data:', err);
        this.snackBar.open('部門データの読み込みに失敗しました', 'OK', { duration: 3000 });
      }
    });
  }

  private initializeCharts(): void {
    const deptCtx = this.departmentCostChart ? this.departmentCostChart.nativeElement.getContext('2d') : null;
    const trendCtx = this.periodTrendChart ? this.periodTrendChart.nativeElement.getContext('2d') : null;
    const mbrCtx = this.memberCostChart ? this.memberCostChart.nativeElement.getContext('2d') : null;
    if (deptCtx) {
      this.deptChart = new Chart(deptCtx!, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'コスト (円)', data: [] }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    }
    if (trendCtx) {
      this.trendChart = new Chart(trendCtx!, {
        type: 'line',
        data: { labels: [], datasets: [{ label: '月別コスト推移 (円)', data: [], fill: false, tension: 0.1 }] },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    }
    if (mbrCtx) {
      this.mbrChart = new Chart(mbrCtx!, {
        type: 'pie',
        data: { labels: [], datasets: [{ label: 'メンバー別コスト比率', data: [] }] },
        options: { responsive: true }
      });
    }
    this.updateCharts();
  }
  private updateCharts(): void {
    if (this.departmentCostChart) this.updateDepartmentCostChart();
    if (this.trendChart) this.updatePeriodTrendChart();
    if (this.mbrChart) this.updateMemberCostChart();
  }

  private updateDepartmentCostChart(): void {
    const labels: string[] = [];
    const data: number[] = [];
    this.departmentList.forEach(dept => {
      const c = dept.cost[this.selectYyyyMm];
      if (c) { labels.push(dept.department.name); data.push(c.totalCost * 150); }
    });
    this.deptChart.data.labels = labels;
    this.deptChart.data.datasets![0].data = data;
    this.deptChart.update();
  }

  private updatePeriodTrendChart(): void {
    const labels = this.yyyyMmList.map(y => y.replace('-', '/'));
    const data = this.yyyyMmList.map(k =>
      this.departmentList.reduce((sum, d) => sum + (d.cost[k]?.totalCost || 0) * 150, 0)
    );
    this.trendChart.data.labels = labels;
    this.trendChart.data.datasets![0].data = data;
    this.trendChart.update();
  }


  private updateMemberCostChart(): void {
    // 選択中の期間でメンバー別コストを集計
    const costMap = new Map<string, number>();
    this.departmentList.forEach(dept => {
      dept.members.forEach(m => {
        let total = 0;
        if (this.selectYyyyMm === 'ALL') {
          // 全期間
          total = m.cost ? Object.values(m.cost).reduce((sum, c) => sum + c.totalCost * 150, 0) : 0;
        } else {
          // 指定期間のみ
          const c = m.cost ? m.cost[this.selectYyyyMm] : undefined;
          total = c ? c.totalCost * 150 : 0;
        }
        if (total > 0) {
          const name = m.user?.name || 'Unknown';
          costMap.set(name, (costMap.get(name) || 0) + total);
        }
      });
    });
    // 上位10人とその他
    const entries = Array.from(costMap.entries()).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 10);
    const otherTotal = entries.slice(10).reduce((sum, [, val]) => sum + val, 0);

    const labels = top.map(([name]) => name);
    const data = top.map(([, val]) => val);
    if (otherTotal > 0) { labels.push('その他'); data.push(otherTotal); }

    const colors = labels.map((_, i) => this.pieColors[i]);
    const borderColors = Array(labels.length).fill('#FFFFFF');

    this.mbrChart.data.labels = labels;
    const ds = this.mbrChart.data.datasets![0];
    ds.data = data;
    ds.backgroundColor = colors;
    ds.borderColor = borderColors;
    ds.borderWidth = 1;
    this.mbrChart.update();
  }



  onPeriodChange(): void {
    this.updateCharts();
  }

  formatPeriod(yyyyMm: string): string {
    if (yyyyMm === 'ALL') return '全期間';
    const [year, month] = yyyyMm.split('-');
    return `${year}年${parseInt(month, 10)}月`;
  }

  // ...（以下は既存の統計計算やその他メソッド）

  getTotalCost(): number {
    if (this.selectYyyyMm === 'ALL') return this.calculateTotalCostAllPeriods();
    return this.departmentList.reduce((total, dept) => {
      const c = dept.cost[this.selectYyyyMm];
      return total + (c ? c.totalCost * 150 : 0);
    }, 0);
  }

  getTotalTokens(): number {
    if (this.selectYyyyMm === 'ALL') return this.calculateTotalTokensAllPeriods();
    return this.departmentList.reduce((total, dept) => {
      const c = dept.cost[this.selectYyyyMm];
      return total + (c ? c.totalReqToken + c.totalResToken : 0);
    }, 0);
  }

  getForeignTokens(): number {
    if (this.selectYyyyMm === 'ALL') return this.calculateForeignTokensAllPeriods();
    return this.departmentList.reduce((total, dept) => {
      const c = dept.cost[this.selectYyyyMm];
      return total + (c ? c.foreignModelReqToken + c.foreignModelResToken : 0);
    }, 0);
  }

  getActiveDepartmentCount(): number {
    return this.departmentList.filter(dept => dept.cost[this.selectYyyyMm]).length;
  }

  hasDataForPeriod(): boolean {
    return this.departmentList.some(dept => dept.cost[this.selectYyyyMm]);
  }

  private calculateTotalCostAllPeriods(): number {
    return this.departmentList.reduce((total, dept) => {
      return total + Object.values(dept.cost).reduce((sum, cost) => sum + cost.totalCost * 150, 0);
    }, 0);
  }

  private calculateTotalTokensAllPeriods(): number {
    return this.departmentList.reduce((total, dept) => {
      return total + Object.values(dept.cost).reduce((sum, cost) => sum + cost.totalReqToken + cost.totalResToken, 0);
    }, 0);
  }

  private calculateForeignTokensAllPeriods(): number {
    return this.departmentList.reduce((total, dept) => {
      return total + Object.values(dept.cost).reduce((sum, cost) => sum + cost.foreignModelReqToken + cost.foreignModelResToken, 0);
    }, 0);
  }

  detail(member: DepartmentMember): void {
    if (member.user) {
      this.dialog.open(PredictHistoryComponent, { data: { member } });
    }
  }

  eventCancel($event: MouseEvent): void {
    $event.stopImmediatePropagation();
  }

  updateUserStatus(member: DepartmentMember): void {
    if (!member.user) return;
    const transMap: Record<string, string> = { Active: '有効', Suspended: '停止' };
    this.matDialog.open(DialogComponent, {
      data: {
        title: '確認',
        message: `${member.user.name}のステータスを「${transMap[member.user.status]}」に変更しますか?`,
        options: ['キャンセル', 'OK'],
      } as DialogData
    }).afterClosed().subscribe(result => {
      if (result === 1) {
        this.departmentService.departmentMemberManagement(
          member.departmentId,
          { userName: member.user!.name, status: member.user!.status }
        ).subscribe({
          next: () => this.snackBar.open('ステータスを変更しました', 'OK', { duration: 3000 }),
          error: error => {
            console.error('Status update error:', error);
            this.snackBar.open('ステータスの変更に失敗しました', 'OK', { duration: 3000 });
            member.user!.status = member.user!.status === UserStatus.Active ? UserStatus.Suspended : UserStatus.Active;
          }
        });
      } else {
        member.user!.status = member.user!.status === UserStatus.Active ? UserStatus.Suspended : UserStatus.Active;
      }
    });
  }
}
