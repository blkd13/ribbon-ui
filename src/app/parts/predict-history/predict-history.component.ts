import { AuthService } from './../../services/auth.service';
import { AnimationService } from './../../services/animation.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { DepartmentService, DivisionMemberCost, PredictTransaction } from './../../services/department.service';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommonModule } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PredictDetailComponent } from '../predict-detail/predict-detail.component';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, LegendOptions, BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, PieController, ArcElement } from 'chart.js';

// Chart.jsのモジュールを登録
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend, PieController, ArcElement);

// 集計期間タイプ
type PeriodType = 'month' | 'month-trend' | 'year' | 'year-trend';

// 分析レベル
type AnalysisLevel = 'aplType' | 'provider' | 'throttleKey' | 'model';

interface MonthlySummary {
  month: string;
  model: string;
  aplType: string;
  provider: string;
  throttleKey: string;
  totalCost: number;
  totalReqTokens: number;
  totalResTokens: number;
  count: number;
}

interface PeriodData {
  key: string;           // 表示用キー（例: "2024-12", "2024-Q4", "2024-H2", "2024"）
  label: string;         // 表示ラベル
  totalCost: number;
  count: number;
  totalReqTokens: number;
  totalResTokens: number;
  months: string[];      // この期間に含まれる月のリスト
}

interface AggregatedData {
  key: string;
  totalCost: number;
  count: number;
  totalReqTokens: number;
  totalResTokens: number;
}

interface DailySummary {
  date: string;
  totalCost: number;
  count: number;
  totalReqTokens: number;
  totalResTokens: number;
  byModel: Map<string, number>;
}

@Component({
  selector: 'app-predict-history',
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatPaginatorModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
    MatTabsModule,
    FormsModule,
    TranslateModule,
    BaseChartDirective
  ],
  templateUrl: './predict-history.component.html',
  styleUrl: './predict-history.component.scss'
})
export class PredictHistoryComponent implements OnInit {

  @ViewChild('historyPaginator') historyPaginator!: MatPaginator;

  readonly authService: AuthService = inject(AuthService);
  readonly animationService: AnimationService = inject(AnimationService);
  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<PredictHistoryComponent> = inject(MatDialogRef<PredictHistoryComponent>);
  readonly data = inject<{ member: DivisionMemberCost }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly translate: TranslateService = inject(TranslateService);

  // 基本データ
  predictHistory: PredictTransaction[] = [];
  member?: DivisionMemberCost;
  monthlySummary: MonthlySummary[] = [];
  isLoading = false;

  // 集計期間
  currentPeriodType: PeriodType = 'month';
  periodData: PeriodData[] = [];
  selectedPeriod: PeriodData | null = null;

  // 分析レベル（モデルタイプ別、アプリ別、モデル詳細、プロバイダ別の順）
  readonly analysisLevels: AnalysisLevel[] = ['throttleKey', 'aplType', 'model', 'provider'];

  // 詳細分析の表示モード（金額グラフ・件数グラフ・明細）
  breakdownViewMode: 'cost-chart' | 'count-chart' | 'list' = 'cost-chart';

  // タブ
  selectedTabIndex = 0;

