import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

type DashboardViewId = 'runs' | 'threads' | 'schedules' | 'workers' | 'settings';
type RunStatus = 'running' | 'queued' | 'failed' | 'succeeded';
type QueueAction = 'pause' | 'resume' | 'drain';
type ModalKey = 'run' | 'thread' | 'schedule';

interface DashboardView {
  id: DashboardViewId;
  label: string;
  icon: string;
  helper: string;
}

interface RunRow {
  id: string;
  threadName: string;
  threadVersion: string;
  schedule: string;
  status: RunStatus;
  jobs: number;
  successRate: number;
  p95Seconds: number;
  cost: number;
  startedAt: string;
  finishedAt: string | null;
}

interface RunMetric {
  label: string;
  value: string;
  helper: string;
}

interface RunJob {
  id: string;
  inputKey: string;
  status: RunStatus;
  attempts: number;
  durationSeconds: number | null;
  cost: number | null;
  error?: string;
}

interface RunSnapshot {
  threadLabel: string;
  model: string;
  prompt: string;
  parameters: Record<string, unknown>;
}

interface RunDetail {
  runId: string;
  status: RunStatus;
  jobCount: number;
  successRate: number;
  cost: number;
  snapshot: RunSnapshot;
  jobs: RunJob[];
  outputPreview: string;
}

interface ThreadRow {
  name: string;
  version: string;
  model: string;
  tags: string[];
  updatedAt: string;
}

interface ScheduleRow {
  name: string;
  thread: string;
  cron: string;
  tz: string;
  concurrency: number;
  retry: string;
  enabled: boolean;
  nextRun: string;
}

interface WorkerCard {
  id: string;
  status: RunStatus | 'healthy';
  version: string;
  runtime: string;
  region: string;
  running: number;
  capacity: number;
  heartbeat: string;
  extra?: string;
}

interface QueueRow {
  name: string;
  waiting: number;
  processing: number;
  failuresPerHour: number;
  estimatedTpm: string;
}

interface SettingTile {
  label: string;
  value: string;
  helper: string;
  icon: string;
}

const DASHBOARD_VIEWS: DashboardView[] = [
  { id: 'runs', label: 'Runs', icon: 'timeline', helper: '直近 24h' },
  { id: 'threads', label: 'Threads', icon: 'forum', helper: 'テンプレート' },
  { id: 'schedules', label: 'Schedules', icon: 'schedule', helper: 'cron' },
  { id: 'workers', label: 'Workers / Queues', icon: 'precision_manufacturing', helper: '稼働状況' },
  { id: 'settings', label: 'Settings', icon: 'tune', helper: '運用設定' },
];

const RUN_ROWS: RunRow[] = [
  {
    id: 'run_8f31a1',
    threadName: 'daily-news-summarizer',
    threadVersion: 'v3',
    schedule: '毎時 xx:05 (JST)',
    status: 'running',
    jobs: 120,
    successRate: 95.8,
    p95Seconds: 39.1,
    cost: 6.32,
    startedAt: '10:05:12',
    finishedAt: null,
  },
  {
    id: 'run_7be90c',
    threadName: 'embedding-indexer',
    threadVersion: 'v1',
    schedule: '0 9 * * 1-5 (UTC)',
    status: 'succeeded',
    jobs: 50,
    successRate: 100,
    p95Seconds: 8.4,
    cost: 1.02,
    startedAt: '09:00:01',
    finishedAt: '09:03:12',
  },
  {
    id: 'run_5a924e',
    threadName: 'image-captioner',
    threadVersion: 'v2',
    schedule: '手動',
    status: 'failed',
    jobs: 40,
    successRate: 72.5,
    p95Seconds: 54.2,
    cost: 4.76,
    startedAt: '08:12:10',
    finishedAt: '08:25:44',
  },
  {
    id: 'run_3dd184',
    threadName: 'product-catalog-audit',
    threadVersion: 'v4',
    schedule: '毎時 xx:30 (UTC)',
    status: 'queued',
    jobs: 64,
    successRate: 0,
    p95Seconds: 0,
    cost: 0,
    startedAt: '—',
    finishedAt: null,
  },
];

