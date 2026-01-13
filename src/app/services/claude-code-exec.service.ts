import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { ClaudeCodeOutput } from '../models/code-session-models';
import { ChatService } from './chat.service';

// 型を再エクスポート（既存の参照との互換性のため）
export { ClaudeCodeOutput } from '../models/code-session-models';

/**
 * ClaudeCode実行サービス
 * 既存のSSEインフラ（ChatService）を活用してClaudeCodeを実行する
 */
@Injectable({ providedIn: 'root' })
export class ClaudeCodeExecService {
    private http = inject(HttpClient);
    private chatService = inject(ChatService);

    /**
     * ClaudeCodeを実行し、ストリーミング出力を返す
     * @param projectId コンテナのプロジェクトID
     * @param prompt 実行するプロンプト
     * @param sessionId ClaudeCodeのセッションID（オプション、指定しない場合は自動生成）
     * @param resume 既存セッションを継続する場合はtrue（--resume）、新規の場合はfalse（--session-id）
     * @param forkFromSessionId 分岐元のセッションID（指定すると--fork-sessionで分岐）
     */
    execute(projectId: string, prompt: string, sessionId?: string, resume?: boolean, forkFromSessionId?: string): Observable<{
        streamId: string;
        sessionId?: string;
        output$: Observable<ClaudeCodeOutput>;
    }> {
        const streamId = uuidv4();
        const subject = new Subject<ClaudeCodeOutput>();

        console.log(`[ClaudeCodeExec] ========== execute called ==========`);
        console.log(`[ClaudeCodeExec] projectId: ${projectId}`);
        console.log(`[ClaudeCodeExec] sessionId: ${sessionId || '(auto)'}`);
        console.log(`[ClaudeCodeExec] resume: ${resume}`);
        console.log(`[ClaudeCodeExec] forkFromSessionId: ${forkFromSessionId || '(none)'}`);
        console.log(`[ClaudeCodeExec] prompt: ${prompt?.substring(0, 100)}...`);
        console.log(`[ClaudeCodeExec] streamId: ${streamId}`);

        // ChatServiceのsubjectMapに登録
        this.chatService.registerStream(streamId, subject);
        console.log(`[ClaudeCodeExec] Stream registered with ChatService`);

        // SSE接続を確保してからPOST
        return this.chatService.ensureConnection().pipe(
            switchMap(connectionId => {
                console.log(`[ClaudeCodeExec] SSE connection ensured, connectionId: ${connectionId}`);
                console.log(`[ClaudeCodeExec] Sending POST to /user/claude-code/execute`);
                return this.http.post<{ streamId: string; status: string }>(
                    `/user/claude-code/execute`,
                    {
                        projectId,
                        prompt,
                        ...(sessionId && { sessionId }),
                        ...(resume !== undefined && { resume }),
                        ...(forkFromSessionId && { forkFromSessionId })
                    },
                    { params: { connectionId, streamId } }
                );
            }),
            map((response) => {
                console.log(`[ClaudeCodeExec] POST response:`, response);
                return {
                    streamId,
                    sessionId,
                    output$: subject.asObservable()
                };
            })
        );
    }

    /**
     * ClaudeCodeを対話モードで実行し、ストリーミング出力を返す
     * ツール使用時にユーザーに許可を求めるモード
     * @param projectId コンテナのプロジェクトID
     * @param prompt 実行するプロンプト
     * @param sessionId ClaudeCodeのセッションID（オプション）
     * @param resume 既存セッションを継続する場合はtrue
     */
    executeInteractive(projectId: string, prompt: string, sessionId?: string, resume?: boolean): Observable<{
        streamId: string;
        sessionId?: string;
        output$: Observable<ClaudeCodeOutput>;
    }> {
        const streamId = uuidv4();
        const subject = new Subject<ClaudeCodeOutput>();

        console.log(`[ClaudeCodeExec] ========== executeInteractive called ==========`);
        console.log(`[ClaudeCodeExec] projectId: ${projectId}`);
        console.log(`[ClaudeCodeExec] sessionId: ${sessionId || '(auto)'}`);
        console.log(`[ClaudeCodeExec] resume: ${resume}`);
        console.log(`[ClaudeCodeExec] prompt: ${prompt?.substring(0, 100)}...`);
        console.log(`[ClaudeCodeExec] streamId: ${streamId}`);

        // ChatServiceのsubjectMapに登録
        this.chatService.registerStream(streamId, subject);
        console.log(`[ClaudeCodeExec] Stream registered with ChatService (interactive mode)`);

        // SSE接続を確保してからPOST
        return this.chatService.ensureConnection().pipe(
            switchMap(connectionId => {
                console.log(`[ClaudeCodeExec] SSE connection ensured, connectionId: ${connectionId}`);
                console.log(`[ClaudeCodeExec] Sending POST to /user/claude-code/execute-interactive`);
                return this.http.post<{ streamId: string; status: string; mode: string }>(
                    `/user/claude-code/execute-interactive`,
                    {
                        projectId,
                        prompt,
                        ...(sessionId && { sessionId }),
                        ...(resume !== undefined && { resume })
                    },
                    { params: { connectionId, streamId } }
                );
            }),
            map((response) => {
                console.log(`[ClaudeCodeExec] POST response (interactive):`, response);
                return {
                    streamId,
                    sessionId,
                    output$: subject.asObservable()
                };
            })
        );
    }

    /**
     * 対話モードでユーザー応答を送信
     * @param streamId ストリームID
     * @param response ユーザーの応答（'y' または 'n'）
     */
    respond(streamId: string, response: string): Observable<{ streamId: string; status: string }> {
        console.log(`[ClaudeCodeExec] respond: streamId=${streamId}, response=${response}`);
        return this.http.post<{ streamId: string; status: string }>(
            `/user/claude-code/respond`,
            { streamId, response }
        );
    }

    /**
     * 実行中のClaudeCodeをキャンセル
     * @param streamId キャンセルするストリームID
     */
    cancel(streamId: string): Observable<{ streamId: string; status: string }> {
        return this.http.post<{ streamId: string; status: string }>(
            `/user/claude-code/cancel`,
            { streamId }
        );
    }
}
