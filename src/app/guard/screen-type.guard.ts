import { inject } from "@angular/core";
import { CanActivateFn, Router } from "@angular/router";
import { GService } from "../services/g.service";

export const genScreenTypeGuard = (isWide: boolean): CanActivateFn => {
    const guardFunc: CanActivateFn = (route, state) => {
        const g: GService = inject(GService);
        const router = inject(Router);

        // 現在のパスを取得
        const currentPath = state.url;

        // モバイルデバイスかつPC用ページにアクセスしようとしている場合
        if (g.isMobile && isWide) {
            // /m プレフィックスを追加してリダイレクト
            const mobilePath = currentPath.startsWith('/m/') ? currentPath : `/m${currentPath}`;
            router.navigate([mobilePath]);
            return false;
        }

        // PCデバイスかつモバイル用ページにアクセスしようとしている場合
        if (!g.isMobile && !isWide) {
            // /m プレフィックスを削除してリダイレクト
            const desktopPath = currentPath.startsWith('/m/') ? currentPath.substring(2) : currentPath;
            router.navigate([desktopPath]);
            return false;
        }

        // 適切なデバイス・ページの組み合わせの場合は通す
        return true;
    };
    return guardFunc;
};