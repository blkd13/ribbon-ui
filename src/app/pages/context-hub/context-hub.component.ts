import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

type ContextStatus = 'ok' | 'syncing' | 'error';
type ResourceKind = 'folder' | 'channel' | 'api' | 'database' | 'storage' | 'knowledge' | 'code' | 'web';
type WizardStep = 1 | 2 | 3 | 4;

interface ContextSummary {
  id: string;
  name: string;
  isFavorite?: boolean;
  hasIssue?: boolean;
  description?: string;
  resources: ContextResource[];
  activityLog: string;
}

interface ContextResource {
  id: string;
  name: string;
  kind: ResourceKind;
  integrationType: string;
  path: string;
  status: ContextStatus;
  itemCount?: number;
  lastSynced: string;
  syncSetting: string;
}

interface WizardSourceOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  kind: ResourceKind;
  integrationType: string;
  pathPlaceholder?: string;
  suggestedName?: string;
}

interface WizardStepMeta {
  id: WizardStep;
  label: string;
}

interface ResourceWizardForm {
  sourceId: string;
  name: string;
  path: string;
  filePattern: string;
  searchType: 'vector' | 'fulltext' | 'hybrid' | 'tool';
  chunkSize: 'auto' | '512' | '1024' | '2048';
  syncSetting: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'manual';
  changeDetection: boolean;
  keepDeleted: boolean;
  filters: string;
  enableOcr: boolean;
}

