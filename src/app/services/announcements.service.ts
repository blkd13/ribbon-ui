import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Announcement } from '../models/announcement';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AnnouncementsService {
  private apiUrl = `${environment.apiUrl}/api/announcements`;

  constructor(private http: HttpClient) { }

  getAnnouncements(): Observable<Announcement[]> {
    return this.http.get<Announcement[]>(this.apiUrl);
  }

  getActiveAnnouncements(): Observable<Announcement[]> {
    return this.http.get<Announcement[]>(`${this.apiUrl}/active`);
  }

  getAnnouncement(id: string): Observable<Announcement> {
    return this.http.get<Announcement>(`${this.apiUrl}/${id}`);
  }

  createAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt' | 'updatedAt'>): Observable<Announcement> {
    return this.http.post<Announcement>(this.apiUrl, announcement);
  }

  updateAnnouncement(id: string, announcement: Partial<Announcement>): Observable<Announcement> {
    return this.http.put<Announcement>(`${this.apiUrl}/${id}`, announcement);
  }

  deleteAnnouncement(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
