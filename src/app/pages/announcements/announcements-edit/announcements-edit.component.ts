import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AnnouncementsService } from '../../../services/announcements.service';
import { Announcement } from '../../../models/announcement';

interface DialogData {
  mode: 'create' | 'edit';
  announcement?: Announcement;
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
    MatSlideToggleModule
  ],
  templateUrl: './announcements-edit.component.html',
  styleUrl: './announcements-edit.component.scss'
})
export class AnnouncementsEditComponent implements OnInit {
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private announcementsService: AnnouncementsService,
    public dialogRef: MatDialogRef<AnnouncementsEditComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData
  ) {
    this.form = this.fb.group({
      title: ['', Validators.required],
      message: ['', Validators.required],
      startDate: [new Date(), Validators.required],
      endDate: [new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), Validators.required], // 1週間後
      isActive: [true]
    });

    if (data.mode === 'edit' && data.announcement) {
      this.form.patchValue({
        title: data.announcement.title,
        message: data.announcement.message,
        startDate: new Date(data.announcement.startDate),
        endDate: new Date(data.announcement.endDate),
        isActive: data.announcement.isActive
      });
    }
  }

  ngOnInit(): void {}

  onSubmit(): void {
    if (this.form.valid) {
      const formValue = this.form.value;
      
      if (this.data.mode === 'create') {
        this.announcementsService.createAnnouncement({
          title: formValue.title,
          message: formValue.message,
          startDate: formValue.startDate,
          endDate: formValue.endDate,
          isActive: formValue.isActive,
          createdBy: 'system', // TODO: 現在のユーザーIDを設定
          updatedBy: 'system'  // TODO: 現在のユーザーIDを設定
        }).subscribe(
          result => {
            this.dialogRef.close(result);
          },
          error => {
            console.error('Failed to create announcement:', error);
            // TODO: エラー表示
          }
        );
      } else if (this.data.mode === 'edit' && this.data.announcement) {
        this.announcementsService.updateAnnouncement(this.data.announcement.id, {
          title: formValue.title,
          message: formValue.message,
          startDate: formValue.startDate,
          endDate: formValue.endDate,
          isActive: formValue.isActive,
          updatedBy: 'system'  // TODO: 現在のユーザーIDを設定
        }).subscribe(
          result => {
            this.dialogRef.close(result);
          },
          error => {
            console.error('Failed to update announcement:', error);
            // TODO: エラー表示
          }
        );
      }
    }
  }
}
