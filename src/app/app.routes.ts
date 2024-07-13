import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
    { path: 'invite/:onetimeToken', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
    { path: 'home', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
    { path: '**', redirectTo: 'login' } // 未定義のルートの場合はログインページにリダイレクトする
];
