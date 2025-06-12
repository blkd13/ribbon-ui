import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { RouterModule } from '@angular/router';
import { ExtApiProviderService } from '../../services/ext-api-provider.service';
import { ExtApiProviderAuthType, ExtApiProviderEntity, User, UserRoleType } from '../../models/models';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { DepartmentService } from '../../services/department.service';

@Component({
  selector: 'app-app-menu',
  imports: [
    CommonModule, RouterModule,
    MatIconModule, MatMenuModule, MatButtonModule,
  ],
  templateUrl: './app-menu.component.html',
  styleUrl: './app-menu.component.scss'
})
export class AppMenuComponent implements OnInit {

  readonly extApiProviderService: ExtApiProviderService = inject(ExtApiProviderService);
  readonly authService: AuthService = inject(AuthService);
  readonly departmentService: DepartmentService = inject(DepartmentService);
  apiProviderGroupedList: { [type: string]: ExtApiProviderEntity[] } = {};
  groupKeys: string[] = [];
  user: User;
  isAdmin = false;

  constructor() {
    this.user = this.authService.getCurrentUser();
    this.isAdmin = !!this.user.roleList.find(role => [UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role));

    this.extApiProviderService.getApiProviders(true).subscribe({
      next: apiProviderList => {

        this.apiProviderGroupedList = apiProviderList.filter(obj => obj.authType === ExtApiProviderAuthType.OAuth2).reduce((acc: { [type: string]: ExtApiProviderEntity[] }, apiProvider: ExtApiProviderEntity) => {
          const type = ['gitlab', 'gitea'].includes(apiProvider.type) ? 'git' : apiProvider.type;
          if (!acc[type]) {
            this.groupKeys.push(type);
            acc[type] = [];
          }
          acc[type].push(apiProvider);
          return acc;
        }, {});
        // console.log('API Providers:', apiProviders);
        // console.log(this.apiProviderGroupedList);
      },
      error: (error) => {
        console.error('Error fetching API providers:', error);
      }
    });
  }
  ngOnInit(): void {

    // console.log('AppMenuComponent initialized'); 
  }
}
