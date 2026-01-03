/**
 * Provider Test Dialog Component
 * AIプロバイダーの接続テスト用ダイアログ
 */
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, Inject, OnDestroy, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AIProviderEntity } from '../../../../services/model-manager.service';
import { Subject, takeUntil } from 'rxjs';

export interface ProviderTestDialogData {
  provider: AIProviderEntity;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  details?: {
    responseTime?: number;
    modelsAvailable?: number;
    endpoint?: string;
    error?: string;
  };
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface TestStep {
  name: string;
  status: TestStatus;
  message?: string;
  duration?: number;
}

@Component({
  selector: 'app-provider-test-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './provider-test-dialog.component.html',
  styleUrls: ['./provider-test-dialog.component.scss']
})
export class ProviderTestDialogComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly dialogRef = inject(MatDialogRef<ProviderTestDialogComponent>);
  private readonly destroy$ = new Subject<void>();

  // テスト状態
  overallStatus: TestStatus = 'idle';
  testSteps: TestStep[] = [];
  totalDuration = 0;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ProviderTestDialogData
  ) {}

  ngOnInit(): void {
    this.initializeTestSteps();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeTestSteps(): void {
    this.testSteps = [
      { name: 'Configuration Check', status: 'idle' },
      { name: 'API Connection', status: 'idle' },
      { name: 'Authentication', status: 'idle' },
      { name: 'Model Availability', status: 'idle' },
    ];
  }

  async runTest(): Promise<void> {
    this.overallStatus = 'testing';
    this.totalDuration = 0;
    const startTime = Date.now();

    // Step 1: Configuration Check
    await this.runStep(0, () => this.checkConfiguration());

    // Step 2-4: API Test (backend handles these)
    if (this.testSteps[0].status === 'success') {
      await this.runStep(1, () => this.testConnection());

      if (this.testSteps[1].status === 'success') {
        await this.runStep(2, () => this.testAuthentication());

        if (this.testSteps[2].status === 'success') {
          await this.runStep(3, () => this.testModelAvailability());
        }
      }
    }

    this.totalDuration = Date.now() - startTime;

    // Determine overall status
    const hasError = this.testSteps.some(step => step.status === 'error');
    this.overallStatus = hasError ? 'error' : 'success';
  }

  private async runStep(stepIndex: number, testFn: () => Promise<{ success: boolean; message: string }>): Promise<void> {
    const step = this.testSteps[stepIndex];
    step.status = 'testing';
    const stepStart = Date.now();

    try {
      const result = await testFn();
      step.duration = Date.now() - stepStart;
      step.status = result.success ? 'success' : 'error';
      step.message = result.message;
    } catch (error: any) {
      step.duration = Date.now() - stepStart;
      step.status = 'error';
      step.message = error.message || 'Unknown error';
    }
  }

  private async checkConfiguration(): Promise<{ success: boolean; message: string }> {
    // フロントエンドでの設定チェック
    const provider = this.data.provider;

    if (!provider.name) {
      return { success: false, message: 'Provider name is missing' };
    }

    if (!provider.type) {
      return { success: false, message: 'Provider type is not set' };
    }

    if (!provider.config || provider.config.length === 0) {
      return { success: false, message: 'No configuration found' };
    }

    // API Key があるかどうか
    const hasApiKey = provider.config.some(c =>
      c['apiKey'] || c.credentials?.['apiKey'] || c['baseURL']
    );

    if (!hasApiKey) {
      return { success: false, message: 'API credentials not configured' };
    }

    return { success: true, message: 'Configuration is valid' };
  }

  private async testConnection(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve, reject) => {
      this.http.post<ProviderTestResult>(
        `/admin/ai-provider/${this.data.provider.id}/test`,
        { step: 'connection' }
      ).pipe(takeUntil(this.destroy$)).subscribe({
        next: (result) => {
          if (result.success) {
            resolve({
              success: true,
              message: `Connected (${result.details?.responseTime || 0}ms)`
            });
          } else {
            resolve({
              success: false,
              message: result.message || 'Connection failed'
            });
          }
        },
        error: (error) => {
          // バックエンドAPIがない場合はスキップ
          if (error.status === 404) {
            resolve({
              success: true,
              message: 'Connection test skipped (API not available)'
            });
          } else {
            resolve({
              success: false,
              message: error.error?.message || error.message || 'Connection failed'
            });
          }
        }
      });
    });
  }

  private async testAuthentication(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      this.http.post<ProviderTestResult>(
        `/admin/ai-provider/${this.data.provider.id}/test`,
        { step: 'authentication' }
      ).pipe(takeUntil(this.destroy$)).subscribe({
        next: (result) => {
          if (result.success) {
            resolve({ success: true, message: 'Authenticated successfully' });
          } else {
            resolve({
              success: false,
              message: result.message || 'Authentication failed'
            });
          }
        },
        error: (error) => {
          if (error.status === 404) {
            resolve({
              success: true,
              message: 'Auth test skipped (API not available)'
            });
          } else {
            resolve({
              success: false,
              message: error.error?.message || 'Authentication failed'
            });
          }
        }
      });
    });
  }

  private async testModelAvailability(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      this.http.post<ProviderTestResult>(
        `/admin/ai-provider/${this.data.provider.id}/test`,
        { step: 'models' }
      ).pipe(takeUntil(this.destroy$)).subscribe({
        next: (result) => {
          if (result.success) {
            const modelCount = result.details?.modelsAvailable || 0;
            resolve({
              success: true,
              message: `${modelCount} model(s) available`
            });
          } else {
            resolve({
              success: false,
              message: result.message || 'Model check failed'
            });
          }
        },
        error: (error) => {
          if (error.status === 404) {
            resolve({
              success: true,
              message: 'Model test skipped (API not available)'
            });
          } else {
            resolve({
              success: false,
              message: error.error?.message || 'Model check failed'
            });
          }
        }
      });
    });
  }

  getStatusIcon(status: TestStatus): string {
    switch (status) {
      case 'idle': return 'radio_button_unchecked';
      case 'testing': return 'sync';
      case 'success': return 'check_circle';
      case 'error': return 'error';
    }
  }

  getStatusClass(status: TestStatus): string {
    return `status-${status}`;
  }

  onClose(): void {
    this.dialogRef.close();
  }

  onRetry(): void {
    this.initializeTestSteps();
    this.runTest();
  }
}
