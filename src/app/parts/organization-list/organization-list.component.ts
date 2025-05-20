import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OrganizationService } from '../../services/organization.service';
import { OrganizationEntity } from '../../models/models';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-organization-list',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './organization-list.component.html',
  styleUrl: './organization-list.component.scss'
})
export class OrganizationListComponent implements OnInit {
  organizations: OrganizationEntity[] = [];
  filteredOrganizations: OrganizationEntity[] = [];
  searchControl = new FormControl('');
  activeFilter: 'all' | 'active' | 'inactive' = 'all';
  isLoading = false;
  error: string | null = null;
  stats = { total: 0, active: 0, inactive: 0 };

  constructor(
    private organizationService: OrganizationService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadOrganizations();
    this.loadStats();

    // 検索フィルター
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filterOrganizations();
    });
  }

  loadOrganizations(): void {
    this.isLoading = true;
    this.error = null;

    this.organizationService.getOrganizations().subscribe(
      data => {
        this.organizations = data;
        this.filterOrganizations();
        this.isLoading = false;
      },
      err => {
        this.error = '組織一覧の取得に失敗しました';
        this.isLoading = false;
        console.error(err);
      }
    );
  }

  loadStats(): void {
    this.organizationService.getOrganizationStats().subscribe(
      data => {
        this.stats = data;
      },
      err => {
        console.error('統計情報の取得に失敗しました', err);
      }
    );
  }

  filterOrganizations(): void {
    const searchTerm = this.searchControl.value?.toLowerCase() || '';

    // アクティブ状態によるフィルタリング
    let filtered = this.organizations;
    if (this.activeFilter === 'active') {
      filtered = filtered.filter(organization => organization.isActive);
    } else if (this.activeFilter === 'inactive') {
      filtered = filtered.filter(organization => !organization.isActive);
    }

    // 検索語によるフィルタリング
    if (searchTerm) {
      filtered = filtered.filter(organization =>
        organization.name.toLowerCase().includes(searchTerm) ||
        (organization.description && organization.description.toLowerCase().includes(searchTerm))
      );
    }

    this.filteredOrganizations = filtered;
  }

  setActiveFilter(filter: 'all' | 'active' | 'inactive'): void {
    this.activeFilter = filter;
    this.filterOrganizations();
  }

  toggleOrganizationActive(organization: OrganizationEntity, event: Event): void {
    event.stopPropagation(); // 行のクリックイベントを防止

    const newState = !organization.isActive;
    this.organizationService.toggleOrganizationActive(organization.id, newState).subscribe(
      updatedOrganization => {
        // 成功したら、組織オブジェクトを更新
        const index = this.organizations.findIndex(t => t.id === organization.id);
        if (index !== -1) {
          this.organizations[index] = updatedOrganization;
          this.filterOrganizations();
          this.loadStats(); // 統計を更新
        }
      },
      err => {
        console.error('組織の状態変更に失敗しました', err);
        // エラーの場合、UIを元の状態に戻す
      }
    );
  }

  deleteOrganization(organization: OrganizationEntity, event: Event): void {
    event.stopPropagation(); // 行のクリックイベントを防止

    if (!confirm(`組織 "${organization.name}" を削除してもよろしいですか？この操作は元に戻せません。`)) {
      return;
    }

    this.organizationService.deleteOrganization(organization.id).subscribe(
      () => {
        // 成功したら、組織リストから削除
        this.organizations = this.organizations.filter(t => t.id !== organization.id);
        this.filterOrganizations();
        this.loadStats(); // 統計を更新
      },
      err => {
        console.error('組織の削除に失敗しました', err);
      }
    );
  }

  navigateToDetail(organization: OrganizationEntity): void {
    this.router.navigate(['/organizations', organization.id]);
  }

  navigateToCreate(): void {
    this.router.navigate(['/organizations/new']);
  }

  refresh(): void {
    this.loadOrganizations();
    this.loadStats();
  }
}