import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { of, switchMap, take } from 'rxjs';
import { UserRoleType } from '../models/models';
import { AdminScopeService } from '../services/admin-scope.service';
import { AuthService } from '../services/auth.service';
import { GService } from '../services/g.service';
import { ScopeInfo } from '../services/model-manager.service';

export const adminScopeGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const adminScopeService = inject(AdminScopeService);
    const router = inject(Router);
    const g = inject(GService);
    const translate = inject(TranslateService);
    const authService = inject(AuthService);    // ルートパラメータからスコープのタイプとIDを取得
    const scopeTypeParam = route.paramMap.get('scopeType');
    const scopeIdParam = route.paramMap.get('scopeId');

    // const param = route.paramMap.get('scopeType');
    // if (!param) {
    //     console.error('Scope type parameter is missing.');
    //     return of(false);
    // }
    // const [scopeTypeParam, scopeIdParam] = param.split('/');

    return authService.getScopeLabels().pipe(
        switchMap(labels => {
            const scopeLabelMap = Object.fromEntries(
                (Object.entries(labels.scopeLabels) as Array<[keyof typeof labels.scopeLabels, any[]]>)
                    .filter(([_, value]) => value && value.length > 0)
                    .flatMap(([key, value]) => value.map(item => [`${key}:${item.id}`, item.label]))
            );

            const availableScopesRaw = g.info.user.roleList
                .filter(role => [UserRoleType.Admin, UserRoleType.SuperAdmin].includes(role.role))
                .map(role => role.scopeInfo);

            // 重複を除去し、優先順位でソート
            const uniqueScopes = Array.from(new Map(availableScopesRaw.map(s => [`${s.scopeType}:${s.scopeId}`, s])).values());
            const availableScopes = uniqueScopes
                .sort((a, b) => adminScopeService.getScopePriority(b.scopeType) - adminScopeService.getScopePriority(a.scopeType))
                .map(s => ({ ...s, label: scopeLabelMap[`${s.scopeType}:${s.scopeId}`] || translate.instant('UNKNOWN_SCOPE') }));

            if (availableScopes.length === 0) {
                // 利用可能なスコープがない場合はエラーページなどに遷移させるか、適切な処理を行う
                console.error('No available scopes for admin.');
                router.navigate(['/', 'home']); // もしくはエラーページ
                return Promise.resolve(false);
            } else { /**  */ }

            let targetScope: ScopeInfo | null = null;

            if (scopeTypeParam && scopeIdParam) {
                const type = scopeTypeParam;
                const id = scopeIdParam;
                if (adminScopeService.isValidScopeType(type) && id) {
                    const foundScope = availableScopes.find(s => s.scopeType === type && s.scopeId === id);
                    if (foundScope) {
                        targetScope = foundScope;
                    }
                }
            }

            if (!targetScope) {
                targetScope = availableScopes[0]; // デフォルトスコープ
                const scopeUrlParam = adminScopeService.scopeToUrlParam(targetScope);
                const newUrl = state.url
                    .replace(/admin\/[^\\/]+\/[^\\/]+/, `admin/${scopeUrlParam}`)
                    // .replace(/admin\/[^\\/]+/, `admin/${scopeUrlParam}`)
                    .replace(/admin$/, `admin/${scopeUrlParam}`)
                    ;
                router.navigateByUrl(newUrl, { replaceUrl: true });
                adminScopeService.setSelectedScope(targetScope);
                return of(true);
                return Promise.resolve(true); // リダイレクト後に再度ガードが評価されることを期待
            }

            adminScopeService.setSelectedScope(targetScope);
            return of(true);
            return Promise.resolve(true);
        }),
        take(1) // Ensure the observable completes
    );
};
