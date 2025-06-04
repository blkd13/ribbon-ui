import { Routes } from '@angular/router';
import { loginGuardGenerator, oAuthGuardGenerator, projectGuard, teamGuard, threadGroupGuard } from './guard/chat.guard';
import { UserRoleType } from './models/models';

// console.dir(gitRoutes, { depth: null });
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'bulk', loadComponent: () => import('./parts/bulk-run-setting/bulk-run-setting.component').then(m => m.BulkRunSettingComponent) },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'team/:teamId', canActivate: [teamGuard], loadComponent: () => import('./pages/team/team.component').then(m => m.TeamComponent) },
  { path: 'invite/:onetimeToken', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  { path: 'home', canActivate: [loginGuardGenerator(UserRoleType.User, 'login')], loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  // { path: 'home', canActivate: [loginGuard], loadComponent: () => import('./pages/error/error.component').then(m => m.ErrorComponent) },
  {
    path: 'mattermost/:providerName', canActivate: [oAuthGuardGenerator('mattermost')], children: [{
      path: ':targetTeamId', children: [
        { path: ':targetChannelId', loadComponent: () => import('./pages/mattermost/mattermost.component').then(m => m.MattermostComponent) },
        { path: '**', redirectTo: 'default' },
      ],
    }, { path: '**', redirectTo: 'timeline' }],
  },
  {
    path: 'box/:providerName', canActivate: [oAuthGuardGenerator('box')], children: [{
      path: ':type', children: [
        { path: ':id', loadComponent: () => import('./pages/box/box.component').then(m => m.BoxComponent) },
        { path: '**', redirectTo: '0' }
      ],
    }, { path: '**', redirectTo: 'folder' }]
  },
  ...['gitea', 'gitlab'].map(providerType => {
    return {
      path: `${providerType}/:providerName`, canActivate: [oAuthGuardGenerator(providerType)],
      loadComponent: () => import('./pages/git/git.component').then(m => m.GitComponent)
    };
  }),
  {
    path: 'chat', children: [{
      path: ':projectId', canActivate: [projectGuard], children: [{
        path: ':threadGroupId', canActivate: [threadGroupGuard], loadComponent: () => import('./pages/chat/chat.component').then(m => m.ChatComponent)
      }, { path: '**', redirectTo: 'new-thread' }]
    }, { path: '**', redirectTo: 'defaut-project' }]
  },
  { path: 'oauth/mail/message/:pincode', loadComponent: () => import('./pages/oauth/oauth-mail-message/oauth-mail-message.component').then(m => m.OAuthMailMessageComponent) },
  { path: 'oauth/mail/auth/:onetimeToken', loadComponent: () => import('./pages/oauth/oauth-mail-auth/oauth-mail-auth.component').then(m => m.OAuthMailAuthComponent) },
  // { path: 'admin/ext-api-provider', canActivate: [loginGuardGenerator(UserRoleType.Admin, 'home')], loadComponent: () => import('./pages/ext-api-provider/ext-api-provider.component').then(m => m.ExtApiProviderComponent) },
  // { path: 'admin/department', canActivate: [loginGuardGenerator(UserRoleType.Admin, 'home')], loadComponent: () => import('./pages/department-management/department-management.component').then(m => m.DepartmentManagementComponent) },
  {
    path: 'admin', canActivate: [loginGuardGenerator(UserRoleType.Admin, 'home')],
    loadComponent: () => import('./pages/admin/admin.component').then(m => m.AdminComponent),
    children: [
      { path: 'ai-provider-template-management', loadComponent: () => import('./parts/ai-model-management/ai-provider-template-management/ai-provider-template-management.component').then(m => m.AIProviderTemplateManagementComponent) },
      { path: 'ai-provider-management', loadComponent: () => import('./parts/ai-model-management/ai-provider-management/ai-provider-management.component').then(m => m.AIProviderManagementComponent) },
      { path: 'ai-model-management', loadComponent: () => import('./parts/ai-model-management/ai-model-management/ai-model-management.component').then(m => m.AIModelManagementComponent) },
      { path: 'ext-api-provider-template-form', loadComponent: () => import('./parts/ext-api-provider-template-form/ext-api-provider-template-form.component').then(m => m.ExtApiProviderTemplateFormComponent) },
      { path: 'ext-api-provider-form', loadComponent: () => import('./parts/ext-api-provider-form/ext-api-provider-form.component').then(m => m.ExtApiProviderFormComponent) },
      { path: 'department', loadComponent: () => import('./pages/department-management/department-management.component').then(m => m.DepartmentManagementComponent) },
    ],
  },
  { path: 'maintainer/announcements', canActivate: [loginGuardGenerator(UserRoleType.Maintainer, 'home')], loadComponent: () => import('./pages/announcements/announcements-list/announcements-list.component').then(m => m.AnnouncementsListComponent) },
  { path: '**', redirectTo: 'login' }, // 未定義のルートの場合はログインページにリダイレクトする
];