@Component({
  selector: 'app-context-hub',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './context-hub.component.html',
  styleUrl: './context-hub.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextHubComponent {
  readonly searchTerm = signal('');
  readonly selectedContextId = signal<string | null>(null);
  readonly selectedResourceId = signal<string | null>(null);
  readonly isSyncing = signal(false);
  readonly wizardSourceOptions: WizardSourceOption[] = [
    {
      id: 'folder-local',
      label: 'ファイル / フォルダ',
      description: '社内共有やローカルディレクトリを取り込み',
      icon: 'folder',
      kind: 'folder',
      integrationType: 'ファイルストレージ',
      pathPlaceholder: '\\\\share-sv\\docs\\project\\',
      suggestedName: 'プロジェクト資料フォルダ',
    },
    {
      id: 'cloud-drive',
      label: 'クラウドストレージ',
      description: 'OneDrive・Google Drive・Box',
      icon: 'cloud',
      kind: 'storage',
      integrationType: 'クラウドストレージ',
      pathPlaceholder: 'https://drive.google.com/drive/u/0/folders/...',
      suggestedName: 'クラウドドキュメント',
    },
    {
      id: 'teams-channel',
      label: 'Teams / Slack',
      description: 'チャネルやスレッドの履歴を同期',
      icon: 'forum',
      kind: 'channel',
      integrationType: 'コラボレーション',
      pathPlaceholder: 'msteams://team/channel',
      suggestedName: 'チームチャネルログ',
    },
    {
      id: 'confluence',
      label: 'Confluence / Notion',
      description: 'ナレッジベースや手順書を取り込み',
      icon: 'content_paste_search',
      kind: 'knowledge',
      integrationType: 'ナレッジベース',
      pathPlaceholder: 'https://confluence.example.com/display/...',
      suggestedName: 'ナレッジベース',
    },
    {
      id: 'database',
      label: 'データベース',
      description: 'SQL・NoSQLデータベースに接続',
      icon: 'database',
      kind: 'database',
      integrationType: 'データベース',
      pathPlaceholder: 'postgres://user:pass@host:5432/db',
      suggestedName: '業務データベース',
    },
    {
      id: 'api',
      label: 'REST / GraphQL API',
      description: 'リアルタイムの外部APIと連携',
      icon: 'api',
      kind: 'api',
      integrationType: 'API連携',
      pathPlaceholder: 'https://api.example.com/v1/',
      suggestedName: '業務API連携',
    },
    {
      id: 'code-host',
      label: 'GitHub / GitLab',
      description: 'ドキュメントやリードミーを同期',
      icon: 'code',
      kind: 'code',
      integrationType: 'コードリポジトリ',
      pathPlaceholder: 'https://github.com/org/repo',
      suggestedName: 'リポジトリドキュメント',
    },
    {
      id: 'website',
      label: 'Webサイト',
      description: '公開サイトをクロールして収集',
      icon: 'language',
      kind: 'web',
      integrationType: 'Webクローラ',
      pathPlaceholder: 'https://example.com/docs',
      suggestedName: '公開サイト',
    },
  ];
  readonly wizardStepsMeta: WizardStepMeta[] = [
    { id: 1, label: 'ソース選択' },
    { id: 2, label: '接続設定' },
    { id: 3, label: '詳細設定' },
    { id: 4, label: '確認' },
  ];
  readonly wizardSearchOptions: ReadonlyArray<{ value: ResourceWizardForm['searchType']; label: string; }> = [
    { value: 'vector', label: 'ベクトル検索（セマンティック）' },
    { value: 'fulltext', label: '全文検索' },
    { value: 'hybrid', label: 'ハイブリッド検索' },
    { value: 'tool', label: 'ツール呼び出し（リアルタイム取得）' },
  ];
  readonly wizardSyncOptions: ReadonlyArray<{ value: ResourceWizardForm['syncSetting']; label: string; }> = [
    { value: 'realtime', label: 'リアルタイム同期' },
    { value: 'hourly', label: '1時間ごと' },
    { value: 'daily', label: '1日1回' },
    { value: 'weekly', label: '週1回' },
    { value: 'manual', label: '手動のみ' },
  ];
  readonly wizardStep = signal<WizardStep>(1);
  readonly isWizardOpen = signal(false);
  readonly wizardForm = signal<ResourceWizardForm>(this.createDefaultWizardForm());
  readonly wizardTestStatus = signal<'idle' | 'running' | 'success' | 'error'>('idle');
  readonly wizardTestMessage = signal('');
  readonly wizardDetectedFiles = signal<number | null>(null);
  readonly wizardDetectedSize = signal<string | null>(null);
  readonly wizardUploadMessage = signal<string | null>(null);
  readonly isWizardDragging = signal(false);
  readonly selectedWizardSource = computed(() => {
    const form = this.wizardForm();
    return this.wizardSourceOptions.find(option => option.id === form.sourceId) ?? this.wizardSourceOptions[0];
  });

  readonly contexts = signal<ContextSummary[]>([
    {
      id: 'ctx-project-a',
      name: 'プロジェクトA',
      isFavorite: true,
      activityLog: '2023/10/27 15:00 user_A が「API: 社内Jiraチケット」を追加',
      resources: [
        {
          id: 'res-a-folder',
          name: 'PJT-A 仕様書フォルダ',
          kind: 'folder',
          integrationType: 'ベクトル検索',
          path: '\\\\share-sv\\docs\\project_A\\',
          status: 'ok',
          itemCount: 128,
          lastSynced: '2023/10/27 14:30',
          syncSetting: '1時間ごとに自動実行',
        },
        {
          id: 'res-a-teams',
          name: 'Teams: PJT-A 技術相談ch',
          kind: 'channel',
          integrationType: 'ベクトル検索',
          path: 'msteams://pjt-a/技術相談',
          status: 'syncing',
          itemCount: undefined,
          lastSynced: '同期待ち',
          syncSetting: '1日1回実行',
        },
        {
          id: 'res-a-jira',
          name: 'API: 社内Jiraチケット',
          kind: 'api',
          integrationType: 'ToolCall',
          path: 'https://jira.example.local/api',
          status: 'ok',
          itemCount: undefined,
          lastSynced: '2023/10/27 11:00',
          syncSetting: '手動のみ',
        },
        {
          id: 'res-a-db',
          name: 'DB: 顧客データベース',
          kind: 'database',
          integrationType: 'ToolCall',
          path: 'postgres://prod/customer',
          status: 'error',
          itemCount: undefined,
          lastSynced: '2023/10/27 08:45',
          syncSetting: '1時間ごとに自動実行',
        },
      ],
    },
    {
      id: 'ctx-shared',
      name: '全社共通ナレッジ',
      isFavorite: true,
      activityLog: '2023/10/24 09:20 admin が「M365: ガイドライン」を更新',
      resources: [
        {
          id: 'res-share-handbook',
          name: 'ハンドブックPDF',
          kind: 'folder',
          integrationType: 'ベクトル検索',
          path: '\\\\share-sv\\knowledge\\handbook\\',
          status: 'ok',
          itemCount: 89,
          lastSynced: '2023/10/27 13:12',
          syncSetting: '1日1回実行',
        },
        {
          id: 'res-share-m365',
          name: 'M365: ガイドライン',
          kind: 'channel',
          integrationType: 'ベクトル検索',
          path: 'msteams://all/guideline',
          status: 'ok',
          itemCount: 52,
          lastSynced: '2023/10/27 07:50',
          syncSetting: '1時間ごとに自動実行',
        },
      ],
    },
    {
      id: 'ctx-project-b',
      name: 'プロジェクトB',
      hasIssue: true,
      activityLog: '2023/10/26 18:40 user_B が同期設定を変更',
      resources: [
        {
          id: 'res-b-folder',
          name: 'PJT-B 仕様書フォルダ',
          kind: 'folder',
          integrationType: 'ベクトル検索',
          path: '\\\\share-sv\\docs\\project_B\\',
          status: 'error',
          itemCount: 64,
          lastSynced: '2023/10/26 18:20',
          syncSetting: '1時間ごとに自動実行',
        },
        {
          id: 'res-b-slack',
          name: 'Slack: QAログ',
          kind: 'channel',
          integrationType: 'ベクトル検索',
          path: 'slack://team-b/qa',
          status: 'syncing',
          itemCount: undefined,
          lastSynced: '同期待ち',
          syncSetting: '1時間ごとに自動実行',
        },
      ],
    },
    {
      id: 'ctx-marketing',
      name: 'マーケティング部定例',
      activityLog: '2023/10/25 10:05 user_C が「定例議事録」を同期',
      resources: [
        {
          id: 'res-mk-figma',
          name: 'Figma: キャンペーンアセット',
          kind: 'folder',
          integrationType: 'ベクトル検索',
          path: 'https://figma.com/file/marketing-assets',
          status: 'ok',
          itemCount: 42,
          lastSynced: '2023/10/27 09:45',
          syncSetting: '1日1回実行',
        },
        {
          id: 'res-mk-docs',
          name: 'Google Docs: 定例議事録',
          kind: 'folder',
          integrationType: 'ベクトル検索',
          path: 'https://docs.google.com/marketing/minutes',
          status: 'ok',
          itemCount: 23,
          lastSynced: '2023/10/26 14:10',
          syncSetting: '1日1回実行',
        },
      ],
    },
    {
      id: 'ctx-support',
      name: '技術サポートQ&A',
      activityLog: '2023/10/23 17:15 support_bot がFAQを再インデックス',
      resources: [
        {
          id: 'res-support-faq',
          name: 'FAQ CSVエクスポート',
          kind: 'folder',
          integrationType: 'ベクトル検索',
          path: '\\\\share-sv\\support\\faq.csv',
          status: 'ok',
          itemCount: 312,
          lastSynced: '2023/10/27 06:30',
          syncSetting: '1時間ごとに自動実行',
        },
        {
          id: 'res-support-call',
          name: '通話ログDB',
          kind: 'database',
          integrationType: 'ToolCall',
          path: 'postgres://support/call-logs',
          status: 'ok',
          itemCount: undefined,
          lastSynced: '2023/10/27 05:10',
          syncSetting: '手動のみ',
        },
      ],
    },
  ]);

  readonly favorites = signal<string[]>(this.contexts().filter(ctx => ctx.isFavorite).map(ctx => ctx.id));
  readonly favoriteContexts = computed(() => this.contexts().filter(ctx => this.favorites().includes(ctx.id)));
  readonly otherContexts = computed(() => this.contexts().filter(ctx => !this.favorites().includes(ctx.id)));

  readonly activeContext = signal<ContextSummary | null>(null);
  readonly activeResource = signal<ContextResource | null>(null);

  constructor() {
    effect(() => {
      const contexts = this.contexts();
      if (!this.selectedContextId()) {
        this.selectContext(contexts[0]?.id ?? null);
      } else {
        const ctx = contexts.find(c => c.id === this.selectedContextId());
        if (!ctx) {
          this.selectContext(contexts[0]?.id ?? null);
        }
      }
    });

    effect(() => {
      const context = this.contexts().find(ctx => ctx.id === this.selectedContextId());
      this.activeContext.set(context ?? null);

      if (!context) {
        this.activeResource.set(null);
        return;
      }

      const resource = context.resources.find(res => res.id === this.selectedResourceId()) ?? context.resources[0] ?? null;
      this.selectedResourceId.set(resource?.id ?? null);
      this.activeResource.set(resource);
    });
  }

  filteredContexts(list: ContextSummary[]): ContextSummary[] {
    const keyword = this.searchTerm().trim().toLowerCase();
    if (!keyword) {
      return list;
    }
    return list.filter(ctx => ctx.name.toLowerCase().includes(keyword));
  }

  selectContext(contextId: string | null): void {
    if (!contextId) {
      this.selectedContextId.set(null);
      this.selectedResourceId.set(null);
      return;
    }
    this.selectedContextId.set(contextId);
    this.selectedResourceId.set(null);
  }

  selectResource(resourceId: string): void {
    this.selectedResourceId.set(resourceId);
  }

  isContextSelected(id: string): boolean {
    return this.selectedContextId() === id;
  }

  isResourceSelected(id: string): boolean {
    return this.selectedResourceId() === id;
  }

  contextBadge(context: ContextSummary): string | null {
    if (context.hasIssue) {
      return 'issue';
    }
    return null;
  }

  resourceStatusLabel(resource: ContextResource): string {
    switch (resource.status) {
      case 'ok':
        return '同期完了';
      case 'syncing':
        return '同期中';
      case 'error':
        return 'エラー';
      default:
        return '';
    }
  }

  resourceStatusIcon(resource: ContextResource): string {
    switch (resource.status) {
      case 'ok':
        return 'check_circle';
      case 'syncing':
        return 'sync';
      case 'error':
        return 'warning';
      default:
        return '';
    }
  }

  resourceStatusClass(resource: ContextResource): string {
    switch (resource.status) {
      case 'ok':
        return 'status-ok';
      case 'syncing':
        return 'status-sync';
      case 'error':
        return 'status-error';
    }
  }

  iconForResource(resource: ContextResource): string {
    switch (resource.kind) {
      case 'folder':
        return 'folder';
      case 'channel':
        return 'chat';
      case 'api':
        return 'api';
      case 'database':
        return 'database';
      case 'storage':
        return 'cloud';
      case 'knowledge':
        return 'content_paste_search';
      case 'code':
        return 'code';
      case 'web':
        return 'language';
      default:
        return 'description';
    }
  }

  syncNow(): void {
    const contextId = this.selectedContextId();
    const resourceId = this.selectedResourceId();
    if (!contextId || !resourceId || this.isSyncing()) {
      return;
    }

    this.isSyncing.set(true);
    this.contexts.update(ctxs => ctxs.map(ctx => {
      if (ctx.id !== contextId) {
        return ctx;
      }
      return {
        ...ctx,
        resources: ctx.resources.map(res => res.id === resourceId ? { ...res, status: 'syncing' } : res),
      };
    }));

    window.setTimeout(() => {
      const nowLabel = new Intl.DateTimeFormat('ja-JP', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date());
      let resourceUpdated = false;

      // this.contexts.update(ctxs => ctxs.map(ctx => {
      //   if (ctx.id !== contextId) {
      //     return ctx;
      //   }
      //   const resources = ctx.resources.map(res => {
      //     if (res.id !== resourceId) {
      //       return res;
      //     }
      //     resourceUpdated = true;
      //     return { ...res, status: 'ok', lastSynced: nowLabel };
      //   });
      //   return { ...ctx, resources };
      // }));

      this.isSyncing.set(false);
    }, 1200);
  }

  deleteResource(): void {
    const context = this.activeContext();
    const resource = this.activeResource();

    if (!context || !resource) {
      return;
    }

    const confirmed = window.confirm(`「${resource.name}」を削除します。よろしいですか？`);
    if (!confirmed) {
      return;
    }

    const contexts = this.contexts().map(ctx => {
      if (ctx.id !== context.id) {
        return ctx;
      }
      const filtered = ctx.resources.filter(res => res.id !== resource.id);
      return { ...ctx, resources: filtered };
    });

    this.contexts.set(contexts);
    this.selectedResourceId.set(null);
  }

  saveResource(): void {
    const resource = this.activeResource();
    if (!resource) {
      return;
    }
    window.alert('設定を保存しました（デモ）');
  }

  openWizard(): void {
    if (!this.activeContext()) {
      return;
    }
    this.wizardForm.set(this.createDefaultWizardForm());
    this.wizardStep.set(1);
    this.isWizardOpen.set(true);
    this.wizardTestStatus.set("idle");
    this.wizardTestMessage.set("");
    this.wizardDetectedFiles.set(null);
    this.wizardDetectedSize.set(null);
    this.wizardUploadMessage.set(null);
    this.isWizardDragging.set(false);
  }

  closeWizard(): void {
    this.isWizardOpen.set(false);
    this.wizardStep.set(1);
    this.wizardTestStatus.set("idle");
    this.wizardTestMessage.set("");
    this.wizardDetectedFiles.set(null);
    this.wizardDetectedSize.set(null);
    this.wizardUploadMessage.set(null);
    this.isWizardDragging.set(false);
  }

  nextWizardStep(): void {
    if (!this.canProceedWizardStep()) {
      return;
    }
    this.wizardStep.update(step => {
      const next = Math.min(4, (step as number) + 1) as WizardStep;
      return next;
    });
  }

  previousWizardStep(): void {
    this.wizardStep.update(step => {
      const prev = Math.max(1, (step as number) - 1) as WizardStep;
      return prev;
    });
  }

  canProceedWizardStep(): boolean {
    const step = this.wizardStep();
    const form = this.wizardForm();
    switch (step) {
      case 1:
        return !!form.sourceId;
      case 2:
        return form.name.trim().length > 0 && form.path.trim().length > 0;
      default:
        return true;
    }
  }

  canFinishWizard(): boolean {
    const form = this.wizardForm();
    return form.name.trim().length > 0 && form.path.trim().length > 0;
  }

  selectWizardSource(optionId: string): void {
    const option = this.wizardSourceOptions.find(item => item.id === optionId);
    if (!option) {
      return;
    }
    const previous = this.selectedWizardSource();
    this.wizardForm.update(current => {
      const trimmedName = current.name.trim();
      const shouldOverrideName = !trimmedName || trimmedName === (previous?.suggestedName ?? "");
      return {
        ...current,
        sourceId: option.id,
        name: shouldOverrideName ? (option.suggestedName ?? current.name) : current.name,
      };
    });
    this.wizardTestStatus.set("idle");
    this.wizardTestMessage.set("");
    this.wizardDetectedFiles.set(null);
    this.wizardDetectedSize.set(null);
  }

  updateWizardForm(patch: Partial<ResourceWizardForm>): void {
    this.wizardForm.update(current => ({ ...current, ...patch }));
    if ("path" in patch) {
      this.wizardTestStatus.set("idle");
      this.wizardTestMessage.set("");
      this.wizardDetectedFiles.set(null);
      this.wizardDetectedSize.set(null);
    }
  }

  onWizardDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isWizardDragging.set(true);
  }

  onWizardDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isWizardDragging.set(false);
  }

  onWizardDrop(event: DragEvent): void {
    event.preventDefault();
    this.isWizardDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.wizardUploadMessage.set(`${files.length}件のファイルを受け取りました`);
    } else {
      this.wizardUploadMessage.set("ファイルを受け取りました");
    }
  }

  testWizardConnection(): void {
    if (this.wizardTestStatus() === "running") {
      return;
    }
    const path = this.wizardForm().path.trim();
    if (!path) {
      this.wizardTestStatus.set("error");
      this.wizardTestMessage.set("パス / 接続先を入力してください。");
      return;
    }
    this.wizardTestStatus.set("running");
    this.wizardTestMessage.set("接続テスト中...");
    window.setTimeout(() => {
      if (!this.isWizardOpen()) {
        return;
      }
      if (path.toLowerCase().includes("error")) {
        this.wizardTestStatus.set("error");
        this.wizardTestMessage.set("接続に失敗しました。アクセス権限をご確認ください。");
        return;
      }
      this.wizardTestStatus.set("success");
      this.wizardDetectedFiles.set(128);
      this.wizardDetectedSize.set("約2.3GB");
      this.wizardTestMessage.set("接続成功: 128件のアイテムを検出しました。");
    }, 900);
  }

  completeWizard(): void {
    const context = this.activeContext();
    const source = this.selectedWizardSource();
    if (!context || !source || !this.canFinishWizard()) {
      return;
    }
    const form = this.wizardForm();
    const resourceId = `${context.id}-wizard-${source.id}-${Date.now()}`;
    const status = this.wizardTestStatus() === "success" ? "ok" : "syncing";
    const lastSynced = status === "ok"
      ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date())
      : "未同期";
    const newResource: ContextResource = {
      id: resourceId,
      name: form.name.trim(),
      kind: source.kind,
      integrationType: source.integrationType,
      path: form.path.trim(),
      status,
      itemCount: this.wizardDetectedFiles() ?? undefined,
      lastSynced,
      syncSetting: this.wizardSyncLabel(form.syncSetting),
    };

    this.contexts.update(ctxs => ctxs.map(ctx => {
      if (ctx.id !== context.id) {
        return ctx;
      }
      return { ...ctx, resources: [newResource, ...ctx.resources] };
    }));
    this.selectedResourceId.set(newResource.id);
    this.closeWizard();
  }

  wizardSearchLabel(value: ResourceWizardForm["searchType"]): string {
    return this.wizardSearchOptions.find(option => option.value === value)?.label ?? value;
  }

  wizardSyncLabel(value: ResourceWizardForm["syncSetting"]): string {
    return this.wizardSyncOptions.find(option => option.value === value)?.label ?? value;
  }

  private createDefaultWizardForm(): ResourceWizardForm {
    const defaultSource = this.wizardSourceOptions[0];
    return {
      sourceId: defaultSource.id,
      name: defaultSource.suggestedName ?? "",
      path: "",
      filePattern: "",
      searchType: "vector",
      chunkSize: "auto",
      syncSetting: "hourly",
      changeDetection: true,
      keepDeleted: false,
      filters: "*.tmp\n*.log\nnode_modules/\n.git/",
      enableOcr: true,
    };
  }

  updateActiveResource(patch: Partial<ContextResource>): void {
    const contextId = this.selectedContextId();
    const resourceId = this.selectedResourceId();

    if (!contextId || !resourceId) {
      return;
    }

    this.contexts.update(ctxs => ctxs.map(ctx => {
      if (ctx.id !== contextId) {
        return ctx;
      }
      return {
        ...ctx,
        resources: ctx.resources.map(res => res.id === resourceId ? { ...res, ...patch } : res),
      };
    }));
  }
}
