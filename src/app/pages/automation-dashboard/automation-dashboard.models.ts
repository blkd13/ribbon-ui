export type JobStatus = 'pending' | 'running' | 'completed' | 'error' | 'stopped';
export type JobTrigger = 'manual' | 'schedule';

export interface SummaryMetric {
  label: string;
  value: string;
  tone?: 'running' | 'error';
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AutomationSummary {
  runningJobs: number;
  pendingJobs: number;
  completedJobsToday: number;
  errorsLast24h: number;
  estimatedCostTodayUsd: number;
}

export interface AutomationJobProgress {
  current: number;
  total: number;
  percent: number;
}

export interface AutomationJobListItem {
  id: string;
  projectId: string;
  name: string;
  status: JobStatus;
  trigger: JobTrigger;
  startedAt?: string;
  durationSeconds?: number;
  durationHuman?: string;
  progress?: AutomationJobProgress;
  lastRunId?: string;
  estimatedCostUsd?: number;
  progressColor?: 'primary' | 'error' | 'muted';
}

export interface AutomationJobListResponse {
  items: AutomationJobListItem[];
  pagination: Pagination;
}

export interface AutomationJobSnapshot {
  prompt: string;
  parameters: Record<string, unknown>;
}

export interface AutomationJobDetail {
  jobId: string;
  projectId: string;
  name: string;
  status: JobStatus;
  trigger: JobTrigger;
  startedAt?: string;
  durationSeconds?: number;
  durationHuman?: string;
  model: {
    provider: string;
    modelId: string;
  };
  totals: {
    tasks: number;
    completed: number;
    errors: number;
    costUsd: number;
  };
  snapshot: AutomationJobSnapshot;
  lastRunId?: string;
}

export interface AutomationTaskItem {
  taskId: string;
  status: JobStatus;
  inputPreview: string;
  outputPreview?: string;
  tokens: number;
  durationSeconds: number;
  errorMessage?: string;
}

export interface AutomationTaskListResponse {
  items: AutomationTaskItem[];
  pagination: Pagination;
}

export type AutomationJobAction = 'stop' | 'cancel' | 'resume' | 'retry' | 'retryErrors';

export interface AutomationJobActionRequest {
  action: AutomationJobAction;
}

export interface AutomationJobsQuery {
  page?: number;
  pageSize?: number;
  status?: JobStatus[];
  trigger?: JobTrigger;
  projectId?: string;
  search?: string;
  sort?: string;
}

export interface AutomationTasksQuery {
  page?: number;
  pageSize?: number;
  status?: JobStatus[];
  search?: string;
}

export interface AutomationJobCreateRequest {
  projectId: string;
  name: string;
  description?: string;
  trigger: JobTrigger;
  schedule?: {
    cron: string;
    timezone: string;
  };
  model: {
    provider: string;
    modelId: string;
  };
  promptTemplate: string;
  input: {
    source: string;
    fileId?: string;
  };
  parallelism: number;
  retryLimit: number;
}

export interface AutomationJobCreateResponse {
  jobId: string;
  status: JobStatus;
  projectId: string;
  createdAt: string;
}

export interface JobFormSchedule {
  cron: string;
  timezone: string;
}

export interface JobFormInput {
  source: string;
  fileId?: string;
}

export interface JobForm {
  projectId: string;
  name: string;
  description: string;
  trigger: JobTrigger;
  schedule: JobFormSchedule | null;
  model: string;
  providerName: string;
  promptTemplate: string;
  input: JobFormInput | null;
  parallelism: number;
  retryLimit: number;
}

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: '待機中',
  running: '実行中',
  completed: '完了',
  error: 'エラー',
  stopped: '停止',
};

const STATUS_CLASS_MAP: Record<JobStatus, string> = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  error: 'error',
  stopped: 'stopped',
};

export function getStatusLabel(status: JobStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function getStatusBadgeClass(status: JobStatus): string {
  return `status-badge ${STATUS_CLASS_MAP[status] ?? 'pending'}`;
}

export function getProgressBarClass(job: AutomationJobListItem): string {
  switch (job.progressColor) {
    case 'error':
      return 'progress-bar-inner error';
    case 'muted':
      return 'progress-bar-inner muted';
    default:
      return 'progress-bar-inner';
  }
}
