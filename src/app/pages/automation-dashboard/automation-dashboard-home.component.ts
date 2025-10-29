import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import {
  AutomationJobAction,
  AutomationJobListItem,
  AutomationJobsQuery,
  AutomationSummary,
  JobStatus,
  Pagination,
  SummaryMetric,
} from './automation-dashboard.models';
import { AutomationDashboardService } from './automation-dashboard.service';
import { AutomationDashboardStore } from './automation-dashboard.store';
import { getProgressBarClass, getStatusBadgeClass, getStatusLabel } from './automation-dashboard.models';
import { NotificationService } from '../../shared/services/notification.service';

@Component({
  selector: 'app-automation-dashboard-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './automation-dashboard-home.component.html',
  styleUrls: ['./automation-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutomationDashboardHomeComponent implements OnInit, OnDestroy {
  private readonly automationService = inject(AutomationDashboardService);
  private readonly notificationService = inject(NotificationService);
  private readonly store = inject(AutomationDashboardStore);

  private readonly summaryFormatter = new Intl.NumberFormat('ja-JP');
  private readonly currencyFormatter = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private readonly subscriptions = new Subscription();
  private summarySubscription?: Subscription;
  private jobsSubscription?: Subscription;
  readonly projects = this.store.projects;
  readonly selectedProjectId = this.store.selectedProjectId;

  readonly summary = signal<AutomationSummary | null>(null);
  readonly summaryMetrics = signal<SummaryMetric[]>([]);
  readonly jobs = signal<AutomationJobListItem[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loadingSummary = signal(false);
  readonly loadingJobs = signal(false);
  readonly jobActionState = signal<{ jobId: string; action: AutomationJobAction } | null>(null);
  readonly searchTerm = signal('');
  readonly triggerFilter = signal<'all' | 'manual' | 'schedule'>('all');
  readonly statusFilter = signal<JobStatus | 'all'>('all');
  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly projectNameMap = computed(() => {
    const map = new Map<string, string>();
    for (const project of this.projects()) {
      map.set(project.id, project.name);
    }
    return map;
  });

  readonly getStatusLabel = getStatusLabel;
  readonly getStatusBadgeClass = getStatusBadgeClass;
  readonly getProgressBarClass = getProgressBarClass;

  ngOnInit(): void {
    this.subscriptions.add(
      this.store.jobCreated$.subscribe(() => {
        const projectId = this.selectedProjectId();
        this.loadSummary(projectId);
        this.loadJobs(projectId);
      }),
    );

    effect(
      () => {
        const projectId = this.selectedProjectId();
        this.page.set(1);
        this.loadSummary(projectId);
        this.loadJobs(projectId);
      },
      { allowSignalWrites: true },
    );
  }

  ngOnDestroy(): void {
    this.summarySubscription?.unsubscribe();
    this.jobsSubscription?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  onProjectChange(projectId: string): void {
    this.store.updateSelectedProject(projectId || null);
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
    this.page.set(1);
    this.loadJobs(this.selectedProjectId());
  }

  onTriggerChange(trigger: 'all' | 'manual' | 'schedule'): void {
    this.triggerFilter.set(trigger);
    this.page.set(1);
    this.loadJobs(this.selectedProjectId());
  }

  onStatusChange(status: JobStatus | 'all'): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.loadJobs(this.selectedProjectId());
  }

  refresh(): void {
    this.loadSummary(this.selectedProjectId());
    this.loadJobs(this.selectedProjectId());
  }

  goToPage(page: number): void {
    const pagination = this.pagination();
    if (!pagination) {
      return;
    }
    if (page < 1 || page > pagination.totalPages) {
      return;
    }
    this.page.set(page);
    this.loadJobs(this.selectedProjectId());
  }

  formatProject(projectId: string): string {
    return this.projectNameMap().get(projectId) ?? projectId;
  }

  formatPercent(value?: number): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '-';
    }
    return `${value}%`;
  }

  trackByJobId(_index: number, job: AutomationJobListItem): string {
    return job.id;
  }

  isActionLoading(jobId: string, action: AutomationJobAction): boolean {
    const state = this.jobActionState();
    return !!state && state.jobId === jobId && state.action === action;
  }

  performAction(job: AutomationJobListItem, action: AutomationJobAction): void {
    if (this.isActionLoading(job.id, action)) {
      return;
    }
    this.jobActionState.set({ jobId: job.id, action });
    const projectId = this.selectedProjectId();
    const subscription = this.automationService
      .runAction(job.id, action)
      .pipe(finalize(() => this.jobActionState.set(null)))
      .subscribe({
        next: () => {
          this.notificationService.showSuccess(this.getActionSuccessMessage(action));
          this.loadSummary(projectId);
          this.loadJobs(projectId);
        },
        error: error => {
          this.notificationService.showLongError(error, 'ジョブ操作に失敗しました');
        },
      });
    this.subscriptions.add(subscription);
  }

  private loadSummary(projectId: string | null): void {
    this.summarySubscription?.unsubscribe();
    this.loadingSummary.set(true);
    this.summarySubscription = this.automationService
      .getSummary(projectId ?? undefined)
      .pipe(finalize(() => this.loadingSummary.set(false)))
      .subscribe({
        next: summary => {
          this.summary.set(summary);
          this.summaryMetrics.set(this.toSummaryMetrics(summary));
        },
        error: error => {
          this.notificationService.showLongError(error, 'サマリーの取得に失敗しました');
        },
      });
  }

  private loadJobs(projectId: string | null): void {
    this.jobsSubscription?.unsubscribe();
    this.loadingJobs.set(true);
    const query: AutomationJobsQuery = {
      page: this.page(),
      pageSize: this.pageSize(),
      search: this.searchTerm().trim() || undefined,
    };
    const trigger = this.triggerFilter();
    if (trigger !== 'all') {
      query.trigger = trigger;
    }
    const status = this.statusFilter();
    if (status !== 'all') {
      query.status = [status];
    }
    if (projectId) {
      query.projectId = projectId;
    }

    this.jobsSubscription = this.automationService
      .listJobs(query)
      .pipe(finalize(() => this.loadingJobs.set(false)))
      .subscribe({
        next: response => {
          this.jobs.set(response.items);
          this.pagination.set(response.pagination);
        },
        error: error => {
          this.notificationService.showLongError(error, 'ジョブの取得に失敗しました');
        },
      });
  }

  private toSummaryMetrics(summary: AutomationSummary): SummaryMetric[] {
    return [
      { label: '実行中ジョブ', value: this.summaryFormatter.format(summary.runningJobs), tone: 'running' },
      { label: '待機中ジョブ', value: this.summaryFormatter.format(summary.pendingJobs) },
      { label: '今日完了したジョブ', value: this.summaryFormatter.format(summary.completedJobsToday) },
      { label: 'エラー (24h)', value: this.summaryFormatter.format(summary.errorsLast24h), tone: 'error' },
      { label: '推定コスト (今日)', value: this.currencyFormatter.format(summary.estimatedCostTodayUsd) },
    ];
  }

  private getActionSuccessMessage(action: AutomationJobAction): string {
    switch (action) {
      case 'stop':
      case 'cancel':
        return 'ジョブを停止しました';
      case 'resume':
        return 'ジョブを再開しました';
      case 'retry':
        return 'ジョブを再実行しました';
      case 'retryErrors':
        return 'エラーのタスクを再実行しました';
      default:
        return 'ジョブを更新しました';
    }
  }
}
