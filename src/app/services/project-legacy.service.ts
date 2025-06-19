/**
 * Legacy Project Service - Backward Compatibility
 * 既存のコードとの互換性を保つための再エクスポート
 * 新しいコードは core/ ディレクトリのサービスを直接使用してください
 */

// 新しい分離されたサービスを再エクスポート
export { TeamService } from './core/team.service';
export { ProjectCoreService as ProjectService } from './core/project-core.service';
export { ThreadService } from './core/thread.service';
export { MessageService } from './core/message.service';

// ユーティリティ関数を再エクスポート
export { 
    genDummyId, 
    genInitialBaseEntity, 
    resetCounter,
    genUpdateInfo,
    genCreateInfo 
} from './core/project-utils';

// ThreadMessageService は削除予定のため、一時的に空の実装を提供
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThreadMessageService {
    // TODO: このサービスは廃止予定です
    // 機能を MessageService と ThreadService に分割してください
    
    constructor() {
        console.warn('ThreadMessageService is deprecated. Please use MessageService and ThreadService instead.');
    }
}