import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Announcement } from '../../../models/announcement';
import { AnnouncementsService } from '../../../services/announcements.service';
import { AnnouncementsEditComponent } from '../announcements-edit/announcements-edit.component';

@Component({
  selector: 'app-announcements-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatDialogModule,
    TranslateModule
  ],
  templateUrl: './announcements-list.component.html',
  styleUrl: './announcements-list.component.scss'
})
export class AnnouncementsListComponent implements OnInit {
  announcements: Announcement[] = [];
  displayedColumns: string[] = ['title', 'startDate', 'endDate', 'isActive', 'actions'];

  constructor(
    private announcementsService: AnnouncementsService,
    private dialog: MatDialog,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadAnnouncements();
  }

  loadAnnouncements(): void {
    this.announcementsService.getAnnouncements().subscribe(
      data => {
        this.announcements = data;
      },
      error => {
        console.error('Failed to load announcements:', error);
        // TODO: エラー表示
      }
    );
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(AnnouncementsEditComponent, {
      width: '600px',
      data: { mode: 'create' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadAnnouncements();
      }
    });
  }

  openEditDialog(announcement: Announcement): void {
    const dialogRef = this.dialog.open(AnnouncementsEditComponent, {
      width: '600px',
      data: { mode: 'edit', announcement }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadAnnouncements();
      }
    });
  }

  deleteAnnouncement(announcement: Announcement): void {
    if (confirm(this.translate.instant('CONFIRM_DELETE_ANNOUNCEMENT'))) {
      this.announcementsService.deleteAnnouncement(announcement.id).subscribe(
        () => {
          this.loadAnnouncements();
        },
        error => {
          console.error('Failed to delete announcement:', error);
          // TODO: エラー表示
        }
      );
    }
  }
}
