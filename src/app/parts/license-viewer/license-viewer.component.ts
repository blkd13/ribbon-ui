import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';

export interface LicenseInfo {
  name: string;
  version: string;
  licenses: string;
  repository?: string;
  description?: string;
  licenseText?: string;
  copyright?: string;
}

@Component({
  selector: 'app-license-viewer',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatExpansionModule,
    MatProgressSpinnerModule,
    TranslateModule
  ],
  template: `
    <div class="license-viewer-container">
      <div mat-dialog-title class="dialog-header">
        <mat-icon>description</mat-icon>
        <span>{{ 'LICENSE_INFORMATION' | translate }}</span>
        <button mat-icon-button mat-dialog-close class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      
      <div mat-dialog-content class="dialog-content">
        @if (loading) {
        <div class="loading-container">
          <mat-spinner diameter="50"></mat-spinner>
          <p>{{ 'LOADING_LICENSES' | translate }}</p>
        </div>
        } 
        
        @if (!loading && licenses.length > 0) {
        <div  class="licenses-container">
          <p class="total-count">{{ 'TOTAL_PACKAGES' | translate }}: {{ licenses.length }}</p>
          
          <mat-accordion class="license-accordion">
            <mat-expansion-panel *ngFor="let license of licenses; trackBy: trackByLicense" class="license-panel">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <div class="package-header w-full flex justify-between" style="">
                    <div>
                      <span class="package-name">{{ license.name }} [v{{ license.version }}]</span>
                      <span class="package-version"></span>
                    </div>
                    <span class="license-type">{{ license.licenses }}</span>
                  </div>
                </mat-panel-title>
              </mat-expansion-panel-header>
              <!--               
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <div class="package-header">
                    <span class="package-name">{{ license.name }}</span>
                    <span class="package-version">v{{ license.version }}</span>
                  </div>
                </mat-panel-title>
                <mat-panel-description>
                  <span class="license-type">{{ license.licenses }}</span>
                </mat-panel-description>
              </mat-expansion-panel-header>
              -->
              <div class="license-details">
                @if (license.description) {
                <div class="license-field">
                  <strong>{{ 'DESCRIPTION' | translate }}:</strong>
                  <p>{{ license.description }}</p>
                </div>
                }
                
                @if (license.repository) {
                <div class="license-field">
                  <strong>{{ 'REPOSITORY' | translate }}:</strong>
                  <a [href]="license.repository" target="_blank" rel="noopener noreferrer">
                    {{ license.repository }}
                    <mat-icon class="external-link-icon">open_in_new</mat-icon>
                  </a>
                </div>
                }

                @if (license.copyright) {
                <div class="license-field">
                  <strong>{{ 'COPYRIGHT' | translate }}:</strong>
                  <p class="copyright-text">{{ license.copyright }}</p>
                </div>
                }

                @if (license.licenseText) {
                <div class="license-field">
                    <strong>{{ 'LICENSE_TEXT' | translate }}:</strong>
                    <pre class="license-text">{{ license.licenseText }}</pre>
                </div>
                }
              </div>
            </mat-expansion-panel>
          </mat-accordion>
        </div>
        }

        @if(!loading && error){
        <div class="error-container">
          <mat-icon color="warn">error</mat-icon>
          <p>{{ 'ERROR_LOADING_LICENSES' | translate }}</p>
          <p>{{ error }}</p>
        </div>
        }
      </div>
      
      <div mat-dialog-actions class="dialog-actions">
        <button mat-button mat-dialog-close>
          {{ 'CLOSE' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .license-viewer-container {
      width: 800px;
      max-width: 90vw;
      height: 700px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--mat-divider-color);
      position: relative;
    }
    
    .close-button {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
    }
    
    .dialog-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
    }
    
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      gap: 16px;
    }
    
    .total-count {
      margin-bottom: 16px;
      font-weight: 500;
      color: var(--mat-text-secondary);
    }
    
    .license-accordion {
      .mat-expansion-panel {
        margin-bottom: 8px;
        border-radius: 8px !important;
      }
    }
    
    .package-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .package-name {
      font-weight: 500;
      color: var(--mat-text-primary);
    }
    
    .package-version {
      font-size: 0.85em;
      color: var(--mat-text-secondary);
      background: var(--mat-grey-100);
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .license-type {
      font-size: 0.9em;
      color: var(--mat-accent);
      font-weight: 500;
    }
    
    .license-details {
      padding-top: 16px;
    }
    
    .license-field {
      margin-bottom: 16px;
      
      strong {
        display: block;
        margin-bottom: 4px;
        color: var(--mat-text-primary);
      }
      
      p {
        margin: 0;
        color: var(--mat-text-secondary);
        line-height: 1.5;
      }
      
      a {
        display: flex;
        align-items: center;
        gap: 4px;
        color: var(--mat-primary);
        text-decoration: none;
        
        &:hover {
          text-decoration: underline;
        }
      }
    }
    
    .external-link-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    
    .copyright-text {
      font-family: monospace;
      font-size: 0.9em;
      background: var(--mat-grey-50);
      padding: 8px;
      border-radius: 4px;
      white-space: pre-wrap;
    }
    
    .license-text {
      font-family: monospace;
      font-size: 0.8em;
      background: var(--mat-grey-50);
      padding: 16px;
      border-radius: 4px;
      white-space: pre-wrap;
      // max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--mat-divider-color);
    }
    
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 200px;
      gap: 8px;
      color: var(--mat-warn);
    }
    
    .dialog-actions {
      padding: 16px 24px;
      border-top: 1px solid var(--mat-divider-color);
      display: flex;
      justify-content: flex-end;
    }
  `]
})
export class LicenseViewerComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogRef = inject(MatDialogRef<LicenseViewerComponent>);

  licenses: LicenseInfo[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.loadLicenses();
  }

  private async loadLicenses(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      const response = await this.http.get<Record<string, LicenseInfo>>('./assets/licenses.json').toPromise();

      if (response) {
        this.licenses = Object.entries(response).map(([key, value]) => ({
          ...value,
          name: value.name || key.split('@')[0],
          version: value.version || key.split('@')[1] || 'unknown'
        })).sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      console.error('Error loading licenses:', error);
      this.error = 'Failed to load license information';
    } finally {
      this.loading = false;
    }
  }

  trackByLicense(index: number, license: LicenseInfo): string {
    return `${license.name}@${license.version}`;
  }
}
