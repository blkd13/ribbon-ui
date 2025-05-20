import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { OrganizationService } from '../../services/organization.service';
import { OrganizationEntity } from '../../models/models';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-organization-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './organization-form.component.html',
  styleUrl: './organization-form.component.scss'
})
export class OrganizationFormComponent implements OnInit {
  organizationForm!: FormGroup;
  organizationId: string | null = null;
  isEditing = false;
  isLoading = false;
  isSaving = false;
  error: string | null = null;
  successMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private organizationService: OrganizationService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.initForm();

    // URLパラメータから組織IDを取得
    this.route.paramMap.subscribe(params => {
      this.organizationId = params.get('id');
      if (this.organizationId && this.organizationId !== 'new') {
        this.isEditing = true;
        this.loadOrganization(this.organizationId);
      }
    });
  }

  private initForm(): void {
    this.organizationForm = this.fb.group({
      key: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', Validators.maxLength(500)],
      isActive: [true]
    });
  }

  private loadOrganization(id: string): void {
    this.isLoading = true;
    this.error = null;

    this.organizationService.getOrganizationById(id).subscribe(
      organization => {
        this.organizationForm.patchValue({
          key: organization.key,
          description: organization.description,
          isActive: organization.isActive
        });
        this.isLoading = false;
      },
      err => {
        this.error = '組織情報の取得に失敗しました';
        this.isLoading = false;
        console.error(err);
      }
    );
  }

  onSubmit(): void {
    if (this.organizationForm.invalid) {
      // フォームが無効な場合は全フィールドにタッチしてバリデーションメッセージを表示
      Object.keys(this.organizationForm.controls).forEach(key => {
        const control = this.organizationForm.get(key);
        control?.markAsTouched();
      });
      return;
    }

    this.isSaving = true;
    this.error = null;
    this.successMessage = null;

    const organizationData = this.organizationForm.value;

    if (this.isEditing && this.organizationId) {
      // 既存組織の更新
      this.organizationService.updateOrganization(this.organizationId, organizationData).subscribe(
        updatedOrganization => {
          this.isSaving = false;
          this.successMessage = '組織情報を更新しました';
          setTimeout(() => {
            this.router.navigate(['/organizations']);
          }, 1500);
        },
        err => {
          this.isSaving = false;
          this.error = '組織情報の更新に失敗しました';
          console.error(err);
        }
      );
    } else {
      // 新規組織の作成
      this.organizationService.createOrganization(organizationData).subscribe(
        newOrganization => {
          this.isSaving = false;
          this.successMessage = '組織を作成しました';
          setTimeout(() => {
            this.router.navigate(['/organizations']);
          }, 1500);
        },
        err => {
          this.isSaving = false;
          this.error = '組織の作成に失敗しました';
          console.error(err);
        }
      );
    }
  }

  hasError(controlName: string, errorName: string): boolean {
    const control = this.organizationForm.get(controlName);
    return control ? control.hasError(errorName) && control.touched : false;
  }

  cancel(): void {
    this.router.navigate(['/organizations']);
  }
}