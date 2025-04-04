import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TenantService } from '../../services/tenant.service';
import { TenantEntity } from '../../models/models';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tenant-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './tenant-form.component.html',
  styleUrl: './tenant-form.component.scss'
})
export class TenantFormComponent implements OnInit {
  tenantForm!: FormGroup;
  tenantId: string | null = null;
  isEditing = false;
  isLoading = false;
  isSaving = false;
  error: string | null = null;
  successMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private tenantService: TenantService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.initForm();

    // URLパラメータからテナントIDを取得
    this.route.paramMap.subscribe(params => {
      this.tenantId = params.get('id');
      if (this.tenantId && this.tenantId !== 'new') {
        this.isEditing = true;
        this.loadTenant(this.tenantId);
      }
    });
  }

  private initForm(): void {
    this.tenantForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', Validators.maxLength(500)],
      isActive: [true]
    });
  }

  private loadTenant(id: string): void {
    this.isLoading = true;
    this.error = null;

    this.tenantService.getTenantById(id).subscribe(
      tenant => {
        this.tenantForm.patchValue({
          name: tenant.name,
          description: tenant.description,
          isActive: tenant.isActive
        });
        this.isLoading = false;
      },
      err => {
        this.error = 'テナント情報の取得に失敗しました';
        this.isLoading = false;
        console.error(err);
      }
    );
  }

  onSubmit(): void {
    if (this.tenantForm.invalid) {
      // フォームが無効な場合は全フィールドにタッチしてバリデーションメッセージを表示
      Object.keys(this.tenantForm.controls).forEach(key => {
        const control = this.tenantForm.get(key);
        control?.markAsTouched();
      });
      return;
    }

    this.isSaving = true;
    this.error = null;
    this.successMessage = null;

    const tenantData = this.tenantForm.value;

    if (this.isEditing && this.tenantId) {
      // 既存テナントの更新
      this.tenantService.updateTenant(this.tenantId, tenantData).subscribe(
        updatedTenant => {
          this.isSaving = false;
          this.successMessage = 'テナント情報を更新しました';
          setTimeout(() => {
            this.router.navigate(['/tenants']);
          }, 1500);
        },
        err => {
          this.isSaving = false;
          this.error = 'テナント情報の更新に失敗しました';
          console.error(err);
        }
      );
    } else {
      // 新規テナントの作成
      this.tenantService.createTenant(tenantData).subscribe(
        newTenant => {
          this.isSaving = false;
          this.successMessage = 'テナントを作成しました';
          setTimeout(() => {
            this.router.navigate(['/tenants']);
          }, 1500);
        },
        err => {
          this.isSaving = false;
          this.error = 'テナントの作成に失敗しました';
          console.error(err);
        }
      );
    }
  }

  hasError(controlName: string, errorName: string): boolean {
    const control = this.tenantForm.get(controlName);
    return control ? control.hasError(errorName) && control.touched : false;
  }

  cancel(): void {
    this.router.navigate(['/tenants']);
  }
}