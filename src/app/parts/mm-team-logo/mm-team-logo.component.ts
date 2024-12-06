import { CommonModule } from '@angular/common';
import { ApiMattermostService, MattermostTeamForView } from './../../services/api-mattermost.service';
import { Component, inject, Input } from '@angular/core';

@Component({
  selector: 'app-mm-team-logo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mm-team-logo.component.html',
  styleUrl: './mm-team-logo.component.scss'
})
export class MmTeamLogoComponent {
  readonly apiMattermostService: ApiMattermostService = inject(ApiMattermostService);

  @Input()
  mmTeam!: MattermostTeamForView;

  @Input()
  width?: number;

  isImage: boolean = true;
}
