import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TenantService } from '../../services/tenant.service';
import { TenantEntity, ExtApiProviderEntity } from '../../models/models';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { CommonModule } from '@angular/common';
import { GService } from '../../services/g.service';

@Component({
  selector: 'app-tenant-detail',
  imports: [CommonModule],
  templateUrl: './tenant-detail.component.html',
  styleUrl: './tenant-detail.component.scss'
})
export class TenantDetailComponent implements OnInit {

  readonly g: GService = inject(GService);

  tenant: TenantEntity | null = null;
  apiProviders: ExtApiProviderEntity[] = [];
  isLoading = false;
  isLoadingProviders = false;
  error: string | null = null;
  tenantResources: any = {};

  constructor(
    private tenantService: TenantService,
    private extApiProviderService: ExtApiProviderService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe({
      next: params => {
        const id = params.get('id');
        if (id) {
          this.loadTenant(id);
          this.loadApiProviders();
        }
      },
      error: err => {
        console.error('Route param error', err);
      }
    });
  }

  private loadTenant(id: string): void {
    this.isLoading = true;
    this.error = null;

    this.tenantService.getTenantById(id).subscribe({
      next: tenant => {
        this.tenant = tenant;
        this.isLoading = false;
      },
      error: error => {
        this.error = 'テナント情報の取得に失敗しました';
        this.isLoading = false;
        console.error(error);
      }
    });
  }

  private loadApiProviders(): void {
    this.isLoadingProviders = true;

    this.extApiProviderService.getApiProviders().subscribe({
      next: providers => {
        this.apiProviders = providers;
        this.isLoadingProviders = false;
      },
      error: error => {
        console.error('APIプロバイダー情報の取得に失敗しました', error);
        this.isLoadingProviders = false;
      },
    });
  }

  toggleTenantActive(): void {
    if (!this.tenant) return;

    const newState = !this.tenant.isActive;
    this.tenantService.toggleTenantActive(this.tenant.id, newState).subscribe({
      next: updatedTenant => {
        this.tenant = updatedTenant;
      },
      error: error => {
        console.error('テナントのステータス変更に失敗しました', error);
      }
    });
  }

  navigateToEdit(): void {
    if (!this.tenant) return;
    this.router.navigate(['/tenants/edit', this.tenant.id]);
  }

  navigateToApiProviderEdit(provider: ExtApiProviderEntity): void {
    this.router.navigate(['/api-providers/edit', provider.id]);
  }

  navigateToNewApiProvider(): void {
    if (!this.tenant) return;
    // テナントIDをクエリパラメータで渡す
    this.router.navigate(['/api-providers/new'], {
      queryParams: { tenantKey: this.tenant.id }
    });
  }

  goBack(): void {
    this.router.navigate(['/tenants']);
  }

  confirmDelete(): void {
    if (!this.tenant) return;

    if (confirm(`テナント "${this.tenant.name}" を削除してもよろしいですか？この操作は元に戻せません。`)) {
      this.tenantService.deleteTenant(this.tenant.id).subscribe({
        next: () => {
          alert('テナントが削除されました。');
          this.router.navigate(['/tenants']);
        },
        error: error => {
          console.error('テナントの削除に失敗しました', error);
          alert('テナントの削除に失敗しました。');
        }
      }
      );
    }
  }
}