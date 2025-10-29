import { Routes } from '@angular/router';

import { AutomationDashboardComponent } from './automation-dashboard.component';

export const AUTOMATION_DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: AutomationDashboardComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./automation-dashboard-home.component').then(m => m.AutomationDashboardHomeComponent),
      },
      {
        path: 'detail/:jobId',
        loadComponent: () =>
          import('./automation-dashboard-detail.component').then(m => m.AutomationDashboardDetailComponent),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
