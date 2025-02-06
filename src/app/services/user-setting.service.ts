import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { AnnouncementReadStatus } from '../models/announcement';

@Injectable({
  providedIn: 'root'
})
export class UserSettingService {
  private apiUrl = `${environment.apiUrl}/api/user-settings`;

  constructor(private http: HttpClient) { }

  // お知らせの既読状態を取得
  getAnnouncementReadStatus(announcementId: string): Observable<boolean> {
    return this.http.get<AnnouncementReadStatus[]>(`${this.apiUrl}/announcements/read-status/${announcementId}`)
      .pipe(
        map(status => status.length > 0)
      );
  }

  // お知らせを既読にする
  markAnnouncementAsRead(announcementId: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/announcements/mark-read`, { announcementId });
  }

  // 未読のお知らせ一覧を取得
  getUnreadAnnouncements(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/announcements/unread`);
  }
}
