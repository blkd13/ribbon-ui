import { TeamForView } from './../../models/project-models';
import { ProjectService } from './../../services/project.service';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ProjectVisibility } from '../../models/project-models';
import { Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Utils } from '../../utils';

// import { DevelopmentStageType, DocumentSubType, DocumentType, Project, ProjectStatus } from 'src/app/models/project-model';

@Component({
    selector: 'app-create-project-dialog',
    imports: [FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSnackBarModule],
    templateUrl: './create-project-dialog.component.html',
    styleUrl: './create-project-dialog.component.scss'
})
export class CreateProjectDialogComponent implements OnInit {

  projectName = '';
  projectLabel = '';
  projectDescription = '';
  selectedTeamId: string = '';

  share: ProjectVisibility | 'Alone' = 'Alone';

  targetTeam?: TeamForView;

  aloneTeam?: TeamForView;
  teamWithoutAloneList: TeamForView[] = [];


  readonly projectService: ProjectService = inject(ProjectService);
  readonly dialogRef: MatDialogRef<CreateProjectDialogComponent> = inject(MatDialogRef<CreateProjectDialogComponent>);
  readonly data = inject<{ aloneTeam: TeamForView, teamWithoutAloneList: TeamForView[], targetTeam: TeamForView }>(MAT_DIALOG_DATA);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly router: Router = inject(Router);

  isValid = true;

  ngOnInit(): void {
    // チームが決まっていない追加の場合。
    this.aloneTeam = this.data.aloneTeam;
    this.teamWithoutAloneList = this.data.teamWithoutAloneList || this.teamWithoutAloneList;

    // 指定されたチームへの追加の場合
    this.targetTeam = this.data.targetTeam;

    if (this.targetTeam) {
      this.share = ProjectVisibility.Team;
      this.selectedTeamId = this.targetTeam.id;
    } else { }
  }

  registerProject(): void {
    if (this.projectLabel) {
    } else {
      this.snackBar.open(`名前は必須項目です。`, 'close', { duration: 3000 });
      return;
    }
    let teamId: string, visibility: ProjectVisibility;
    if (this.share === 'Alone' && this.aloneTeam) {
      // 「自分だけ」の場合は個人用チームを選択する。
      visibility = ProjectVisibility.Team;
      teamId = this.aloneTeam.id;
    } else if (this.share === ProjectVisibility.Team) {
      // 「チーム」の場合
      visibility = this.share;
      if (this.selectedTeamId) {
        teamId = this.selectedTeamId;
      } else {
        this.snackBar.open(`チームが選択されていません。`, 'close', { duration: 3000 });
        return;
      }
    } else if (this.share === ProjectVisibility.Login) {
      // 「ログインユーザー全員」
      visibility = this.share;
      teamId = '';
      this.snackBar.open(`未実装`, 'close', { duration: 3000 });
      return;
    } else if (this.share === ProjectVisibility.Public) {
      // 
      visibility = this.share;
      teamId = '';
      this.snackBar.open(`未実装`, 'close', { duration: 3000 });
      return;
    } else {
      // エラー
      throw Error('error ' + this.share);
    }

    // // この二行が何のためかわからない。。
    // this.share = 'Alone';
    // this.isValid = false;

    this.projectService.createProject({
      name: this.projectName || ('project-' + Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS')),
      label: this.projectLabel,
      teamId,
      visibility,
      description: this.projectDescription,
    }).subscribe({
      next: next => {
        this.router.navigate(['chat', next.id]);
        this.dialogRef.close();
        this.isValid = true;
      },
      error: error => {
        this.isValid = true;
      }
    });
  }
}