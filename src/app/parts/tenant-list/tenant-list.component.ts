import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TenantService } from '../../services/tenant.service';
import { TenantEntity } from '../../models/models';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tenant-list',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tenant-list.component.html',
  styleUrl: './tenant-list.component.scss'
})
export class TenantListComponent implements OnInit {
  tenants: TenantEntity[] = [];
  filteredTenants: TenantEntity[] = [];
  searchControl = new FormControl('');
  activeFilter: 'all' | 'active' | 'inactive' = 'all';
  isLoading = false;
  error: string | null = null;
  stats = { total: 0, active: 0, inactive: 0 };

  constructor(
    private tenantService: TenantService,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadTenants();
    this.loadStats();

    // 検索フィルター
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(value => {
      this.filterTenants();
    });
  }

  loadTenants(): void {
    this.isLoading = true;
    this.error = null;

    this.tenantService.getTenants().subscribe(
      data => {
        this.tenants = data;
        this.filterTenants();
        this.isLoading = false;
      },
      err => {
        this.error = 'テナント一覧の取得に失敗しました';
        this.isLoading = false;
        console.error(err);
      }
    );
  }

  loadStats(): void {
    this.tenantService.getTenantStats().subscribe(
      data => {
        this.stats = data;
      },
      err => {
        console.error('統計情報の取得に失敗しました', err);
      }
    );
  }

  filterTenants(): void {
    const searchTerm = this.searchControl.value?.toLowerCase() || '';

    // アクティブ状態によるフィルタリング
    let filtered = this.tenants;
    if (this.activeFilter === 'active') {
      filtered = filtered.filter(tenant => tenant.isActive);
    } else if (this.activeFilter === 'inactive') {
      filtered = filtered.filter(tenant => !tenant.isActive);
    }

    // 検索語によるフィルタリング
    if (searchTerm) {
      filtered = filtered.filter(tenant =>
        tenant.name.toLowerCase().includes(searchTerm) ||
        (tenant.description && tenant.description.toLowerCase().includes(searchTerm))
      );
    }

    this.filteredTenants = filtered;
  }

  setActiveFilter(filter: 'all' | 'active' | 'inactive'): void {
    this.activeFilter = filter;
    this.filterTenants();
  }

  toggleTenantActive(tenant: TenantEntity, event: Event): void {
    event.stopPropagation(); // 行のクリックイベントを防止

    const newState = !tenant.isActive;
    this.tenantService.toggleTenantActive(tenant.id, newState).subscribe(
      updatedTenant => {
        // 成功したら、テナントオブジェクトを更新
        const index = this.tenants.findIndex(t => t.id === tenant.id);
        if (index !== -1) {
          this.tenants[index] = updatedTenant;
          this.filterTenants();
          this.loadStats(); // 統計を更新
        }
      },
      err => {
        console.error('テナントの状態変更に失敗しました', err);
        // エラーの場合、UIを元の状態に戻す
      }
    );
  }

  deleteTenant(tenant: TenantEntity, event: Event): void {
    event.stopPropagation(); // 行のクリックイベントを防止

    if (!confirm(`テナント "${tenant.name}" を削除してもよろしいですか？この操作は元に戻せません。`)) {
      return;
    }

    this.tenantService.deleteTenant(tenant.id).subscribe(
      () => {
        // 成功したら、テナントリストから削除
        this.tenants = this.tenants.filter(t => t.id !== tenant.id);
        this.filterTenants();
        this.loadStats(); // 統計を更新
      },
      err => {
        console.error('テナントの削除に失敗しました', err);
      }
    );
  }

  navigateToDetail(tenant: TenantEntity): void {
    this.router.navigate(['/tenants', tenant.id]);
  }

  navigateToCreate(): void {
    this.router.navigate(['/tenants/new']);
  }

  refresh(): void {
    this.loadTenants();
    this.loadStats();
  }
}