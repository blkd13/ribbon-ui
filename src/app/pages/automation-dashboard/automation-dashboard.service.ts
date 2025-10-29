import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AutomationJobAction,
  AutomationJobActionRequest,
  AutomationJobCreateRequest,
  AutomationJobCreateResponse,
  AutomationJobDetail,
  AutomationJobListResponse,
  AutomationJobsQuery,
  AutomationSummary,
  AutomationTaskListResponse,
  AutomationTasksQuery,
} from './automation-dashboard.models';

@Injectable({ providedIn: 'root' })
export class AutomationDashboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/user/automation/jobs';

  getSummary(projectId?: string): Observable<AutomationSummary> {
    let params = new HttpParams();
    if (projectId) {
      params = params.set('projectId', projectId);
    }
    return this.http.get<AutomationSummary>(`${this.baseUrl}/summary`, { params });
  }

  listJobs(query: AutomationJobsQuery = {}): Observable<AutomationJobListResponse> {
    let params = this.createParams(query);
    return this.http.get<AutomationJobListResponse>(this.baseUrl, { params });
  }

  getJob(jobId: string): Observable<AutomationJobDetail> {
    return this.http.get<AutomationJobDetail>(`${this.baseUrl}/${jobId}`);
  }

  listTasks(jobId: string, query: AutomationTasksQuery = {}): Observable<AutomationTaskListResponse> {
    let params = this.createParams(query);
    return this.http.get<AutomationTaskListResponse>(`${this.baseUrl}/${jobId}/tasks`, { params });
  }

  runAction(jobId: string, action: AutomationJobAction): Observable<AutomationJobDetail> {
    const body: AutomationJobActionRequest = { action };
    return this.http.post<AutomationJobDetail>(`${this.baseUrl}/${jobId}/actions`, body);
  }

  createJob(payload: AutomationJobCreateRequest): Observable<AutomationJobCreateResponse> {
    return this.http.post<AutomationJobCreateResponse>(this.baseUrl, payload);
  }

  private createParams(query: AutomationJobsQuery | AutomationTasksQuery): HttpParams {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(item => {
          params = params.append(key, String(item));
        });
        return;
      }
      params = params.set(key, String(value));
    });
    return params;
  }
}
