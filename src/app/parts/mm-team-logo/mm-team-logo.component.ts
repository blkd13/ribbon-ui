import { CommonModule } from '@angular/common';
import { ApiMattermostService, MattermostTeamForView } from './../../services/api-mattermost.service';
import { Component, inject, input } from '@angular/core';

@Component({
    selector: 'app-mm-team-logo',
    imports: [CommonModule],
    templateUrl: './mm-team-logo.component.html',
    styleUrl: './mm-team-logo.component.scss'
})
export class MmTeamLogoComponent {
  readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);

  readonly mmTeam = input.required<MattermostTeamForView>();

  readonly width = input<number>();

  isImage: boolean = true;
}
