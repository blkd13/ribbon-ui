import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import {
  AutomationJobAction,
  AutomationJobDetail,
  AutomationTaskItem,
  AutomationTasksQuery,
  JobStatus,
  Pagination,
} from './automation-dashboard.models';
import { AutomationDashboardService } from './automation-dashboard.service';
import { AutomationDashboardStore } from './automation-dashboard.store';
import { getStatusBadgeClass, getStatusLabel } from './automation-dashboard.models';
import { NotificationService } from '../../shared/services/notification.service';

@Component({
  selector: 'app-automation-dashboard-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './automation-dashboard-detail.component.html',
  styleUrls: ['./automation-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutomationDashboardDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly automationService = inject(AutomationDashboardService);
  private readonly notificationService = inject(NotificationService);
  private readonly store = inject(AutomationDashboardStore);

  private readonly subscriptions = new Subscription();
  private jobSubscription?: Subscription;
  private tasksSubscription?: Subscription;

  readonly jobId = signal<string | null>(null);
  readonly job = signal<AutomationJobDetail | null>(null);
  readonly tasks = signal<AutomationTaskItem[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly loadingJob = signal(false);
  readonly loadingTasks = signal(false);
  readonly jobAction = signal<AutomationJobAction | null>(null);
  readonly taskStatusFilter = signal<JobStatus | 'all'>('all');
  readonly taskSearch = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(50);

  readonly taskStatusOptions: { label: string; value: JobStatus | 'all' }[] = [
    { label: 'すべて', value: 'all' },
    { label: '完了', value: 'completed' },
    { label: '実行中', value: 'running' },
    { label: '待機中', value: 'pending' },
    { label: '停止', value: 'stopped' },
    { label: 'エラー', value: 'error' },
  ];

  readonly totals = computed(() => this.job()?.totals);

  readonly getStatusLabel = getStatusLabel;
  readonly getStatusBadgeClass = getStatusBadgeClass;

  ngOnInit(): void {
    this.subscriptions.add(
      this.route.paramMap.subscribe(params => {
        const jobId = params.get('jobId');
        if (!jobId) {
          this.notificationService.showError('ジョブ ID が指定されていません');
          return;
        }
        this.jobId.set(jobId);
        this.page.set(1);
        this.loadJob(jobId);
        this.loadTasks(jobId);
      }),
    );
  }

  ngOnDestroy(): void {
    this.jobSubscription?.unsubscribe();
    this.tasksSubscription?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  refresh(): void {
    const jobId = this.jobId();
    if (!jobId) {
      return;
    }
    this.loadJob(jobId);
    this.loadTasks(jobId);
  }

  onTaskStatusChange(status: JobStatus | 'all'): void {
    this.taskStatusFilter.set(status);
    this.page.set(1);
    this.reloadTasks();
  }

  onTaskSearchChange(value: string): void {
    this.taskSearch.set(value);
    this.page.set(1);
    this.reloadTasks();
  }

  goToPage(page: number): void {
    const pager = this.pagination();
    if (!pager) {
      return;
    }
    if (page < 1 || page > pager.totalPages) {
      return;
    }
    this.page.set(page);
    this.reloadTasks();
  }

  performAction(action: AutomationJobAction): void {
    const jobId = this.jobId();
    if (!jobId || this.jobAction() === action) {
      return;
    }
    this.jobAction.set(action);
    this.automationService
      .runAction(jobId, action)
      .pipe(finalize(() => this.jobAction.set(null)))
      .subscribe({
        next: job => {
          this.job.set(job);
          this.store.updateSelectedProject(job.projectId);
          this.notificationService.showSuccess(this.getActionSuccessMessage(action));
          this.loadTasks(jobId);
        },
        error: error => {
          this.notificationService.showLongError(error, 'ジョブ操作に失敗しました');
        },
      });
  }

  trackTask(_index: number, task: AutomationTaskItem): string {
    return task.taskId;
  }

  reloadTasks(): void {
    const jobId = this.jobId();
    if (!jobId) {
      return;
    }
    this.loadTasks(jobId);
  }

  private loadJob(jobId: string): void {
    this.jobSubscription?.unsubscribe();
    this.loadingJob.set(true);
    this.jobSubscription = this.automationService
      .getJob(jobId)
      .pipe(finalize(() => this.loadingJob.set(false)))
      .subscribe({
        next: job => {
          this.job.set(job);
          this.store.updateSelectedProject(job.projectId);
        },
        error: error => {
          this.notificationService.showLongError(error, 'ジョブ情報の取得に失敗しました');
        },
      });
  }

  private loadTasks(jobId: string): void {
    this.tasksSubscription?.unsubscribe();
    this.loadingTasks.set(true);
    const query: AutomationTasksQuery = {
      page: this.page(),
      pageSize: this.pageSize(),
      search: this.taskSearch().trim() || undefined,
    };
    const status = this.taskStatusFilter();
    if (status !== 'all') {
      query.status = [status];
    }

    this.tasksSubscription = this.automationService
      .listTasks(jobId, query)
      .pipe(finalize(() => this.loadingTasks.set(false)))
      .subscribe({
        next: response => {
          this.tasks.set(response.items);
          this.pagination.set(response.pagination);
        },
        error: error => {
          this.notificationService.showLongError(error, 'タスク一覧の取得に失敗しました');
        },
      });
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
