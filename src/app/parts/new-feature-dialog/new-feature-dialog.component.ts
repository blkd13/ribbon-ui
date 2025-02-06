import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { AnnouncementsService } from '../../services/announcements.service';
import { UserSettingService } from '../../services/user-setting.service';
import { Announcement } from '../../models/announcement';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-new-feature-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ],
  templateUrl: './new-feature-dialog.component.html',
  styleUrl: './new-feature-dialog.component.scss'
})
export class NewFeatureDialogComponent implements OnInit {
  announcements: Announcement[] = [];

  constructor(
    private dialogRef: MatDialogRef<NewFeatureDialogComponent>,
    private announcementsService: AnnouncementsService,
    private userSettingService: UserSettingService
  ) {}

  ngOnInit(): void {
    this.loadUnreadAnnouncements();
  }

  loadUnreadAnnouncements(): void {
    // アクティブなお知らせと未読情報を取得して、未読のもののみを表示
    forkJoin([
      this.announcementsService.getActiveAnnouncements(),
      this.userSettingService.getUnreadAnnouncements()
    ]).pipe(
      map(([announcements, unreadIds]) => 
        announcements.filter(a => unreadIds.includes(a.id))
      )
    ).subscribe(
      unreadAnnouncements => {
        this.announcements = unreadAnnouncements;
        if (this.announcements.length === 0) {
          this.dialogRef.close();
        }
      },
      error => {
        console.error('Failed to load unread announcements:', error);
        this.dialogRef.close();
      }
    );
  }

  onClose(): void {
    // 表示中のお知らせを既読にする
    const markReadPromises = this.announcements.map(announcement => 
      this.userSettingService.markAnnouncementAsRead(announcement.id)
    );

    forkJoin(markReadPromises).subscribe(
      () => {
        this.dialogRef.close();
      },
      error => {
        console.error('Failed to mark announcements as read:', error);
        this.dialogRef.close();
      }
    );
  }

  onDontShowAgain(): void {
    // 表示中のお知らせを既読にして、ダイアログを閉じる
    this.onClose();
  }
}
