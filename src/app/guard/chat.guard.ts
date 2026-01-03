import { inject } from '@angular/core';
import { ActivatedRoute, CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { UserRoleType } from '../models/models';
import { Project, ProjectVisibility, Team, TeamType } from '../models/project-models';
import { GService } from '../services/g.service';
import { LoggerService } from '../services/logger';
import { ProjectService, TeamService, ThreadService } from '../services/project.service';
import { AuthService, ExtApiProviderType } from './../services/auth.service';

export const oAuthGuardGenerator = (oAuthProviderType: ExtApiProviderType): CanActivateFn => {
  const guardFunc: CanActivateFn = (route, state) => {
    const authService: AuthService = inject(AuthService);
    const g: GService = inject(GService);
    const logger: LoggerService = inject(LoggerService);
    logger.debug(route);
    const providerName = route.paramMap.get('providerName') as string;
    const provider = `${oAuthProviderType}-${providerName}`;
    return authService.getOAuthAccount(oAuthProviderType, providerName).pipe(
      // getOAuthAccount の結果が返ってきたら
      // isOAuth2Connected を呼び出して結果を返すまで待つ
      switchMap(oAuthAccount => {
        logger.debug(route);
        return authService.isOAuth2Connected(oAuthProviderType, providerName, 'user-info', route.url.toString()).pipe(
          map(res => {
            logger.debug(res);
            // 成功時にはtrueを返す
            return true;
          }),
          catchError(err => {
            logger.info(location.href);
            logger.error(err);
            // 飛ばす機能をinterceptorに実装したので飛ばさない。本当にこれでいいかは再考。
            // // ログインされていなかったらOAuth2のログイン画面に飛ばす
            // location.href = `/api/public/oauth/${g.info.user.orgKey}/${oAuthProvider}/login?fromUrl=${encodeURIComponent(location.href)}`;
            return of(false);
          }),
        );
      }),
      catchError(err => {
        logger.info('OAuth2ログインが必要です');
        // getOAuthAccount 自体が失敗した場合もログイン画面へ飛ばす
        location.href = `/api/public/oauth/${g.info.user.orgKey}/${provider}/login?fromUrl=${encodeURIComponent(location.href)}`;
        logger.error(err);
        return of(false);
      }),
    );
  };

  return guardFunc;
}

export const loginGuardGenerator = (role: UserRoleType, navigate: string): CanActivateFn => {
  const rolePriority = [UserRoleType.User, UserRoleType.Admin, UserRoleType.SuperAdmin];
  const roles = rolePriority.splice(rolePriority.indexOf(role));
  return (route, state) => {
    const authService: AuthService = inject(AuthService);
    const router = inject(Router);
    return authService.getUser().pipe(
      map(user => {
        const roleList = user.roleList.map(role => role.role);
        if (roleList.find(role => roles.includes(role))) {
          return true;
        } else {
          router.navigate(['/', navigate]);
          return false;
        }
      },),
    );
  }
};

export const teamGuard: CanActivateFn = (route, state) => {
  const { teamId } = route.params;
  if (teamId === 'new-team') {
    return true;
  } else {
    const teamService: TeamService = inject(TeamService);
    const router = inject(Router);
    const activatedRoute = inject(ActivatedRoute);
    const g: GService = inject(GService);
    return teamService.getTeam(teamId).pipe(
      map(team => {
        if (team) {
          return true;
        } else {
          // ホームに戻す
          alert('権限がありません');
          router.navigate([`${g.isMobilePrefix}chat`], { relativeTo: activatedRoute });
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
  const g: GService = inject(GService);
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
        router.navigate([`${g.isMobilePrefix}chat`, defaultProject.id], { relativeTo: activatedRoute });
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
    // ローカルキャッシュではなくAPIから直接存在確認する
    // (スレッド一覧が遅延読み込みのため、キャッシュだと50件以降が弾かれる)
    return threadService.getThreadGroup(projectId, threadGroupId).pipe(
      map(threadGroup => {
        if (threadGroup && threadGroup.projectId === projectId) {
          return true;
        } else {
          // プロジェクトIDが不一致の場合は新規スレッドへ
          router.navigate(['new-thread'], { relativeTo: activatedRoute });
          return false;
        }
      }),
      catchError(() => {
        // スレッドグループが存在しない場合は新規スレッドへ
        router.navigate(['new-thread'], { relativeTo: activatedRoute });
        return of(false);
      })
    );
  }
};