const RUN_DETAILS: RunDetail[] = [
  {
    runId: 'run_8f31a1',
    status: 'running',
    jobCount: 120,
    successRate: 95.8,
    cost: 6.32,
    snapshot: {
      threadLabel: 'daily-news-summarizer v3 • gpt-4o-mini',
      model: 'gpt-4o-mini',
      prompt: 'You are a helpful assistant. Summarize global news into bullet points with source links and short headlines.',
      parameters: { temperature: 0.3, max_tokens: 600 },
    },
    jobs: [
      { id: 'job_001', inputKey: 'nytimes:12345', status: 'succeeded', attempts: 1, durationSeconds: 8.2, cost: 0.03 },
      { id: 'job_065', inputKey: 'guardian:98765', status: 'failed', attempts: 3, durationSeconds: 12.4, cost: 0.01, error: '429 rate limited' },
      { id: 'job_066', inputKey: 'guardian:98766', status: 'running', attempts: 1, durationSeconds: null, cost: null },
    ],
    outputPreview: `{
  "title": "X社が新製品を発表",
  "bullets": [
    "ポイント1...",
    "ポイント2..."
  ],
  "source": "https://example.com/article"
}`,
  },
  {
    runId: 'run_7be90c',
    status: 'succeeded',
    jobCount: 50,
    successRate: 100,
    cost: 1.02,
    snapshot: {
      threadLabel: 'embedding-indexer v1 • text-embedding-3-large',
      model: 'text-embedding-3-large',
      prompt: 'Generate embeddings for each incoming product record. The output must be a 3072 dimension vector.',
      parameters: { encoding_format: 'float', batch_size: 32 },
    },
    jobs: [
      { id: 'job_201', inputKey: 'sku:1001', status: 'succeeded', attempts: 1, durationSeconds: 5.6, cost: 0.02 },
      { id: 'job_202', inputKey: 'sku:1002', status: 'succeeded', attempts: 1, durationSeconds: 4.8, cost: 0.02 },
    ],
    outputPreview: '{ "embedding": [0.12, -0.08, 0.44, "..."] }',
  },
  {
    runId: 'run_5a924e',
    status: 'failed',
    jobCount: 40,
    successRate: 72.5,
    cost: 4.76,
    snapshot: {
      threadLabel: 'image-captioner v2 • gpt-4o',
      model: 'gpt-4o',
      prompt: 'Produce a concise caption (JP) for the supplied image URL. Mention brand names when visible.',
      parameters: { temperature: 0.4, max_tokens: 120 },
    },
    jobs: [
      { id: 'job_901', inputKey: 'cdn:img-4321', status: 'succeeded', attempts: 1, durationSeconds: 21.5, cost: 0.09 },
      { id: 'job_914', inputKey: 'cdn:img-4377', status: 'failed', attempts: 4, durationSeconds: 58.0, cost: 0.12, error: 'Vision model timeout' },
      { id: 'job_915', inputKey: 'cdn:img-4378', status: 'queued', attempts: 0, durationSeconds: null, cost: null },
    ],
    outputPreview: 'キャプション生成に失敗しました。追加の再試行が必要です。',
  },
];

const THREAD_ROWS: ThreadRow[] = [
  {
    name: 'daily-news-summarizer',
    version: 'v3',
    model: 'gpt-4o-mini',
    tags: ['news', 'summary'],
    updatedAt: '今日 09:41',
  },
  {
    name: 'embedding-indexer',
    version: 'v1',
    model: 'text-embedding-3-large',
    tags: ['search'],
    updatedAt: '昨日 17:20',
  },
  {
    name: 'image-captioner',
    version: 'v2',
    model: 'gpt-4o',
    tags: ['vision'],
    updatedAt: '今週 10/18',
  },
  {
    name: 'qa-digest',
    version: 'v5',
    model: 'gpt-4o-mini',
    tags: ['qa', 'knowledge'],
    updatedAt: '今日 08:05',
  },
];

const SCHEDULE_ROWS: ScheduleRow[] = [
  {
    name: '毎時要約',
    thread: 'daily-news-summarizer:v3',
    cron: '5 * * * *',
    tz: 'Asia/Tokyo',
    concurrency: 6,
    retry: '最大3回 / 2x backoff',
    enabled: true,
    nextRun: '10:05',
  },
  {
    name: '平日朝インデックス',
    thread: 'embedding-indexer:v1',
    cron: '0 9 * * 1-5',
    tz: 'UTC',
    concurrency: 3,
    retry: '最大2回',
    enabled: true,
    nextRun: '明日 09:00',
  },
  {
    name: '画像キャプション夜間',
    thread: 'image-captioner:v2',
    cron: '0 1 * * *',
    tz: 'UTC',
    concurrency: 4,
    retry: '最大5回',
    enabled: false,
    nextRun: '—',
  },
];

const WORKER_CARDS: WorkerCard[] = [
  {
    id: 'worker-a-01',
    status: 'healthy',
    version: 'v0.1.3',
    runtime: 'node18',
    region: 'ap-northeast-1',
    running: 2,
    capacity: 8,
    heartbeat: '5s前',
  },
  {
    id: 'worker-b-02',
    status: 'running',
    version: 'v0.1.2',
    runtime: 'node18',
    region: 'us-east-1',
    running: 8,
    capacity: 8,
    heartbeat: '18s前',
    extra: 'キュー遅延 230',
  },
  {
    id: 'worker-c-03',
    status: 'failed',
    version: 'v0.1.1',
    runtime: 'node18',
    region: 'us-east-1',
    running: 0,
    capacity: 8,
    heartbeat: '3m前',
  },
];

