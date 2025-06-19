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

export interface DialogData {
  mode: 'create' | 'edit';
  announcement?: Announcement;
}

export interface DialogResult {
  announcement: Announcement;
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

  constructor() {
    super();
    this.initForm();
  }

  ngOnInit(): void {
    // 初期化時にフォームデータを設定
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
    if (!this.validateForm()) {
      return;
    }

    const formValue = this.form.value;
    const isEdit = this.data.mode === 'edit';
    
    const successMessage = isEdit ? 'お知らせを更新しました' : 'お知らせを作成しました';
    const errorMessage = isEdit ? 'お知らせの更新に失敗しました' : 'お知らせの作成に失敗しました';

    this.executeAsync(async () => {
      if (isEdit && this.data.announcement) {
        return await this.announcementsService.updateAnnouncement(this.data.announcement.id, {
          title: formValue.title,
          message: formValue.message,
          startDate: formValue.startDate,
          endDate: formValue.endDate,
          isActive: formValue.isActive,
          updatedBy: 'system'
        }).toPromise();
      } else {
        return await this.announcementsService.createAnnouncement({
          title: formValue.title,
          message: formValue.message,
          startDate: formValue.startDate,
          endDate: formValue.endDate,
          isActive: formValue.isActive,
          createdBy: 'system',
          updatedBy: 'system'
        }).toPromise();
      }
    }, successMessage, errorMessage).then(success => {
      if (success) {
        // 成功時は結果とともにダイアログを閉じる
        this.close({ announcement: formValue as Announcement });
      }
    });
  }

  onCancel(): void {
    this.cancel();
  }

  // フォームバリデーション用のヘルパーメソッド
  protected hasError(controlName: string): boolean {
    const control = this.form.get(controlName);
    return !!(control?.invalid && control?.touched);
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

  private validateForm(): boolean {
    if (this.form.invalid) {
      this.markFormGroupTouched();
      this.setError('入力内容を確認してください');
      return false;
    }

    // 日付の妥当性チェック
    const startDate = this.form.get('startDate')?.value;
    const endDate = this.form.get('endDate')?.value;
    
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      this.setError('終了日は開始日より後の日付を設定してください');
      return false;
    }

    return true;
  }

  private markFormGroupTouched(): void {
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      control?.markAsTouched();
    });
  }
}