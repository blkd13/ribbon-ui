import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TeamForView, TeamMember, TeamType } from '../../models/project-models';
import { CreateProjectDialogComponent } from '../../parts/create-project-dialog/create-project-dialog.component';
import { EditTeamMemberDialogComponent } from '../../parts/edit-team-member-dialog/edit-team-member-dialog.component';
import { RelativeTimePipe } from '../../pipe/relative-time.pipe';
import { AuthService } from '../../services/auth.service';
import { GService } from '../../services/g.service';
import { LoggerService } from '../../services/logger';
import { ProjectService, TeamService } from '../../services/project.service';
import { Utils } from '../../utils';

@Component({
    selector: 'app-team',
  imports: [CommonModule, FormsModule, RouterModule, RelativeTimePipe, MatIconModule, MatButtonModule, TranslateModule],
    templateUrl: './team.component.html',
    styleUrl: './team.component.scss'
})
export class TeamComponent implements OnInit {
  readonly authService: AuthService = inject(AuthService);
  readonly projectService: ProjectService = inject(ProjectService);
  readonly teamService: TeamService = inject(TeamService);
  readonly dialog: MatDialog = inject(MatDialog);
  readonly router: Router = inject(Router);
  readonly activatedRoute: ActivatedRoute = inject(ActivatedRoute);
  readonly snackBar: MatSnackBar = inject(MatSnackBar);
  readonly g: GService = inject(GService);
  readonly translate: TranslateService = inject(TranslateService);
  readonly logger: LoggerService = inject(LoggerService);

  team!: TeamForView;
  editLabel = false;

  ngOnInit(): void {
    this.activatedRoute.params.subscribe(params => {
      const { teamId } = params as { teamId: string };
      this.teamChangeHandler(teamId);
    });
  }

  teamChangeHandler(teamId: string): void {
    if (teamId === 'new-team') {
      this.team = {
        name: '',
        label: '',
        teamType: TeamType.Team,
        description: '',
        members: [],
        projects: [],
        id: teamId,
        createdAt: new Date(),
        createdBy: this.authService.getCurrentUser().id,
        updatedAt: new Date(),
        updatedBy: this.authService.getCurrentUser().id,
      };
      this.editLabel = true;
    } else {
      // teamId !== 'new-team'
      this.teamService.getTeam(teamId).subscribe(team => {
        this.team = team as TeamForView;
        this.projectService.getProjectList().subscribe(projects => {
          this.team.projects = projects.filter(project => project.teamId === this.team.id);
        });
      });
    }
  }

  submitLabel(): void {
    this.editLabel = false;
    if (this.team.id === 'new-team') {
      this.team.name = this.team.name || ('team-' + Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS'));
      this.teamService.createTeam(this.team).subscribe({
        next: next => {
          this.logger.debug(next);
          this.teamChangeHandler(next.id);
        }
      });
    } else {
      this.teamService.updateTeam(this.team.id, this.team).subscribe({
        next: next => {
          this.logger.debug(next);
          // this.teamChangeHandler(this.team.id);
        }
      });
    }
  }

  editMember(teamMember?: TeamMember): void {
    this.dialog.open(EditTeamMemberDialogComponent, {
      height: '600px', width: '600px',
      data: { team: this.team, teamMember }
    }).afterClosed().subscribe({
      next: next => {
        this.logger.debug(next);
        if (next) {
          this.teamChangeHandler(this.team.id);
        }
      }
    })
  }

  createProject(): void {
    this.dialog.open(CreateProjectDialogComponent, {
      height: '600px', width: '600px',
      data: { targetTeam: this.team, teamWithoutAloneList: [this.team] }
    });
  }
  deleteTeam(): void {
    if (confirm(this.translate.instant('CONFIRM_DELETE_TEAM'))) {
      this.teamService.deleteTeam(this.team.id).subscribe({
        next: () => {
          this.snackBar.open(this.translate.instant('TEAM_DELETED'), this.translate.instant('OK'), { duration: 3000 });
          this.router.navigate(['home']);
        },
        error: () => {
          this.snackBar.open(this.translate.instant('TEAM_DELETE_FAILED'), this.translate.instant('OK'), { duration: 3000 });
        }
      });
    }
  }

  back(): void {
    history.back();
  }
}
