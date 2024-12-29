import { Component, inject, OnInit } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { ProjectService, TeamService } from '../../services/project.service';
import { MatDialog } from '@angular/material/dialog';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GService } from '../../services/g.service';
import { Project, Team, TeamForView, TeamMember, TeamType } from '../../models/project-models';
import { safeForkJoin } from '../../utils/dom-utils';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RelativeTimePipe } from '../../pipe/relative-time.pipe';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { CreateProjectDialogComponent } from '../../parts/create-project-dialog/create-project-dialog.component';
import { EditTeamMemberDialogComponent } from '../../parts/edit-team-member-dialog/edit-team-member-dialog.component';
import { Utils } from '../../utils';

@Component({
    selector: 'app-team',
    imports: [CommonModule, FormsModule, RouterModule, RelativeTimePipe, MatIconModule, MatButtonModule],
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
          console.log(next);
          this.teamChangeHandler(next.id);
        }
      });
    } else {
      this.teamService.updateTeam(this.team.id, this.team).subscribe({
        next: next => {
          console.log(next);
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
        console.log(next);
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
    if (confirm('チームを削除しますか？')) {
      this.teamService.deleteTeam(this.team.id).subscribe({
        next: () => {
          this.snackBar.open('チームを削除しました。', 'OK', { duration: 3000 });
          this.router.navigate(['home']);
        },
        error: () => {
          this.snackBar.open('チームの削除に失敗しました。', 'OK', { duration: 3000 });
        }
      });
    }
  }

  back(): void {
    history.back();
  }
}
