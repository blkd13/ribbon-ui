import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import { BaseDialogComponent } from '../../shared/base/base-dialog.component';
import { AnnouncementsService } from '../../services/announcements.service';
import { UserSettingService } from '../../services/user-setting.service';
import { Announcement } from '../../models/announcement';

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
export class NewFeatureDialogComponent extends BaseDialogComponent<void, boolean> implements OnInit {
  private readonly announcementsService = inject(AnnouncementsService);
  private readonly userSettingService = inject(UserSettingService);

  protected announcements: Announcement[] = [];

  ngOnInit(): void {
    this.loadUnreadAnnouncements();
  }

  private async loadUnreadAnnouncements(): Promise<void> {
    try {
      this.setLoading(true);

      const success = await this.executeAsync(async () => {
        // アクティブなお知らせと未読情報を取得して、未読のもののみを表示
        const result = await forkJoin([
          this.announcementsService.getActiveAnnouncements(),
          this.userSettingService.getUnreadAnnouncements()
        ]).pipe(
          map(([announcements, unreadIds]) => [
            announcements,
            unreadIds
          ])
        ).toPromise();

        if (result) {
          const [announcements, unreadIds] = result;
          this.announcements = (announcements as any[])?.filter((a: any) => (unreadIds as string[])?.includes(a.id)) || [];
        } else {
          this.announcements = [];
        }

        if (this.announcements.length === 0) {
          // 未読のお知らせがない場合は自動的にダイアログを閉じる
          this.close(false);
        }

        return this.announcements;
      }, undefined, 'お知らせの読み込みに失敗しました');

      if (!success) {
        this.close(false);
      }
    } finally {
      this.setLoading(false);
    }
  }

  protected async onClose(): Promise<void> {
    try {
      this.setSaving(true);

      await this.executeAsync(async () => {
        // 表示中のお知らせを既読にする
        const markReadPromises = this.announcements.map(announcement =>
          this.userSettingService.markAnnouncementAsRead(announcement.id)
        );

        await forkJoin(markReadPromises).toPromise();
        return true;
      }, 'お知らせを既読にしました', 'お知らせの既読処理に失敗しました');

      this.close(true);
    } finally {
      this.setSaving(false);
    }
  }

  protected async onDontShowAgain(): Promise<void> {
    // 表示中のお知らせを既読にして、ダイアログを閉じる
    await this.onClose();
  }

  protected onCancel(): void {
    // キャンセルボタンは表示しないため、実装なし
    this.cancel();
  }
}
