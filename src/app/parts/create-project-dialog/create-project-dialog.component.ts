import { TeamForView } from './../../models/project-models';
import { ProjectService } from './../../services/project.service';
import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ProjectVisibility } from '../../models/project-models';
import { Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Utils } from '../../utils';
import { BaseDialogComponent } from '../../shared/base/base-dialog.component';

// import { DevelopmentStageType, DocumentSubType, DocumentType, Project, ProjectStatus } from 'src/app/models/project-model';

export interface CreateProjectDialogData {
  aloneTeam: TeamForView;
  teamWithoutAloneList: TeamForView[];
  targetTeam?: TeamForView;
}

export interface CreateProjectDialogResult {
  projectId: string;
}

@Component({
    selector: 'app-create-project-dialog',
    imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSnackBarModule],
    templateUrl: './create-project-dialog.component.html',
    styleUrl: './create-project-dialog.component.scss'
})
export class CreateProjectDialogComponent extends BaseDialogComponent<CreateProjectDialogData, CreateProjectDialogResult> implements OnInit {

  protected form!: FormGroup;
  private readonly fb = inject(FormBuilder);
  private readonly projectService = inject(ProjectService);
  private readonly router = inject(Router);

  targetTeam?: TeamForView;
  aloneTeam?: TeamForView;
  teamWithoutAloneList: TeamForView[] = [];

  ngOnInit(): void {
    this.initForm();
    
    // チームが決まっていない追加の場合。
    this.aloneTeam = this.data.aloneTeam;
    this.teamWithoutAloneList = this.data.teamWithoutAloneList || this.teamWithoutAloneList;

    // 指定されたチームへの追加の場合
    this.targetTeam = this.data.targetTeam;

    if (this.targetTeam) {
      this.form.patchValue({
        share: ProjectVisibility.Team,
        selectedTeamId: this.targetTeam.id
      });
    }

    // 共有範囲の変更を監視してチーム選択のバリデーションを動的に変更
    this.form.get('share')?.valueChanges.subscribe(shareValue => {
      const selectedTeamIdControl = this.form.get('selectedTeamId');
      
      if (shareValue === 'Team' || shareValue === ProjectVisibility.Team) {
        // チーム内共有の場合は必須バリデーションを追加
        selectedTeamIdControl?.setValidators([Validators.required]);
      } else {
        // 自分だけの場合はバリデーションをクリアして値もクリア
        selectedTeamIdControl?.clearValidators();
        selectedTeamIdControl?.setValue('');
      }
      
      selectedTeamIdControl?.updateValueAndValidity();
    });
  }

  private initForm(): void {
    this.form = this.fb.group({
      projectName: [''],
      projectLabel: ['', Validators.required],
      projectDescription: [''],
      selectedTeamId: [''],
      share: ['Alone', Validators.required]
    });
  }

  registerProject(): void {
    if (!this.validateFormAndTeam()) {
      return;
    }

    const formValue = this.form.value;
    const { teamId, visibility } = this.getTeamAndVisibility(formValue);

    this.executeAsyncWithResult(async () => {
      return this.projectService.createProject({
        name: formValue.projectName || ('project-' + Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS')),
        label: formValue.projectLabel,
        teamId,
        visibility,
        description: formValue.projectDescription,
      }).toPromise();
    }).then(result => {
      if (result) {
        this.router.navigate(['chat', result.id]);
        this.close({ projectId: result.id });
      }
    });
  }

  private validateFormAndTeam(): boolean {
    if (this.form.invalid) {
      this.setError('入力内容を確認してください');
      return false;
    }

    const formValue = this.form.value;
    
    if (!formValue.projectLabel) {
      this.setError('名前は必須項目です');
      return false;
    }

    if ((formValue.share === 'Team' || formValue.share === ProjectVisibility.Team) && !formValue.selectedTeamId) {
      this.setError('チームが選択されていません');
      return false;
    }

    if (formValue.share === ProjectVisibility.Login || formValue.share === ProjectVisibility.Public) {
      this.setError('未実装');
      return false;
    }

    return true;
  }

  private getTeamAndVisibility(formValue: any): { teamId: string; visibility: ProjectVisibility } {
    let teamId: string, visibility: ProjectVisibility;
    
    if (formValue.share === 'Alone' && this.aloneTeam) {
      visibility = ProjectVisibility.Team;
      teamId = this.aloneTeam.id;
    } else if (formValue.share === ProjectVisibility.Team) {
      visibility = formValue.share;
      teamId = formValue.selectedTeamId;
    } else {
      visibility = formValue.share;
      teamId = '';
    }

    return { teamId, visibility };
  }
}