const QUEUE_ROWS: QueueRow[] = [
  {
    name: 'default',
    waiting: 312,
    processing: 10,
    failuresPerHour: 2.1,
    estimatedTpm: '28k',
  },
  {
    name: 'embedding',
    waiting: 0,
    processing: 0,
    failuresPerHour: 0,
    estimatedTpm: '—',
  },
];

const SETTING_TILES: SettingTile[] = [
  { label: '日次予算', value: '$100', helper: '80%超で通知', icon: 'paid' },
  { label: 'レート制限', value: 'TPM 200k', helper: 'モデル別に適用', icon: 'speed' },
  { label: '監査ログ', value: 'ON', helper: '保持 30日', icon: 'history' },
  { label: 'データ保管', value: 'Postgres + S3', helper: 'ログは7日でS3へ', icon: 'cloud' },
];

@Component({
  selector: 'app-automation-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './automation-dashboard.component.html',
  styleUrl: './automation-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AutomationDashboardComponent {
  readonly views = DASHBOARD_VIEWS;
  readonly runRows = RUN_ROWS;
  readonly threadRows = THREAD_ROWS;
  readonly scheduleRows = SCHEDULE_ROWS;
  readonly workerCards = WORKER_CARDS;
  readonly queueRows = QUEUE_ROWS;
  readonly settingTiles = SETTING_TILES;

  readonly activeView = signal<DashboardViewId>('runs');
  readonly searchTerm = signal('');
  readonly timeRange = signal('24h');
  readonly selectedRunId = signal<string | null>(null);
  readonly drawerOpen = signal(false);
  readonly activeModal = signal<ModalKey | null>(null);

  private readonly runDetailMap = new Map(RUN_DETAILS.map(detail => [detail.runId, detail]));

  readonly filteredRuns = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.runRows;
    }
    return this.runRows.filter(run => {
      const fields = [
        run.id,
        run.threadName,
        run.threadVersion,
        run.schedule,
        run.status,
      ];
      return fields.some(field => field.toLowerCase().includes(term));
    });
  });

  readonly runMetrics = computed<RunMetric[]>(() => {
    const runs = this.runRows;
    const total = runs.length;
    const successRuns = runs.filter(run => run.status === 'succeeded').length;
    const failureCount = runs.filter(run => run.status === 'failed').length;
    const runningCount = runs.filter(run => run.status === 'running').length;
    const aggregatedSuccessRate = runs.reduce((sum, run) => sum + run.successRate, 0) / (total || 1);
    const p95 = runs.find(run => run.status === 'running')?.p95Seconds ?? runs[0]?.p95Seconds ?? 0;
    const cost = runs.reduce((sum, run) => sum + run.cost, 0);

    return [
      { label: '総Run数', value: `${total}`, helper: `稼働中 ${runningCount}` },
      { label: '成功率', value: `${aggregatedSuccessRate.toFixed(1)}%`, helper: `失敗 ${failureCount}` },
      { label: 'p95 実行時間', value: `${p95.toFixed(1)}s`, helper: 'p50 11.8s' },
      { label: 'コスト合計', value: `$${cost.toFixed(2)}`, helper: '予算残 78%' },
    ];
  });

  readonly selectedRunDetail = computed<RunDetail | null>(() => {
    const runId = this.selectedRunId();
    if (!runId) {
      return null;
    }
    return this.runDetailMap.get(runId) ?? null;
  });

  setActiveView(view: DashboardViewId): void {
    this.activeView.set(view);
  }

  openRun(runId: string): void {
    this.selectedRunId.set(runId);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  statusClass(status: RunStatus | 'healthy'): string {
    switch (status) {
      case 'running':
        return 'status-running';
      case 'queued':
        return 'status-queued';
      case 'failed':
        return 'status-failed';
      case 'succeeded':
        return 'status-succeeded';
      case 'healthy':
        return 'status-healthy';
      default:
        return '';
    }
  }

  formatDuration(seconds: number | null): string {
    if (seconds == null) {
      return '—';
    }
    if (seconds >= 60) {
      return `${seconds.toFixed(1)}s`;
    }
    return `${seconds.toFixed(1)}s`;
  }

  formatCost(cost: number | null): string {
    if (cost == null) {
      return '—';
    }
    return `$${cost.toFixed(2)}`;
  }

  openModal(key: ModalKey): void {
    this.activeModal.set(key);
  }

  closeModal(): void {
    this.activeModal.set(null);
  }

  toggleQueue(action: QueueAction, queue: QueueRow): void {
    // Placeholder for integration with backend actions.
    console.log(`Queue action executed`, { action, queue });
  }

  queueActionLabel(action: QueueAction): string {
    switch (action) {
      case 'pause':
        return '一時停止';
      case 'resume':
        return '再開';
      case 'drain':
        return 'ドレイン';
      default:
        return action;
    }
  }
}

