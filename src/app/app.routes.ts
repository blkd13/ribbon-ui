import { Routes } from '@angular/router';
import { departmentGuard, loginGuard, oAuthGuardGenerator, projectGuard, teamGuard, threadGroupGuard } from './guard/chat.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'bulk', loadComponent: () => import('./parts/bulk-run-setting/bulk-run-setting.component').then(m => m.BulkRunSettingComponent) },
    { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
    { path: 'team/:teamId', canActivate: [teamGuard], loadComponent: () => import('./pages/team/team.component').then(m => m.TeamComponent) },
    { path: 'invite/:onetimeToken', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
    { path: 'home', canActivate: [loginGuard], loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
    {
        path: 'mattermost', canActivate: [oAuthGuardGenerator('mattermost')], children: [{
            path: ':targetTeamId', children: [
                { path: ':targetChannelId', loadComponent: () => import('./pages/mattermost/mattermost.component').then(m => m.MattermostComponent) },
                { path: '**', redirectTo: 'default' },
            ],
        }, { path: '**', redirectTo: 'timeline' }],
    },
    {
        path: 'box', canActivate: [oAuthGuardGenerator('box')], children: [{
            path: ':type', children: [
                { path: ':id', loadComponent: () => import('./pages/box/box.component').then(m => m.BoxComponent) },
                { path: '**', redirectTo: '0' }
            ],
        }, { path: '**', redirectTo: 'folder' }]
    },
    { path: 'gitlab', canActivate: [oAuthGuardGenerator('gitlab')], loadComponent: () => import('./pages/git/git.component').then(m => m.GitComponent) },
    { path: 'gitea', canActivate: [oAuthGuardGenerator('gitea')], loadComponent: () => import('./pages/git/git.component').then(m => m.GitComponent) },
    { path: 'department', canActivate: [departmentGuard], loadComponent: () => import('./pages/department-management/department-management.component').then(m => m.DepartmentManagementComponent) },
    {
        path: 'chat', children: [{
            path: ':projectId', canActivate: [projectGuard], children: [{
                path: ':threadGroupId', canActivate: [threadGroupGuard], loadComponent: () => import('./pages/chat/chat.component').then(m => m.ChatComponent)
            }, { path: '**', redirectTo: 'new-thread' }]
        }, { path: '**', redirectTo: 'defaut-project' }]
    },
    { path: 'oauth/mail/message/:pincode', loadComponent: () => import('./pages/oauth/oauth-mail-message/oauth-mail-message.component').then(m => m.OAuthMailMessageComponent) },
    { path: 'oauth/mail/auth/:onetimeToken', loadComponent: () => import('./pages/oauth/oauth-mail-auth/oauth-mail-auth.component').then(m => m.OAuthMailAuthComponent) },
    { path: '**', redirectTo: 'login' } // 未定義のルートの場合はログインページにリダイレクトする
];
