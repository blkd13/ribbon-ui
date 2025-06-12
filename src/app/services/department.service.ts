import { HttpClient, HttpParams } from '@angular/common/http';
import { AuthService } from './auth.service';
import { inject, Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { User, UserRoleType, UserStatus } from '../models/models';
import { BaseEntity } from '../models/project-models';

@Injectable({ providedIn: 'root' })
export class DepartmentService {

  private readonly authService: AuthService = inject(AuthService);
  private readonly http: HttpClient = inject(HttpClient);

  // getDepartmentList(): Observable<{ departmentList: Department[] }> {
  //   return this.http.get<{ departmentList: Department[] }>('/user/department');
  // }
  // getDepartmentMemberList(): Observable<{ departmentMemberList: DepartmentMember[] }> {
  //   return this.http.get<{ departmentMemberList: DepartmentMember[] }>('/user/department-member');
  // }

  getDivisionStats(): Observable<{ divisionMemberList: { division: DivisionEntity, cost: { [key: string]: Cost }, members: DivisionMemberCost[] }[] }> {
    return this.http.get<{ divisionMemberList: { division: DivisionEntity, cost: { [key: string]: Cost }, members: DivisionMemberCost[] }[] }>('/admin/division-stats');
  }

  divisionMemberManagement(divisionId: string, inDto: { userId: string, role?: UserRoleType, status?: UserStatus }): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(`/admin/division/${divisionId}/member/${inDto.userId}`, inDto);
  }

  predictHistory(userId: string, offset: number = 0, limit: number = 100): Observable<{ predictHistory: PredictTransaction[], totalCount: number }> {
    const params = new HttpParams()
      .set('offset', offset.toString())
      .set('limit', limit.toString());
    return this.http.get<{ predictHistory: PredictTransaction[], totalCount: number }>(`/admin/predict-history/${userId}`, { params });
  }

  // 月次集計用の全データ取得メソッド（または別途集計API）
  getPredictHistorySummary(): Observable<any> {
    return this.http.get<any>('/user/predict-history/summary');
  }

  // 月次集計用の全データ取得メソッド（または別途集計API）
  getPredictJournal(idempotency_key: string, args_hash: string, type: 'request' | 'response' | 'stream'): Observable<any> {
    return this.http.get<any>(`/user/predict-journal/${idempotency_key}/${args_hash}/${type}`);
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

export interface DivisionEntity extends BaseEntity {
  name: string;
  label: string;
  description?: string;
  isActive: boolean; // 有効/無効フラグ
}

export interface DivisionMemberCost extends User {
  divisionId: string; // 所属する部門のID
  role: UserRoleType; // ユーザーロール
  status: UserStatus; // ユーザーステータス
  cost: { [key: string]: Cost }; // モデルごとのコスト
}

// export interface DepartmentMember {
//   departmentId: string;
//   departmentRole: string;
//   userId: string;
//   name: string;
// }

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

// export interface DepartmentForView {
//   id: string;
//   name: string;
//   label: string;
//   members: DepartmentMember[];
// }

// export interface DepartmentMember {
//   id: string;
//   departmentId: string;
//   userId: string; // 登録する経路が無いから最初は空である。。。
//   name: string;
//   label: string;
//   departementRole: DepartmentRoleType;
//   user?: User;
//   cost?: { [key: string]: Cost };
// }

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
  idempotency_key: string;
  args_hash: string;
  status: string;
}