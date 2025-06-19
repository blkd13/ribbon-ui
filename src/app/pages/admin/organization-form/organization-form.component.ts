import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { OrganizationService } from '../../../services/organization.service';
import { OrganizationEntity } from '../../../models/models';
import { CommonModule } from '@angular/common';
import { BaseFormComponent } from '../../../shared/base/base-form.component';

@Component({
  selector: 'app-organization-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './organization-form.component.html',
  styleUrl: './organization-form.component.scss'
})
export class OrganizationFormComponent extends BaseFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly organizationService = inject(OrganizationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected form!: FormGroup;
  protected organizationId: string | null = null;
  protected isEditing = false;

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
    this.form = this.fb.group({
      key: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', Validators.maxLength(500)],
      isActive: [true]
    });
  }

  private loadOrganization(id: string): void {
    this.setLoading(true);
    this.clearError();

    this.organizationService.getOrganizationById(id).subscribe({
      next: organization => {
        this.form.patchValue({
          key: organization.key,
          description: organization.description,
          isActive: organization.isActive
        });
        this.setLoading(false);
      },
      error: err => {
        this.showError('組織情報の取得に失敗しました');
        this.setLoading(false);
        console.error(err);
      }
    });
  }

  onSubmit(): void {
    if (!this.beforeSubmit()) {
      return;
    }

    this.setSaving(true);
    const organizationData = this.form.value;

    const operation = this.isEditing && this.organizationId ?
      this.organizationService.updateOrganization(this.organizationId, organizationData) :
      this.organizationService.createOrganization(organizationData);

    const successMessage = this.isEditing ? '組織情報を更新しました' : '組織を作成しました';
    const errorMessage = this.isEditing ? '組織情報の更新に失敗しました' : '組織の作成に失敗しました';

    operation.subscribe({
      next: result => {
        this.afterSubmit(true, successMessage);
        setTimeout(() => {
          this.router.navigate(['/admin/organizations']);
        }, 1500);
      },
      error: err => {
        this.afterSubmit(false, errorMessage);
        console.error(err);
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/admin/organizations']);
  }
}