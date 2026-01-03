import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, catchError, map } from 'rxjs/operators';

import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ApiJiraService, JiraProject as JiraProjectApi } from '../../../services/api-jira.service';

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrl?: string;
  projectTypeKey?: string;
  lead?: { displayName: string };
}

export interface JiraSelection {
  queryType: 'project' | 'jql';
  projectKey?: string;
  projectName?: string;
  jql?: string;
}

@Component({
  selector: 'app-jira-project-selector',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="selector-container">
      <!-- 選択モードタブ -->
      <div class="mode-tabs">
        <button type="button" class="mode-tab" [class.active]="queryType === 'project'"
                (click)="setQueryType('project')">
          <mat-icon>folder</mat-icon>
          プロジェクト選択
        </button>
        <button type="button" class="mode-tab" [class.active]="queryType === 'jql'"
                (click)="setQueryType('jql')">
          <mat-icon>code</mat-icon>
          JQLクエリ
        </button>
      </div>

      <!-- プロジェクト選択モード -->
      @if (queryType === 'project') {
        <div class="project-mode">
          <!-- 検索 -->
          <div class="search-bar">
            <mat-icon class="search-icon">search</mat-icon>
            <input type="text" class="search-input"
                   [(ngModel)]="searchQuery"
                   (ngModelChange)="onSearchChange($event)"
                   placeholder="プロジェクトを検索...">
            @if (searchQuery) {
              <button class="clear-btn" (click)="clearSearch()">
                <mat-icon>close</mat-icon>
              </button>
            }
          </div>

          <!-- プロジェクト一覧 -->
          <div class="project-list">
            @if (isLoading) {
              <div class="loading-state">
                <mat-spinner diameter="32"></mat-spinner>
                <span>プロジェクトを読み込み中...</span>
              </div>
            } @else if (filteredProjects.length === 0) {
              <div class="empty-state">
                <mat-icon>folder_off</mat-icon>
                <span>{{ searchQuery ? '検索結果が見つかりませんでした' : 'プロジェクトがありません' }}</span>
              </div>
            } @else {
              @for (project of filteredProjects; track project.id) {
                <div class="project-item" [class.selected]="selectedProject?.key === project.key"
                     (click)="selectProject(project)">
                  <div class="project-avatar">
                    @if (project.avatarUrl) {
                      <img [src]="project.avatarUrl" [alt]="project.name">
                    } @else {
                      <span class="avatar-text">{{ project.key.substring(0, 2) }}</span>
                    }
                  </div>
                  <div class="project-info">
                    <div class="project-name">{{ project.name }}</div>
                    <div class="project-key">{{ project.key }}</div>
                  </div>
                  <div class="project-type">
                    <span class="type-badge">{{ getProjectTypeLabel(project.projectTypeKey) }}</span>
                  </div>
                  @if (selectedProject?.key === project.key) {
                    <mat-icon class="check-icon">check_circle</mat-icon>
                  }
                </div>
              }
            }
          </div>
        </div>
      }

      <!-- JQLモード -->
      @if (queryType === 'jql') {
        <div class="jql-mode">
          <div class="jql-header">
            <label class="jql-label">JQLクエリを入力</label>
            <button type="button" class="template-btn" (click)="showTemplates = !showTemplates">
              <mat-icon>library_books</mat-icon>
              テンプレート
            </button>
          </div>

          @if (showTemplates) {
            <div class="jql-templates">
              @for (template of jqlTemplates; track template.label) {
                <button type="button" class="template-item" (click)="applyTemplate(template.jql)">
                  <div class="template-name">{{ template.label }}</div>
                  <div class="template-jql">{{ template.jql }}</div>
                </button>
              }
            </div>
          }

          <textarea class="jql-input"
                    [(ngModel)]="jqlQuery"
                    (ngModelChange)="onJqlChange($event)"
                    rows="4"
                    placeholder="例: project = ALPHA AND sprint in openSprints() AND assignee = currentUser()"></textarea>

          <div class="jql-hint">
            <mat-icon>info</mat-icon>
            <span>JQL (Jira Query Language) を使用してカスタムクエリを作成できます</span>
          </div>

          <!-- JQLプレビュー -->
          @if (jqlQuery) {
            <div class="jql-preview">
              <div class="preview-header">
                <mat-icon>visibility</mat-icon>
                クエリプレビュー
              </div>
              <code class="preview-code">{{ jqlQuery }}</code>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      --primary-color: #0052cc;
      --primary-light: rgba(0, 82, 204, 0.1);
      --bg-dark: #1e2128;
      --bg-card: #282c34;
      --bg-input: #3a3f4a;
      --text-primary: #ffffff;
      --text-secondary: #8b929a;
      --text-muted: #666;
      --border-color: #3a3f4a;
      --success-color: #34a853;
    }

    .selector-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100%;
    }

    /* Mode Tabs */
    .mode-tabs {
      display: flex;
      gap: 8px;
      padding: 4px;
      background: var(--bg-input);
      border-radius: 10px;
    }

    .mode-tab {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;

      mat-icon { font-size: 20px; width: 20px; height: 20px; }

      &:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.05);
      }

      &.active {
        background: var(--bg-card);
        color: var(--primary-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
    }

    /* Project Mode */
    .project-mode {
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
      min-height: 0;
    }

    .search-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      transition: border-color 0.2s;

      &:focus-within {
        border-color: var(--primary-color);
      }

      .search-icon {
        color: var(--text-secondary);
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .search-input {
      flex: 1;
      border: none;
      background: transparent;
      color: var(--text-primary);
      font-size: 14px;
      outline: none;

      &::placeholder {
        color: var(--text-muted);
      }
    }

    .clear-btn {
      padding: 4px;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: 4px;
      display: flex;

      &:hover {
        color: var(--text-primary);
        background: rgba(255, 255, 255, 0.1);
      }

      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }

    .project-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 4px;

      &::-webkit-scrollbar {
        width: 6px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 3px;
      }
    }

    .project-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: var(--bg-input);
      border: 2px solid transparent;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(0, 82, 204, 0.1);
        border-color: rgba(0, 82, 204, 0.3);
      }

      &.selected {
        background: var(--primary-light);
        border-color: var(--primary-color);
      }
    }

    .project-avatar {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: var(--primary-color);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex-shrink: 0;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .avatar-text {
        color: white;
        font-size: 14px;
        font-weight: 600;
      }
    }

    .project-info {
      flex: 1;
      min-width: 0;
    }

    .project-name {
      font-weight: 500;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .project-key {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .project-type {
      flex-shrink: 0;
    }

    .type-badge {
      padding: 4px 10px;
      background: rgba(0, 82, 204, 0.2);
      border-radius: 12px;
      font-size: 11px;
      color: var(--primary-color);
    }

    .check-icon {
      color: var(--success-color);
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .loading-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px;
      gap: 12px;
      color: var(--text-secondary);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
      }
    }

    /* JQL Mode */
    .jql-mode {
      display: flex;
      flex-direction: column;
      gap: 12px;
      flex: 1;
    }

    .jql-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .jql-label {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .template-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid var(--border-color);
      background: transparent;
      border-radius: 6px;
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }

      &:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }
    }

    .jql-templates {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: var(--bg-input);
      border-radius: 8px;
    }

    .template-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 12px;
      border: none;
      background: var(--bg-dark);
      border-radius: 6px;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(0, 82, 204, 0.1);
      }
    }

    .template-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .template-jql {
      font-size: 11px;
      color: var(--text-muted);
      font-family: monospace;
    }

    .jql-input {
      padding: 14px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      resize: vertical;
      min-height: 100px;
      transition: border-color 0.2s;

      &:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      &::placeholder {
        color: var(--text-muted);
      }
    }

    .jql-hint {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-muted);

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .jql-preview {
      padding: 12px;
      background: var(--bg-dark);
      border-radius: 8px;
      border-left: 3px solid var(--primary-color);
    }

    .preview-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;

      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }

    .preview-code {
      display: block;
      font-family: 'JetBrains Mono', 'Consolas', monospace;
      font-size: 13px;
      color: var(--primary-color);
      word-break: break-all;
    }
  `]
})
export class JiraProjectSelectorComponent implements OnInit, OnChanges, OnDestroy {
  @Input() providerName = '';
  @Input() initialSelection?: JiraSelection;
  @Output() selectionChanged = new EventEmitter<JiraSelection>();

  private readonly jiraService = inject(ApiJiraService);
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  queryType: 'project' | 'jql' = 'project';
  searchQuery = '';
  jqlQuery = '';
  showTemplates = false;

  projects: JiraProject[] = [];
  filteredProjects: JiraProject[] = [];
  selectedProject: JiraProject | null = null;
  isLoading = false;

  jqlTemplates = [
    { label: '自分に割り当てられた課題', jql: 'assignee = currentUser() ORDER BY updated DESC' },
    { label: '現在のスプリント', jql: 'sprint in openSprints() ORDER BY rank ASC' },
    { label: '未解決の課題', jql: 'resolution = Unresolved ORDER BY priority DESC' },
    { label: '今週更新された課題', jql: 'updated >= startOfWeek() ORDER BY updated DESC' },
    { label: '高優先度の課題', jql: 'priority in (Highest, High) AND resolution = Unresolved' },
  ];

  ngOnInit(): void {
    if (this.providerName) {
      this.jiraService.setProviderName(this.providerName);
      this.loadProjects();
    }
    this.setupSearch();

    if (this.initialSelection) {
      this.queryType = this.initialSelection.queryType;
      if (this.initialSelection.jql) {
        this.jqlQuery = this.initialSelection.jql;
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['providerName'] && !changes['providerName'].firstChange) {
      this.jiraService.setProviderName(this.providerName);
      this.loadProjects();
    }

    if (changes['initialSelection'] && this.initialSelection) {
      this.applyInitialSelection();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private applyInitialSelection(): void {
    if (!this.initialSelection) return;
    this.queryType = this.initialSelection.queryType;
    if (this.initialSelection.jql) {
      this.jqlQuery = this.initialSelection.jql;
    }
    // プロジェクト選択を復元
    if (this.initialSelection.projectKey && this.projects.length > 0) {
      const project = this.projects.find(p => p.key === this.initialSelection!.projectKey);
      if (project) {
        this.selectedProject = project;
      }
    }
  }

  private setupSearch(): void {
    this.searchSubject.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(query => {
      this.filterProjects(query);
    });
  }

  private loadProjects(): void {
    this.isLoading = true;

    this.jiraService.getProjects(100).pipe(
      map(response => response.values.map(p => this.mapProject(p))),
      catchError(err => {
        console.error('Failed to load JIRA projects:', err);
        return of([]);
      }),
      takeUntil(this.destroy$)
    ).subscribe(projects => {
      this.projects = projects;
      this.filteredProjects = [...this.projects];
      this.isLoading = false;

      // 初期選択の適用
      if (this.initialSelection?.projectKey) {
        const project = this.projects.find(p => p.key === this.initialSelection!.projectKey);
        if (project) {
          this.selectedProject = project;
        }
      }
    });
  }

  private mapProject(apiProject: JiraProjectApi): JiraProject {
    return {
      id: apiProject.id,
      key: apiProject.key,
      name: apiProject.name,
      avatarUrl: apiProject.avatarUrls?.['48x48'] || apiProject.avatarUrls?.['32x32'],
      projectTypeKey: apiProject.projectTypeKey,
      lead: apiProject.lead ? { displayName: apiProject.lead.displayName || '' } : undefined,
    };
  }

  private filterProjects(query: string): void {
    if (!query.trim()) {
      this.filteredProjects = [...this.projects];
      return;
    }

    const lowerQuery = query.toLowerCase();
    this.filteredProjects = this.projects.filter(p =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.key.toLowerCase().includes(lowerQuery)
    );
  }

  setQueryType(type: 'project' | 'jql'): void {
    this.queryType = type;
    this.emitSelection();
  }

  onSearchChange(query: string): void {
    this.searchSubject.next(query);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filteredProjects = [...this.projects];
  }

  selectProject(project: JiraProject): void {
    this.selectedProject = project;
    this.emitSelection();
  }

  onJqlChange(jql: string): void {
    this.emitSelection();
  }

  applyTemplate(jql: string): void {
    this.jqlQuery = jql;
    this.showTemplates = false;
    this.emitSelection();
  }

  getProjectTypeLabel(type: string | undefined): string {
    const labels: Record<string, string> = {
      software: 'ソフトウェア',
      business: 'ビジネス',
      service_desk: 'サービスデスク',
    };
    return labels[type || ''] || 'プロジェクト';
  }

  private emitSelection(): void {
    const selection: JiraSelection = {
      queryType: this.queryType,
    };

    if (this.queryType === 'project' && this.selectedProject) {
      selection.projectKey = this.selectedProject.key;
      selection.projectName = this.selectedProject.name;
    } else if (this.queryType === 'jql') {
      selection.jql = this.jqlQuery;
    }

    this.selectionChanged.emit(selection);
  }
}
