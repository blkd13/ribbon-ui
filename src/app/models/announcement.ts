export interface Announcement {
  id: string;
  title: string;
  message: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface AnnouncementReadStatus {
  userId: string;
  announcementId: string;
  readAt: Date;
}