  // 日別サマリーとチャート
  dailySummaryData: DailySummary[] = [];
  chartData: ChartData<'bar'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 8,
          font: { size: 11 }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ¥${context.parsed.y.toLocaleString()}`
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false }
      },
      y: {
        stacked: true,
        ticks: {
          callback: (value) => `¥${Number(value).toLocaleString()}`
        }
      }
    }
  };

  // モデル別の色マッピング
  private modelColors: Map<string, string> = new Map();
  private colorPalette = [
    '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
    '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
    '#86bcb6', '#8cd17d', '#b6992d', '#499894', '#e15759'
  ];

  // 詳細分析用パイチャートデータ（金額別・件数別）
  breakdownCostChartData: Map<AnalysisLevel, ChartData<'pie'>> = new Map();
  breakdownCountChartData: Map<AnalysisLevel, ChartData<'pie'>> = new Map();

  // 推移グラフ用データ（左ペイン用）
  trendChartDataByLevel: Map<AnalysisLevel, ChartData<'bar'>> = new Map();

  // 推移グラフの表示モード（コスト or 件数）
  trendViewMode: 'cost' | 'count' = 'cost';

  // 推移グラフの凡例表示フラグ
  trendLegendVisible = false;

  // 推移グラフの凡例オプション
  private readonly trendLegendOptions = {
    display: false,
    position: 'bottom',
    labels: {
      boxWidth: 10,
      padding: 6,
      font: { size: 10 }
    }
  } as LegendOptions<'bar'>;

  trendChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: this.trendLegendOptions,
      tooltip: {
        callbacks: {
          label: (context) => {
            const isCost = this.currentPeriodType === 'month-trend' || this.currentPeriodType === 'year-trend';
            if (isCost) {
              return `${context.dataset.label}: ¥${context.parsed.y.toLocaleString()}`;
            }
            return `${context.dataset.label}: ${context.parsed.y.toLocaleString()}件`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 10 } }
      },
      y: {
        stacked: true,
        ticks: {
          font: { size: 10 },
          callback: (value) => {
            if (this.trendViewMode === 'cost') {
              return `¥${Number(value).toLocaleString()}`;
            }
            return Number(value).toLocaleString();
          }
        }
      }
    }
  };

  // ダークテーマかどうかを判定してテキスト色を取得
  private getLegendTextColor(): string {
    const isDark = document.body.classList.contains('dark-theme') ||
      document.documentElement.classList.contains('dark-theme') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isDark ? '#e0e0e0' : '#333333';
  }

  // 金額グラフ用オプション
  pieCostChartOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        right: 0
      }
    },
    plugins: {
      legend: {
        position: 'right',
        maxWidth: 200,
        labels: {
          boxWidth: 12,
          padding: 6,
          font: { size: 10 },
          generateLabels: (chart) => {
            const data = chart.data;
            const textColor = this.getLegendTextColor();
            if (data.labels && data.datasets.length) {
              return (data.labels as string[]).map((label, i) => {
                const value = data.datasets[0].data[i] as number;
                const total = (data.datasets[0].data as number[]).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: (data.datasets[0].backgroundColor as string[])[i],
                  fontColor: textColor,
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${context.label}: ¥${value.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    }
  };

  // 件数グラフ用オプション
  pieCountChartOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        right: 0
      }
    },
    plugins: {
      legend: {
        position: 'right',
        maxWidth: 200,
        labels: {
          boxWidth: 12,
          padding: 6,
          font: { size: 10 },
          generateLabels: (chart) => {
            const data = chart.data;
            const textColor = this.getLegendTextColor();
            if (data.labels && data.datasets.length) {
              return (data.labels as string[]).map((label, i) => {
                const value = data.datasets[0].data[i] as number;
                const total = (data.datasets[0].data as number[]).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: (data.datasets[0].backgroundColor as string[])[i],
                  fontColor: textColor,
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed;
            const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${context.label}: ${value.toLocaleString()}件 (${percentage}%)`;
          }
        }
      }
    }
  };

  // 履歴ページング（クライアント側フィルタリング）
  allPredictHistory: PredictTransaction[] = [];
  historyPageSize = 20;
  historyCurrentPage = 0;
  historyTargetPage = 1;

  get filteredHistory(): PredictTransaction[] {
    if (this.selectedPeriod === null) {
      return this.allPredictHistory;
    }
    // 選択期間に含まれる月でフィルタリング
    return this.allPredictHistory.filter(item => {
      const createdAt = new Date(item.created_at);
      const year = createdAt.getFullYear();
      const month = (createdAt.getMonth() + 1).toString().padStart(2, '0');
      const itemMonth = `${year}-${month}`; // "YYYY-MM"
      return this.selectedPeriod!.months.includes(itemMonth);
    });
  }

  get filteredHistoryCount(): number {
    return this.filteredHistory.length;
  }

  get historyTotalPages(): number {
    return Math.ceil(this.filteredHistoryCount / this.historyPageSize) || 1;
  }

  get pagedHistory(): PredictTransaction[] {
    const start = this.historyCurrentPage * this.historyPageSize;
    return this.filteredHistory.slice(start, start + this.historyPageSize);
  }

  // 旧ページング（後方互換）
  totalCount = 0;
  pageSize = 20;
  currentPage = 0;
  pageSizeOptions = [10, 20, 50, 100];
  targetPage = 1;

  get totalPages(): number {
    return Math.ceil(this.totalCount / this.pageSize);
  }

  ngOnInit(): void {
    // アニメーション設定をチャートに反映
    this.animationService.animationEnabled$.subscribe(enabled => {
      const animationSetting = enabled ? undefined : false;

      // 日別チャートのアニメーション
      if (this.chartOptions) {
        this.chartOptions.animation = animationSetting;
      }

      // パイチャート（金額別）のアニメーション
      if (this.pieCostChartOptions) {
        this.pieCostChartOptions.animation = animationSetting;
      }

      // パイチャート（件数別）のアニメーション
      if (this.pieCountChartOptions) {
        this.pieCountChartOptions.animation = animationSetting;
      }
    });

    this.loadAllPredictHistory();
    this.loadMonthlySummary();
    this.applyTrendLegendVisibility();
  }

  // === データ読み込み ===

  loadAllPredictHistory(): void {
    this.isLoading = true;
    // 全件取得（クライアント側でフィルタリング）
    const limit = 10000;

    if (this.data && this.data.member) {
      this.member = this.data.member;
      const userId = this.data.member.id;
      if (userId) {
        this.departmentService.predictHistory(userId, 0, limit).subscribe(response => {
          this.allPredictHistory = response.predictHistory || [];
          this.predictHistory = this.allPredictHistory;
          this.totalCount = response.totalCount || 0;
          this.historyCurrentPage = 0;
          this.historyTargetPage = 1;
          this.isLoading = false;
          this.updateDailySummary();
        });
      }
    } else {
      this.authService.getPredictHistory(0, limit).subscribe(response => {
        this.allPredictHistory = response.predictHistory || [];
        this.predictHistory = this.allPredictHistory;
        this.totalCount = response.totalCount || 0;
        this.historyCurrentPage = 0;
        this.historyTargetPage = 1;
        this.isLoading = false;
        this.updateDailySummary();
      });
    }
  }

  loadMonthlySummary(): void {
    if (this.data && this.data.member) {
      this.member = this.data.member;
      const userId = this.data.member.id;
      if (userId) {
        this.departmentService.getPredictHistorySummaryForAdmin(userId).subscribe(response => {
          this.monthlySummary = (response.monthlySummary || []).map((item: any) => ({
            ...item,
            throttleKey: item.throttleKey || ''
          }));
          this.updatePeriodData();
          this.selectCurrentPeriod();
          this.updateDailySummary();
        });
      }
    } else {
      this.departmentService.getPredictHistorySummaryForUser().subscribe(response => {
        this.monthlySummary = (response.monthlySummary || []).map((item: any) => ({
          ...item,
          throttleKey: item.throttleKey || ''
        }));
        this.updatePeriodData();
        this.selectCurrentPeriod();
        this.updateDailySummary();
      });
    }
  }

  // === 期間集計 ===

  updatePeriodData(): void {
    const periodMap = new Map<string, PeriodData>();

    this.monthlySummary.forEach(item => {
      const periodKey = this.getPeriodKey(item.month);
      const existing = periodMap.get(periodKey);

      if (existing) {
        existing.totalCost += item.totalCost;
        existing.count += item.count;
        existing.totalReqTokens += item.totalReqTokens;
        existing.totalResTokens += item.totalResTokens;
        if (!existing.months.includes(item.month)) {
          existing.months.push(item.month);
        }
      } else {
        periodMap.set(periodKey, {
          key: periodKey,
          label: this.getPeriodLabel(periodKey),
          totalCost: item.totalCost,
          count: item.count,
          totalReqTokens: item.totalReqTokens,
          totalResTokens: item.totalResTokens,
          months: [item.month]
        });
      }
    });

    // ソート（新しい順）
    this.periodData = Array.from(periodMap.values())
      .sort((a, b) => b.key.localeCompare(a.key));
  }

  getPeriodKey(month: string): string {
    // month形式: "YYYY-MM"
    const [year, mon] = month.split('-').map(Number);

    switch (this.currentPeriodType) {
      case 'month':
      case 'month-trend':
        return month;
      case 'year':
      case 'year-trend':
        return `${year}`;
      default:
        return month;
    }
  }

  getPeriodLabel(key: string): string {
    if (key.includes('-Q')) {
      // 四半期: "2024-Q4" -> "2024年 Q4"
      const [year, q] = key.split('-');
      return `${year}年 ${q}`;
    } else if (key.includes('-H')) {
      // 半期: "2024-H2" -> "2024年 下半期"
      const [year, h] = key.split('-');
      const halfLabel = h === 'H1' ? '上半期' : '下半期';
      return `${year}年 ${halfLabel}`;
    } else if (key.match(/^\d{4}$/)) {
      // 年: "2024" -> "2024年"
      return `${key}年`;
    } else {
      // 月: "2024-12" -> "2024年12月"
      const [year, mon] = key.split('-');
      return `${year}年${parseInt(mon)}月`;
    }
  }

  getCurrentPeriodKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    switch (this.currentPeriodType) {
      case 'month':
      case 'month-trend':
        return `${year}-${month.toString().padStart(2, '0')}`;
      case 'year':
      case 'year-trend':
        return `${year}`;
      default:
        return `${year}-${month.toString().padStart(2, '0')}`;
    }
  }

  selectCurrentPeriod(): void {
    const currentKey = this.getCurrentPeriodKey();
    const currentPeriod = this.periodData.find(p => p.key === currentKey);

    if (currentPeriod) {
      this.selectedPeriod = currentPeriod;
    } else if (this.periodData.length > 0) {
      // 当期がなければ最新の期間を選択
      this.selectedPeriod = this.periodData[0];
    }
  }

  onPeriodTypeChange(type: PeriodType): void {
    this.currentPeriodType = type;
    this.updatePeriodData();
    this.selectCurrentPeriod();
    // 月別以外では詳細タブは使えないので詳細分析タブに切り替え
    if (type !== 'month' && this.selectedTabIndex > 0) {
      this.selectedTabIndex = 0;
    }
    this.resetHistoryPage();
    this.updateDailySummary();
    // 推移モードの場合はグラフデータを更新
    if (this.isTrendMode()) {
      this.updateTrendChartData();
    }
  }

  // 推移モードかどうか
  isTrendMode(): boolean {
    return this.currentPeriodType === 'month-trend' || this.currentPeriodType === 'year-trend';
  }

  // 推移グラフの表示モード切り替え
  onTrendViewModeChange(mode: 'cost' | 'count'): void {
    this.trendViewMode = mode;
    this.updateTrendChartData();
  }

  // 凡例の表示/非表示を切り替え
  toggleTrendLegendVisibility(): void {
    this.trendLegendVisible = !this.trendLegendVisible;
    this.applyTrendLegendVisibility();
  }

  private applyTrendLegendVisibility(): void {
    this.trendLegendOptions.display = this.trendLegendVisible;
    this.trendChartOptions = { ...this.trendChartOptions };
  }

  // 推移グラフデータの更新
  updateTrendChartData(): void {
    const isYearly = this.currentPeriodType === 'year-trend';

    // 期間のラベルを取得（古い順）
    const periods = [...this.periodData].reverse();
    const labels = periods.map(p => p.label);

    // 各分析レベルごとにチャートデータを生成
    for (const level of this.analysisLevels) {
      // このレベルの全キーを収集
      const allKeys = new Set<string>();
      const periodKeyData: Map<string, Map<string, number>> = new Map();

      periods.forEach(period => {
        const keyData = new Map<string, number>();
        // この期間に含まれる月のデータを集計
        const relevantSummary = this.monthlySummary.filter(item =>
          period.months.includes(item.month)
        );

        relevantSummary.forEach(item => {
          let key: string;
          switch (level) {
            case 'throttleKey': key = item.throttleKey || '(unknown)'; break;
            case 'aplType': key = item.aplType || '(unknown)'; break;
            case 'model': key = item.model || '(unknown)'; break;
            case 'provider': key = item.provider || '(unknown)'; break;
            default: key = '(unknown)';
          }
          allKeys.add(key);
          const value = this.trendViewMode === 'cost' ? item.totalCost : item.count;
          keyData.set(key, (keyData.get(key) || 0) + value);
        });
        periodKeyData.set(period.key, keyData);
      });

      // データセットを生成
      const keysArray = Array.from(allKeys);
      const datasets = keysArray.map((key, index) => ({
        label: key,
        data: periods.map(period => periodKeyData.get(period.key)?.get(key) || 0),
        backgroundColor: this.getColorForKey(key, index),
        borderColor: this.getColorForKey(key, index),
        borderWidth: 1
      }));

      this.trendChartDataByLevel.set(level, {
        labels,
        datasets
      });
    }
  }

  // キーに対応する色を取得
  private getColorForKey(key: string, index: number): string {
    if (!this.modelColors.has(key)) {
      this.modelColors.set(key, this.colorPalette[this.modelColors.size % this.colorPalette.length]);
    }
    return this.modelColors.get(key) || this.colorPalette[index % this.colorPalette.length];
  }

  // 推移グラフデータを取得
  getTrendChartData(level: AnalysisLevel): ChartData<'bar'> {
    return this.trendChartDataByLevel.get(level) || { labels: [], datasets: [] };
  }

  selectPeriod(period: PeriodData): void {
    this.selectedPeriod = period;
    this.resetHistoryPage();
    this.updateDailySummary();
  }

  selectAllPeriods(): void {
    // 全期間を選択
    this.selectedPeriod = null;
    // 詳細タブは使えないので詳細分析タブに切り替え
    if (this.selectedTabIndex > 0) {
      this.selectedTabIndex = 0;
    }
    this.resetHistoryPage();
    this.updateDailySummary();
  }

  resetHistoryPage(): void {
    this.historyCurrentPage = 0;
    this.historyTargetPage = 1;
    // MatPaginatorの状態もリセット
    if (this.historyPaginator) {
      this.historyPaginator.pageIndex = 0;
    }
  }

  // === 日別サマリーとチャート ===

  updateDailySummary(): void {
    const filtered = this.filteredHistory;
    const dailyMap = new Map<string, DailySummary>();

    filtered.forEach(item => {
      const createdAt = new Date(item.created_at);
      const dateKey = `${createdAt.getFullYear()}-${(createdAt.getMonth() + 1).toString().padStart(2, '0')}-${createdAt.getDate().toString().padStart(2, '0')}`;

      const existing = dailyMap.get(dateKey);
      const cost = item.cost * 150;

      if (existing) {
        existing.totalCost += cost;
        existing.count += 1;
        existing.totalReqTokens += item.req_token;
        existing.totalResTokens += item.res_token;
        existing.byModel.set(item.model, (existing.byModel.get(item.model) || 0) + cost);
      } else {
        const byModel = new Map<string, number>();
        byModel.set(item.model, cost);
        dailyMap.set(dateKey, {
          date: dateKey,
          totalCost: cost,
          count: 1,
          totalReqTokens: item.req_token,
          totalResTokens: item.res_token,
          byModel
        });
      }
    });

    // 選択期間の月初日から月末日までの範囲で補完
    const dateRange = this.getSelectedPeriodDateRange();
    if (dateRange) {
      const { startDate, endDate } = dateRange;
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;

        if (!dailyMap.has(dateKey)) {
          // データがない日は0で補完
          dailyMap.set(dateKey, {
            date: dateKey,
            totalCost: 0,
            count: 0,
            totalReqTokens: 0,
            totalResTokens: 0,
            byModel: new Map()
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // 日付順にソート
    this.dailySummaryData = Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date));

    this.updateChartData();
    this.updateBreakdownCharts();
  }

  // 選択された期間の開始日と終了日を取得
  getSelectedPeriodDateRange(): { startDate: Date; endDate: Date } | null {
    if (!this.selectedPeriod) {
      // 全期間の場合は補完しない（データ範囲のみ）
      return null;
    }

    const months = this.selectedPeriod.months;
    if (months.length === 0) return null;

    // 期間内の最初の月と最後の月を特定
    const sortedMonths = [...months].sort();
    const firstMonth = sortedMonths[0]; // e.g., "2025-01"
    const lastMonth = sortedMonths[sortedMonths.length - 1];

    // 月初日
    const [startYear, startMonthNum] = firstMonth.split('-').map(Number);
    const startDate = new Date(startYear, startMonthNum - 1, 1);

    // 月末日
    const [endYear, endMonthNum] = lastMonth.split('-').map(Number);
    const endDate = new Date(endYear, endMonthNum, 0); // 翌月の0日 = 当月末日

    // 未来の日付は今日までに制限
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (endDate > today) {
      endDate.setTime(today.getTime());
    }

    return { startDate, endDate };
  }

  updateChartData(): void {
    if (this.dailySummaryData.length === 0) {
      this.chartData = { labels: [], datasets: [] };
      return;
    }

    // 全モデルを収集
    const allModels = new Set<string>();
    this.dailySummaryData.forEach(day => {
      day.byModel.forEach((_, model) => allModels.add(model));
    });

    // モデルに色を割り当て
    const models = Array.from(allModels).sort();
    models.forEach((model, index) => {
      if (!this.modelColors.has(model)) {
        this.modelColors.set(model, this.colorPalette[index % this.colorPalette.length]);
      }
    });

    // ラベル（日付）を短縮形式で
    const labels = this.dailySummaryData.map(day => {
      const parts = day.date.split('-');
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    });

    // 各モデルのデータセット
    const datasets = models.map(model => ({
      label: model,
      data: this.dailySummaryData.map(day => day.byModel.get(model) || 0),
      backgroundColor: this.modelColors.get(model) || '#999',
      borderRadius: 2
    }));

    this.chartData = { labels, datasets };
  }

  // === 詳細分析パイチャート ===

  updateBreakdownCharts(): void {
    this.analysisLevels.forEach(level => {
      const breakdown = this.getAnalysisBreakdown(level);

      // 上位5件 + その他（金額ベース）
      const maxItems = 5;
      let costItems: { key: string; value: number }[] = [];
      let countItems: { key: string; value: number }[] = [];
      let otherCost = 0;
      let otherCount = 0;

      // 金額順でソート済みなので、そのまま処理
      breakdown.forEach((item, index) => {
        if (index < maxItems) {
          costItems.push({ key: item.key || '(empty)', value: item.totalCost });
        } else {
          otherCost += item.totalCost;
        }
      });

      if (otherCost > 0) {
        costItems.push({ key: 'その他', value: otherCost });
      }

      // 件数順でソートして処理
      const breakdownByCount = [...breakdown].sort((a, b) => b.count - a.count);
      breakdownByCount.forEach((item, index) => {
        if (index < maxItems) {
          countItems.push({ key: item.key || '(empty)', value: item.count });
        } else {
          otherCount += item.count;
        }
      });

      if (otherCount > 0) {
        countItems.push({ key: 'その他', value: otherCount });
      }

      // 金額チャートデータを生成
      const costColors = costItems.map((_, i) => this.colorPalette[i % this.colorPalette.length]);
      this.breakdownCostChartData.set(level, {
        labels: costItems.map(item => item.key),
        datasets: [{
          data: costItems.map(item => item.value),
          backgroundColor: costColors,
          borderWidth: 1,
          borderColor: '#fff'
        }]
      });

      // 件数チャートデータを生成
      const countColors = countItems.map((_, i) => this.colorPalette[i % this.colorPalette.length]);
      this.breakdownCountChartData.set(level, {
        labels: countItems.map(item => item.key),
        datasets: [{
          data: countItems.map(item => item.value),
          backgroundColor: countColors,
          borderWidth: 1,
          borderColor: '#fff'
        }]
      });
    });
  }

  getBreakdownCostChartData(level: AnalysisLevel): ChartData<'pie'> {
    return this.breakdownCostChartData.get(level) || { labels: [], datasets: [] };
  }

  getBreakdownCountChartData(level: AnalysisLevel): ChartData<'pie'> {
    return this.breakdownCountChartData.get(level) || { labels: [], datasets: [] };
  }

  isPeriodSelected(period: PeriodData): boolean {
    return this.selectedPeriod?.key === period.key;
  }

  isAllSelected(): boolean {
    return this.selectedPeriod === null;
  }

  // 詳細タブ（日別推移・詳細履歴）が有効かどうか
  isDetailTabsEnabled(): boolean {
    // 月別で、かつ特定の月が選択されている場合のみ有効
    return this.currentPeriodType === 'month' && this.selectedPeriod !== null;
  }

  // === 集計データ取得 ===

  getSelectedTotal(): AggregatedData {
    if (this.selectedPeriod === null) {
      // 全期間
      return this.monthlySummary.reduce((acc, item) => {
        acc.totalCost += item.totalCost;
        acc.count += item.count;
        acc.totalReqTokens += item.totalReqTokens;
        acc.totalResTokens += item.totalResTokens;
        return acc;
      }, { key: 'total', totalCost: 0, count: 0, totalReqTokens: 0, totalResTokens: 0 });
    }

    return {
      key: this.selectedPeriod.key,
      totalCost: this.selectedPeriod.totalCost,
      count: this.selectedPeriod.count,
      totalReqTokens: this.selectedPeriod.totalReqTokens,
      totalResTokens: this.selectedPeriod.totalResTokens
    };
  }

  getFilteredSummary(): MonthlySummary[] {
    if (this.selectedPeriod === null) {
      return this.monthlySummary;
    }
    return this.monthlySummary.filter(item =>
      this.selectedPeriod!.months.includes(item.month)
    );
  }

  getAnalysisBreakdown(level: AnalysisLevel): AggregatedData[] {
    const filtered = this.getFilteredSummary();
    const aggregationMap = new Map<string, AggregatedData>();

    filtered.forEach(item => {
      const key = item[level] || '';
      const existing = aggregationMap.get(key);
      if (existing) {
        existing.totalCost += item.totalCost;
        existing.count += item.count;
        existing.totalReqTokens += item.totalReqTokens;
        existing.totalResTokens += item.totalResTokens;
      } else {
        aggregationMap.set(key, {
          key,
          totalCost: item.totalCost,
          count: item.count,
          totalReqTokens: item.totalReqTokens,
          totalResTokens: item.totalResTokens
        });
      }
    });

    return Array.from(aggregationMap.values()).sort((a, b) => b.totalCost - a.totalCost);
  }

  // === 履歴ページング ===

  onHistoryPageChange(event: PageEvent): void {
    this.historyPageSize = event.pageSize;
    // ページサイズ変更で最大ページ数を超えないよう調整
    const maxPage = Math.ceil(this.filteredHistoryCount / this.historyPageSize) - 1;
    this.historyCurrentPage = Math.min(event.pageIndex, Math.max(0, maxPage));
    this.historyTargetPage = this.historyCurrentPage + 1;
  }

  goToHistoryPage(): void {
    if (this.historyTargetPage < 1 || this.historyTargetPage > this.historyTotalPages) {
      this.translate.get('PAGE_NUMBER_RANGE_ERROR', { max: this.historyTotalPages }).subscribe(msg => {
        this.snackBar.open(msg, 'OK', { duration: 3000 });
      });
      this.historyTargetPage = this.historyCurrentPage + 1;
      return;
    }

    this.historyCurrentPage = this.historyTargetPage - 1;
  }

  // === 詳細ダイアログ ===

  openPredictDetail(predict: PredictTransaction): void {
    const userId = this.data?.member?.id;

    this.dialog.open(PredictDetailComponent, {
      data: {
        predict: predict,
        userId: userId
      },
      width: '90vw',
      maxWidth: '1200px',
      height: '80vh',
      panelClass: 'predict-detail-dialog-container'
    });
  }
}
