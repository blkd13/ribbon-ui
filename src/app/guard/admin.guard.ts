import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.getUser().pipe(
    map(user => {
      // TODO: 実際の管理者判定ロジックに置き換える
      const isAdmin = user && user.id === 'admin';
      if (!isAdmin) {
        router.navigate(['/error']);
        return false;
      }
      return true;
    })
  );
};
