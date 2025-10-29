import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { ChatCompletionCreateParamsWithoutMessages } from '../../models/models';
import { Project } from '../../models/project-models';
import { ModelSelectorComponent } from '../../parts/model-selector/model-selector.component';
import { NotificationService } from '../../shared/services/notification.service';
import { DEFAULT_JOB_FORM } from './automation-dashboard.data';
import {
  AutomationDashboardService,
} from './automation-dashboard.service';
import { AutomationDashboardStore, ProjectOption } from './automation-dashboard.store';
import {
  AutomationJobCreateRequest,
  JobForm,
  JobTrigger,
} from './automation-dashboard.models';
import { ProjectCoreService } from '../../services/core/project-core.service';

@Component({
  selector: 'app-automation-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ModelSelectorComponent],
  templateUrl: './automation-dashboard.component.html',
  styleUrls: ['./automation-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AutomationDashboardStore],
})
export class AutomationDashboardComponent implements OnInit, OnDestroy {
  private readonly projectService = inject(ProjectCoreService);
  private readonly automationService = inject(AutomationDashboardService);
  private readonly notificationService = inject(NotificationService);
  private readonly store = inject(AutomationDashboardStore);
  private readonly subscriptions = new Subscription();

  readonly modalOpen = signal(false);
  readonly creatingJob = signal(false);
  readonly modelArgs = signal<ChatCompletionCreateParamsWithoutMessages>({
    model: DEFAULT_JOB_FORM.model,
    providerName: DEFAULT_JOB_FORM.providerName,
  });

  readonly projects = this.store.projects;
  readonly selectedProjectId = this.store.selectedProjectId;

  jobForm: JobForm = { ...DEFAULT_JOB_FORM };

  constructor() {
    effect(() => {
      const currentProjectId = this.selectedProjectId();
      if (currentProjectId && this.jobForm.projectId !== currentProjectId) {
        this.jobForm.projectId = currentProjectId;
      }
    });
  }

  ngOnInit(): void {
    this.loadProjects();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  openModal(): void {
    this.modalOpen.set(true);
  }

  closeModal(resetForm = false): void {
    this.modalOpen.set(false);
    if (resetForm) {
      this.resetForm();
    }
  }

  submitJob(event: Event): void {
    event.preventDefault();
    if (this.creatingJob()) {
      return;
    }

    const payload = this.toCreateRequest();
    if (!payload) {
      return;
    }

    this.creatingJob.set(true);
    const sub = this.automationService
      .createJob(payload)
      .pipe(finalize(() => this.creatingJob.set(false)))
      .subscribe({
        next: response => {
          this.notificationService.showSuccess('ジョブを作成しました');
          this.store.notifyJobCreated(response.jobId);
          this.modalOpen.set(false);
          this.resetForm();
        },
        error: error => {
          this.notificationService.showLongError(error, 'ジョブの作成に失敗しました');
        },
      });
    this.subscriptions.add(sub);
  }

  onModelChange(args: ChatCompletionCreateParamsWithoutMessages): void {
    this.modelArgs.set(args);
    this.jobForm.model = args.model;
    this.jobForm.providerName = args.providerName;
  }

  onProjectChange(projectId: string): void {
    this.store.updateSelectedProject(projectId || null);
    this.jobForm.projectId = projectId;
  }

  onTriggerChange(trigger: JobTrigger): void {
    this.jobForm.trigger = trigger;
    if (trigger === 'schedule') {
      this.jobForm.schedule = this.jobForm.schedule ?? { cron: '', timezone: 'Asia/Tokyo' };
    } else {
      this.jobForm.schedule = null;
    }
  }

  private resetForm(): void {
    const selectedProjectId = this.selectedProjectId();
    this.jobForm = {
      ...DEFAULT_JOB_FORM,
      projectId: selectedProjectId ?? '',
      schedule: DEFAULT_JOB_FORM.schedule ? { ...DEFAULT_JOB_FORM.schedule } : null,
      input: DEFAULT_JOB_FORM.input ? { ...DEFAULT_JOB_FORM.input } : null,
    };
    const current = this.modelArgs();
    this.modelArgs.set({
      ...current,
      model: this.jobForm.model,
      providerName: this.jobForm.providerName,
    });
  }

  private loadProjects(): void {
    const sub = this.projectService.getProjectList().subscribe({
      next: projects => {
        this.store.setProjects(projects.map(project => this.toProjectOption(project)));
        const preferredProject = this.selectedProjectId();
        if (preferredProject) {
          this.jobForm.projectId = preferredProject;
        }
      },
      error: error => {
        this.notificationService.showLongError(error, 'プロジェクトの取得に失敗しました');
      },
    });
    this.subscriptions.add(sub);
  }

  private toCreateRequest(): AutomationJobCreateRequest | null {
    const projectId = this.jobForm.projectId;
    const name = this.jobForm.name.trim();
    if (!projectId) {
      this.notificationService.showValidationError('プロジェクトを選択してください');
      return null;
    }
    if (!name) {
      this.notificationService.showValidationError('ジョブ名を入力してください');
      return null;
    }
    const input = this.jobForm.input ?? { source: 'upload' };
    return {
      projectId,
      name,
      description: this.jobForm.description.trim() || undefined,
      trigger: this.jobForm.trigger,
      schedule: this.jobForm.trigger === 'schedule' ? this.jobForm.schedule ?? undefined : undefined,
      model: {
        provider: this.jobForm.providerName,
        modelId: this.jobForm.model,
      },
      promptTemplate: this.jobForm.promptTemplate,
      input,
      parallelism: this.jobForm.parallelism,
      retryLimit: this.jobForm.retryLimit,
    };
  }

  private toProjectOption(project: Project): ProjectOption {
    return {
      id: project.id,
      name: project.label || project.name,
    };
  }
}
