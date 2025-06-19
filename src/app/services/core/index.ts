/**
 * Core Services Index
 * プロジェクト関連の分割されたサービスの統合エクスポート
 */
import { MessageService } from './message.service';
import { ProjectCoreService } from './project-core.service';
import { TeamService } from './team.service';
import { ThreadService } from './thread.service';

// Core Services
export { ProjectCoreService } from './project-core.service';
export { TeamService } from './team.service';
export { ThreadService } from './thread.service';
export { MessageService } from './message.service';

// Utilities
export {
    genDummyId,
    genInitialBaseEntity,
    resetCounter,
    genUpdateInfo,
    genCreateInfo
} from './project-utils';

// Types and Interfaces
export type { ProjectSearchParams, ProjectStats } from './project-core.service';

/**
 * 後方互換性のための再エクスポート
 * 既存のコードがproject.service.tsから直接インポートしている場合の対応
 */

// Legacy aliases for backward compatibility
export { ProjectCoreService as ProjectService } from './project-core.service';

/**
 * 全サービスを一括で取得するヘルパー関数
 */
export function getCoreServices() {
    return {
        ProjectCoreService,
        TeamService,
        ThreadService,
        MessageService
    };
}