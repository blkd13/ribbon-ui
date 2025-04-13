import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { inject, Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { User, UserRole, UserStatus } from '../models/models';

@Injectable({ providedIn: 'root' })
export class DepartmentService {

  private readonly authService: AuthService = inject(AuthService);
  private readonly http: HttpClient = inject(HttpClient);

  getDepartmentList(): Observable<{ departmentList: Department[] }> {
    return this.http.get<{ departmentList: Department[] }>('/user/department');
  }

  getDepartmentMemberList(): Observable<{ departmentMemberList: DepartmentMember[] }> {
    return this.http.get<{ departmentMemberList: DepartmentMember[] }>('/user/department-member');
  }

  getDepartment(): Observable<{ departmentList: { department: DepartmentForView, cost: { [key: string]: Cost }, members: DepartmentMember[] }[] }> {
    return this.http.get<{ departmentList: { department: DepartmentForView, cost: { [key: string]: Cost }, members: DepartmentMember[] }[] }>('/admin/department');
  }

  departmentMemberManagement(departmentId: string, inDto: { userName: string, role?: UserRole, status?: UserStatus }): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`/admin/department/${departmentId}`, inDto);
  }

  predictHistory(userId: string): Observable<{ predictHistory: PredictTransaction[] }> {
    return this.http.get<{ predictHistory: PredictTransaction[] }>(`/admin/predict-history/${userId}`);
  }

  private userList!: User[];
  getUsers(force = false): Observable<{ userList: User[] }> {
    if (force || !this.userList) {
      return this.http.get<{ userList: User[] }>('/user/user-list').pipe(tap(response => this.userList = response.userList));
    } else {
      return of({ userList: this.userList });
    }
  }
}

export interface DepartmentMember {
  departmentId: string;
  departmentRole: string;
  userId: string;
  name: string;
}

export enum DepartmentRoleType {
  Maintainer = 'Maintainer', // メンテナ

  Owner = 'Owner', // 所有者
  Admin = 'Admin', // 管理者（オーナーに統合したので今は使わない）
  Member = 'Member', // メンバー（スレッドの作成、編集、削除ができる）
  Deputy = 'Deputy', // 主務じゃない人
}

export interface Department {
  id: string;
  name: string;
  label: string;
}

export interface DepartmentForView {
  id: string;
  name: string;
  label: string;
  members: DepartmentMember[];
}

export interface DepartmentMember {
  id: string;
  departmentId: string;
  userId: string; // 登録する経路が無いから最初は空である。。。
  name: string;
  label: string;
  departementRole: DepartmentRoleType;
  user?: User;
  cost?: { [key: string]: Cost };
}

export interface Cost {
  totalCost: number;
  totalReqToken: number;
  totalResToken: number;
  foreignModelReqToken: number;
  foreignModelResToken: number;
}
export interface PredictTransaction {
  created_at: Date;
  model: string;
  provider: string;
  take: number;
  cost: number;
  req_token: number;
  res_token: number;
  status: string;
}