import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { AnnouncementsService } from '../../../services/announcements.service';
import { Announcement } from '../../../models/announcement';
import { BaseDialogComponent } from '../../../shared/base/base-dialog.component';
import { BaseFormComponent } from '../../../shared/base/base-form.component';

export interface DialogData {
  mode: 'create' | 'edit';
  announcement?: Announcement;
}

export interface DialogResult {
  announcement: Announcement;
}

class FormHelper extends BaseFormComponent {
  protected form!: FormGroup;

  // Expose protected methods as public for composition
  public setFormReference(form: FormGroup): void {
    this.form = form;
  }

  public validateAndPrepare(): boolean {
    return this.beforeSubmit();
  }

  public setLoadingState(loading: boolean): void {
    this.setSaving(loading);
  }

  public handleResult(success: boolean, message: string): void {
    this.afterSubmit(success, message);
  }

  public checkError(controlName: string): boolean {
    return this.hasError(controlName);
  }

  public displayError(message: string): void {
    this.showError(message);
  }
}

@Component({
  selector: 'app-announcements-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatIconModule
  ],
  templateUrl: './announcements-edit.component.html',
  styleUrl: './announcements-edit.component.scss'
})

export class AnnouncementsEditComponent extends BaseDialogComponent<DialogData, DialogResult> implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly announcementsService = inject(AnnouncementsService);

  protected form!: FormGroup;
  private formHelper = new FormHelper();

  constructor() {
    super();
    this.initForm();
  }

  ngOnInit(): void {
    this.initForm();
  }

  private initForm(): void {
    this.form = this.fb.group({
      title: ['', Validators.required],
      message: ['', Validators.required],
      startDate: [new Date(), Validators.required],
      endDate: [new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), Validators.required],
      isActive: [true]
    });

    this.formHelper.setFormReference(this.form);

    if (this.data.mode === 'edit' && this.data.announcement) {
      this.form.patchValue({
        title: this.data.announcement.title,
        message: this.data.announcement.message,
        startDate: new Date(this.data.announcement.startDate),
        endDate: new Date(this.data.announcement.endDate),
        isActive: this.data.announcement.isActive
      });
    }
  }

  onSubmit(): void {
    if (!this.formHelper.validateAndPrepare() || !this.validateDateRange()) {
      return;
    }

    const formValue = this.form.value;
    const isEdit = this.data.mode === 'edit';
    
    const successMessage = isEdit ? 'お知らせを更新しました' : 'お知らせを作成しました';
    const errorMessage = isEdit ? 'お知らせの更新に失敗しました' : 'お知らせの作成に失敗しました';

    this.formHelper.setLoadingState(true);

    const operation = isEdit && this.data.announcement ?
      this.announcementsService.updateAnnouncement(this.data.announcement.id, {
        title: formValue.title,
        message: formValue.message,
        startDate: formValue.startDate,
        endDate: formValue.endDate,
        isActive: formValue.isActive,
        updatedBy: 'system'
      }) :
      this.announcementsService.createAnnouncement({
        title: formValue.title,
        message: formValue.message,
        startDate: formValue.startDate,
        endDate: formValue.endDate,
        isActive: formValue.isActive,
        createdBy: 'system',
        updatedBy: 'system'
      });

    operation.subscribe({
      next: result => {
        this.formHelper.handleResult(true, successMessage);
        this.close({ announcement: formValue as Announcement });
      },
      error: err => {
        this.formHelper.handleResult(false, errorMessage);
        console.error(err);
      }
    });
  }

  onCancel(): void {
    this.cancel();
  }

  protected hasError(controlName: string): boolean {
    return this.formHelper.checkError(controlName);
  }

  protected override getErrorMessage(controlName: string): string {
    const control = this.form.get(controlName);
    if (!control?.errors) return '';

    if (control.errors['required']) {
      switch (controlName) {
        case 'title': return 'タイトルは必須です';
        case 'message': return 'メッセージは必須です';
        case 'startDate': return '開始日は必須です';
        case 'endDate': return '終了日は必須です';
        default: return `${controlName}は必須です`;
      }
    }
    return `${controlName}に入力エラーがあります`;
  }

  private validateDateRange(): boolean {
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      this.formHelper.displayError('終了日は開始日より後の日付を設定してください');
      return false;
    }
    return true;
  }
}