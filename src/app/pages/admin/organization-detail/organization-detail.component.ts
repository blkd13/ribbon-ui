import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { OrganizationService } from '../../../services/organization.service';
import { OrganizationEntity, ExtApiProviderEntity } from '../../../models/models';
import { ExtApiProviderService } from '../../../services/ext-api-provider.service';
import { CommonModule } from '@angular/common';
import { GService } from '../../../services/g.service';

@Component({
  selector: 'app-organization-detail',
  imports: [CommonModule],
  templateUrl: './organization-detail.component.html',
  styleUrl: './organization-detail.component.scss'
})
export class OrganizationDetailComponent implements OnInit {

  readonly g: GService = inject(GService);

  organization: OrganizationEntity | null = null;
  apiProviders: ExtApiProviderEntity[] = [];
  isLoading = false;
  isLoadingProviders = false;
  error: string | null = null;
  organizationResources: any = {};

  constructor(
    private organizationService: OrganizationService,
    private extApiProviderService: ExtApiProviderService,
    private route: ActivatedRoute,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe({
      next: params => {
        const id = params.get('id');
        if (id) {
          this.loadOrganization(id);
          this.loadApiProviders();
        }
      },
      error: err => {
        console.error('Route param error', err);
      }
    });
  }

  private loadOrganization(id: string): void {
    this.isLoading = true;
    this.error = null;

    this.organizationService.getOrganizationById(id).subscribe({
      next: organization => {
        this.organization = organization;
        this.isLoading = false;
      },
      error: error => {
        this.error = '組織情報の取得に失敗しました';
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

  toggleOrganizationActive(): void {
    if (!this.organization) return;

    const newState = !this.organization.isActive;
    this.organizationService.toggleOrganizationActive(this.organization.id, newState).subscribe({
      next: updatedOrganization => {
        this.organization = updatedOrganization;
      },
      error: error => {
        console.error('組織のステータス変更に失敗しました', error);
      }
    });
  }

  navigateToEdit(): void {
    if (!this.organization) return;
    this.router.navigate(['/organizations/edit', this.organization.id]);
  }

  navigateToApiProviderEdit(provider: ExtApiProviderEntity): void {
    this.router.navigate(['/api-providers/edit', provider.id]);
  }

  navigateToNewApiProvider(): void {
    if (!this.organization) return;
    // 組織IDをクエリパラメータで渡す
    this.router.navigate(['/api-providers/new'], {
      queryParams: { orgKey: this.organization.id }
    });
  }

  goBack(): void {
    this.router.navigate(['/organizations']);
  }

  confirmDelete(): void {
    if (!this.organization) return;

    if (confirm(`組織 "${this.organization.key}" を削除してもよろしいですか？この操作は元に戻せません。`)) {
      this.organizationService.deleteOrganization(this.organization.id).subscribe({
        next: () => {
          alert('組織が削除されました。');
          this.router.navigate(['/organizations']);
        },
        error: error => {
          console.error('組織の削除に失敗しました', error);
          alert('組織の削除に失敗しました。');
        }
      }
      );
    }
  }
}