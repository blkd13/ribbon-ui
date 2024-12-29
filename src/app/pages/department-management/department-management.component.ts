import { MatDialog } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';

import { Cost, DepartmentForView, DepartmentMember, DepartmentService } from './../../services/department.service';
import { UserStatus } from '../../models/models';
import { DialogComponent, DialogData } from '../../parts/dialog/dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PredictHistoryComponent } from '../../parts/predict-history/predict-history.component';
import { MatSelectModule } from '@angular/material/select';

@Component({
    selector: 'app-department-management',
    imports: [CommonModule, FormsModule, MatRadioModule, MatSelectModule],
    templateUrl: './department-management.component.html',
    styleUrl: './department-management.component.scss'
})
export class DepartmentManagementComponent implements OnInit {

  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly matDialog: MatDialog = inject(MatDialog);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly dialog: MatDialog = inject(MatDialog);

  selectYyyyMm: string = 'ALL';
  yyyyMmList: string[] = [];

  // departmentList: Department[] = [];
  departmentList: { department: DepartmentForView, cost: { [key: string]: Cost }, members: DepartmentMember[] }[] = [];

  ngOnInit(): void {
    this.departmentService.getDepartment().subscribe({
      next: response => {
        this.departmentList = response.departmentList;

        // コストの集計結果からyyyymmのリストを作る
        const set = this.departmentList.reduce((bef, curr) => {
          for (const member of curr.members) {
            if (member.cost) {
              Object.keys(member.cost).forEach(key => bef.add(key));
            } else { }
          }
          return bef;
        }, new Set<string>());

        // 新しいものほど上に来るように並び替え
        this.yyyyMmList = Array.from(set).filter(key => key !== 'ALL').sort().reverse();

        // yyyymmの内容があったら先頭を選択する。
        if (this.yyyyMmList.length > 0) {
          this.selectYyyyMm = this.yyyyMmList[0];
        } else { }
      }
    });
  }

  detail(member: DepartmentMember): void {
    if (member.user) {
      this.dialog.open(PredictHistoryComponent, {
        data: { member }
      });
    }
  }

  eventCancel($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    // $event.preventDefault();
  }

  updateUserStatus(member: DepartmentMember): void {
    if (member.user) {
      const transMap: Record<string, string> = { 'Active': '有効', 'Suspended': '停止' };
      this.matDialog.open(DialogComponent, {
        data: {
          title: '確認',
          message: `${member.user.name}のステータスを「${transMap[member.user.status]}」に変更しますか?`,
          options: ['キャンセル', 'OK'],
        } as DialogData
      }).afterClosed().subscribe(result => {
        if (member.user) {
          if (result === 1) {
            this.departmentService.departmentMemberManagement(member.departmentId, { userName: member.user.name, status: member.user.status }).subscribe({
              next: next => {
                this.snackBar.open('ステータスを変更しました', 'OK', { duration: 3000 });
              },
              error: error => {
                this.snackBar.open('ステータスを変更に失敗しました', 'OK', { duration: 3000 });
                console.log(error);
              }
            });
          } else {
            if (member.user.status === UserStatus.Active) {
              member.user.status = UserStatus.Suspended;
            } else {
              member.user.status = UserStatus.Active;
            }
          }
        } else { }
      });
    }
  }
}
