import { AuthService, OAuth2Provider } from './../services/auth.service';
import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRoute } from '@angular/router';
import { ProjectService, TeamService, ThreadService } from '../services/project.service';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { Project, ProjectVisibility, Team, TeamType } from '../models/project-models';
import { UserRole } from '../models/models';

// export const oAuthGuardGenerator = (oAuthProvider: OAuth2Provider): CanActivateFn => {
//   const guardFunc: CanActivateFn = (route, state) => {
//     const authService: AuthService = inject(AuthService);
//     // const router = inject(Router);
//     console.log(route);
//     return authService.getOAuthAccount(oAuthProvider).pipe(
//       map(oAuthAccount => {
//         console.log(route);
//         authService.isOAuth2Connected(oAuthProvider, 'user-info', route.url.toString()).subscribe({
//           next: (res) => {
//             console.log(res);
//           },
//           error: (err) => {
//             console.log(location.href);
//             console.error(err);
//             // ログインされていなかったらOAuth2のログイン画面に飛ばす（Angularの外に出る）
//             location.href = `/api/oauth/${oAuthProvider}/login?fromUrl=${encodeURIComponent(location.href)}`;
//           },
//         });
//         return true;
//       }),
//       catchError(err => {
//         console.log('OAuth2ログインが必要です');
//         // ログインされていなかったらOAuth2のログイン画面に飛ばす（Angularの外に出る）
//         location.href = `/api/oauth/${oAuthProvider}/login?fromUrl=${encodeURIComponent(location.href)}`;
//         console.error(err);
//         return of(false);
//       }),
//     );
//   };
//   return guardFunc;
// }

export const oAuthGuardGenerator = (oAuthProvider: OAuth2Provider): CanActivateFn => {
  const guardFunc: CanActivateFn = (route, state) => {
    const authService: AuthService = inject(AuthService);
    console.log(route);
    return authService.getOAuthAccount(oAuthProvider).pipe(
      // getOAuthAccount の結果が返ってきたら
      // isOAuth2Connected を呼び出して結果を返すまで待つ
      switchMap(oAuthAccount => {
        console.log(route);
        return authService.isOAuth2Connected(oAuthProvider, 'user-info', route.url.toString()).pipe(
          map(res => {
            console.log(res);
            // 成功時にはtrueを返す
            return true;
          }),
          catchError(err => {
            console.log(location.href);
            console.error(err);
            // 飛ばす機能をinterceptorに実装したので飛ばさない。本当にこれでいいかは再考。
            // // ログインされていなかったらOAuth2のログイン画面に飛ばす
            // location.href = `/api/oauth/${oAuthProvider}/login?fromUrl=${encodeURIComponent(location.href)}`;
            return of(false);
          }),
        );
      }),
      catchError(err => {
        console.log('OAuth2ログインが必要です');
        // getOAuthAccount 自体が失敗した場合もログイン画面へ飛ばす
        location.href = `/api/oauth/${oAuthProvider}/login?fromUrl=${encodeURIComponent(location.href)}`;
        console.error(err);
        return of(false);
      }),
    );
  };

  return guardFunc;
}


export const loginGuard: CanActivateFn = (route, state) => {
  const authService: AuthService = inject(AuthService);
  const router = inject(Router);
  return authService.getUser().pipe(map(user => {
    if (user) {
      return true;
    } else {
      router.navigate(['/login']);
      return false;
    }
  }));
};

export const departmentGuard: CanActivateFn = (route, state) => {
  const authService: AuthService = inject(AuthService);
  const router = inject(Router);
  return authService.getUser().pipe(
    map(user => {
      if ([UserRole.Admin, UserRole.Maintainer].includes(user.role)) {
        return true;
      } else {
        router.navigate(['/home']);
        return false;
      }
    },),
  );
};

export const teamGuard: CanActivateFn = (route, state) => {
  const { teamId } = route.params;
  if (teamId === 'new-team') {
    return true;
  } else {
    const teamService: TeamService = inject(TeamService);
    const router = inject(Router);
    const activatedRoute = inject(ActivatedRoute);
    return teamService.getTeam(teamId).pipe(
      map(team => {
        if (team) {
          return true;
        } else {
          // ホームに戻す
          alert('権限がありません');
          router.navigate(['home'], { relativeTo: activatedRoute });
          return false;
        }
      })
    );
  }
};

export const projectGuard: CanActivateFn = (route, state) => {

  const projectService: ProjectService = inject(ProjectService);
  const teamService: TeamService = inject(TeamService);

  const router = inject(Router);
  const activatedRoute = inject(ActivatedRoute);
  const { projectId, threadGroupId } = route.params;

  let aloneTeam: Team;
  let defaultProject: Project;
  return teamService.getTeamList().pipe(
    switchMap(teamList => {
      // 自分専用チーム有無をチェック
      const _aloneTeam = teamList.find(team => team.teamType === TeamType.Alone);
      return _aloneTeam ?
        // aloneTeamがあればそのまま使う。チームリストもそのままのものを返す。
        (aloneTeam = _aloneTeam, of(teamList)) :
        // 無ければAloneのチームを作ってからthisに設定する。チームリストも取り直す。
        teamService.createTeam({
          name: 'Alone', label: 'Alone', teamType: TeamType.Alone, description: 'Alone'
        }).pipe(
          tap(team => aloneTeam = team),
          switchMap(team => teamService.getTeamList()),
        );
    }),
    switchMap(teamlist => {
      return projectService.getProjectList().pipe(
        switchMap(projectList => {
          // デフォルトプロジェクト有無をチェック
          const _defaultProject = projectList.find(project => project.visibility === ProjectVisibility.Default);
          return _defaultProject ?
            // defaultProjectがあればそのまま使う。プロジェクトリストもそのままのものを返す。
            (defaultProject = _defaultProject, of(projectList)) :
            // 無ければデフォルトプロジェクトを作ってからthisに設定する。プロジェクトリストも取り直す。
            projectService.createProject({
              teamId: aloneTeam.id, label: 'default', name: 'default', visibility: ProjectVisibility.Default
            }).pipe(
              tap(project => defaultProject = project),
              switchMap(project => projectService.getProjectList()),
            )
          // // デフォルトプロジェクトのスレッド一覧を取得する。
          // defaultProject$.pipe(switchMap(project => this.loadThreads(project)));
        })
      )
    }),
    map(projectList => {
      if (projectList.find(project => project.id === projectId)) {
        return true;
      } else {
        // デフォルトプロジェクトに飛ばす。activatedRouteはこの時点では空なのでchatから入れる
        router.navigate(['chat', defaultProject.id], { relativeTo: activatedRoute });
        return false;
      }
    })
  );
};

export const threadGroupGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const activatedRoute = inject(ActivatedRoute);
  const { projectId, threadGroupId } = route.params;
  const threadService: ThreadService = inject(ThreadService);
  if (threadGroupId === 'new-thread') {
    return true;
  } else {
    return threadService.getThreadGroupList(projectId, true).pipe(map(threadGroupList => {
      if (threadGroupList.find(threadGroup => threadGroup.id === threadGroupId)) {
        return true;
      } else {
        // デフォルトプロジェクトに飛ばす。
        router.navigate(['new-thread'], { relativeTo: activatedRoute });
        return false;
      }
    }));
  }
};
