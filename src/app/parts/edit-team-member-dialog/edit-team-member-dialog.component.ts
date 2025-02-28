import { TeamService } from './../../services/project.service';
import { DepartmentService } from './../../services/department.service';
import { MatInputModule } from '@angular/material/input';
import { Component, inject, OnInit } from '@angular/core';
import { ProjectService } from '../../services/project.service';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Team, TeamMember, TeamMemberRoleType } from '../../models/project-models';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { User } from '../../models/models';
import { Observer, Subscription } from 'rxjs';
import { DialogComponent } from '../dialog/dialog.component';
import { UserService } from '../../services/user.service';
@Component({
  selector: 'app-edit-team-member-dialog',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSnackBarModule, MatAutocompleteModule],
  templateUrl: './edit-team-member-dialog.component.html',
  styleUrl: './edit-team-member-dialog.component.scss'
})
export class EditTeamMemberDialogComponent implements OnInit {
  readonly projectService: ProjectService = inject(ProjectService);
  readonly teamService: TeamService = inject(TeamService);
  readonly departmentService: DepartmentService = inject(DepartmentService);
  readonly userService: UserService = inject(UserService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly dialogRef: MatDialogRef<EditTeamMemberDialogComponent> = inject(MatDialogRef<EditTeamMemberDialogComponent>);
  readonly data = inject<{ team: Team, teamMember: TeamMember }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly router: Router = inject(Router);

  teamMember!: TeamMember;
  team!: Team;
  userName: string = '';

  userList: User[] = [];
  userListAll: User[] = [];

  isEdit = false;

  ngOnInit(): void {
    this.team = this.data.team;
    if (this.data.team) {
      if (this.data.teamMember) {
        this.teamMember = this.data.teamMember;
        this.isEdit = true;
      } else {
        this.teamMember = {
          id: '', name: '', userId: '', role: TeamMemberRoleType.Member, teamId: this.data.team.id,
        } as any as TeamMember;
      }
      this.departmentService.getUsers().subscribe(res => {
        this.userListAll = res.userList;
        if (this.isEdit) {
          this.userName = this.userListAll.find(user => user.id === this.teamMember.userId)?.name || '';
        }
      });
    } else {
      alert('error');
    }
  };

  onKeyDown($event: KeyboardEvent): void {
    if (this.userName) {
      this.userList = this.userListAll;
    } else {
      this.userList = [];
    }
    if ($event.key === 'Enter') {
      if ($event.shiftKey) {
        // this.onChange();
      } else if ((this.userService.enterMode === 'Ctrl+Enter' && $event.ctrlKey) || this.userService.enterMode === 'Enter') {
      } else {
        // this.onChange();
      }
    } else {
    }
    // this.userList = this.userListAll.filter(user => user.name.toLowerCase().includes(this.userName.toLowerCase()));
  }

  toAny(any: any): any {
    return any;
  }

  removeTeamMember(): void {
    this.dialog.open(DialogComponent, { data: { title: 'チームメンバー削除', message: 'チームメンバーを削除しますか？', options: ['キャンセル', 'OK'] } }).afterClosed().subscribe(result => {
      if (result === 1) {
        this.teamService.removeTeamMember(this.team.id, this.teamMember.userId).subscribe(this.subscriber('削除'));
      }
    });
  }

  registMember(): void {
    if (this.isEdit) {
      this.teamService.updateTeamMember(this.team.id, this.teamMember.id, this.teamMember).subscribe(this.subscriber('更新'));
    } else {
      const user = this.userListAll.find(user => user.name === this.userName);
      if (user) {
        this.teamService.addTeamMember(this.team.id, { role: this.teamMember.role, userId: user.id }).subscribe(this.subscriber('追加'));
      } else {
        alert('error');
      }
    }
  }

  subscriber<T>(keyword: string): Partial<Observer<T>> {
    return {
      next: next => {
        this.snackBar.open(`メンバーを${keyword}しました。`, 'OK', { duration: 3000 });
        this.dialogRef.close(true);
      },
      error: error => {
        this.snackBar.open(`メンバーの${keyword}に失敗しました。`, 'OK', { duration: 3000 });
      }
    }
  }

  userFilter(user: User): boolean {
    return user.name.indexOf(this.userName) !== -1 || ((user as any).label ? (user as any).label?.indexOf(this.userName) !== -1 : false);
  }
}
