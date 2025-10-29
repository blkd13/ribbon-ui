import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface ProjectOption {
  id: string;
  name: string;
}

@Injectable()
export class AutomationDashboardStore {
  readonly projects = signal<ProjectOption[]>([]);
  readonly selectedProjectId = signal<string | null>(null);

  private readonly jobCreatedSubject = new Subject<string>();
  readonly jobCreated$ = this.jobCreatedSubject.asObservable();

  setProjects(projects: ProjectOption[]): void {
    this.projects.set(projects);
    if (!this.selectedProjectId()) {
      this.selectedProjectId.set(projects.length ? projects[0].id : null);
    }
  }

  updateSelectedProject(projectId: string | null): void {
    this.selectedProjectId.set(projectId);
  }

  notifyJobCreated(jobId: string): void {
    this.jobCreatedSubject.next(jobId);
  }
}
