import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ChatCompletionTool, ChatCompletionToolMessageParam } from 'openai/resources/index.mjs';
import OpenAI from 'openai';

import { GService } from './g.service';

export interface MyToolInfo {
  group: string;
  label: string;
  name: string; // 画面に来るときは絶対ある
  isInteractive?: boolean; // ユーザーの入力を要するもの
}
export interface MyToolType {
  info: MyToolInfo;
  definition: ChatCompletionTool;
}

@Injectable({
  providedIn: 'root'
})
export class ToolCallService {

  readonly g: GService = inject(GService);
  private readonly http: HttpClient = inject(HttpClient);

  tools: { group: string, tools: MyToolType[] }[] = [];

  constructor() {
    this.http.get<MyToolType[]>('/function-definitions').subscribe(res => {
      res.forEach(tool => {
        const group = tool.info.group;
        const groupIndex = this.tools.findIndex(t => t.group === group);
        if (groupIndex === -1) {
          this.tools.push({ group, tools: [tool] });
        } else {
          this.tools[groupIndex].tools.push(tool);
        }
      });
    });
  }
}

export enum ToolCallType {
  INFO = 'info',
  CALL = 'call',
  COMMAND = 'command',
  RESULT = 'result',
}

export enum ToolCallGroupStatus {
  Normal = 'Normal',
  Deleted = 'Deleted',
}

export enum ToolCallStatus {
  Normal = 'Normal',
  Deleted = 'Deleted',
}

// 情報用のinterface
export interface ToolCallInfoBody {
  isActive: boolean;
  group: string;
  name: string;
  label: string;
  isInteractive: boolean; // ユーザーの入力を要するもの
}

// 呼び出し用のinterface
export interface ToolCallCallBody {
  index: number;
  id: string;
  function: {
    arguments: any;
    name: string;
  };
  type: string;
}

// 入力用のinterface
export interface ToolCallCommandBody {
  command: 'execute' | 'cancel'; // コマンド
  input?: unknown; // ユーザーの入力
  arguments?: unknown; // argumentsを強制的に上書きする場合
}

// 結果用のinterface
export interface ToolCallResultBody {
  tool_call_id: string;
  role: string;
  content: any;
}

// 合成型
export type ToolCallBody =
  | ToolCallInfoBody // original
  | ToolCallCallBody | OpenAI.ChatCompletionChunk.Choice.Delta.ToolCall
  | ToolCallCommandBody // original
  | ToolCallResultBody | ChatCompletionToolMessageParam;

interface ToolCallBase {
  seq?: number;
  toolCallGroupId?: string;
  toolCallId: string;
}
export interface ToolCallInfo extends ToolCallBase {
  type: ToolCallType.INFO;
  body: ToolCallInfoBody;
}

export interface ToolCallCall extends ToolCallBase {
  type: ToolCallType.CALL;
  body: ToolCallCallBody;
}

export interface ToolCallCommand extends ToolCallBase {
  type: ToolCallType.COMMAND;
  body: ToolCallCommandBody;
}

export interface ToolCallResult extends ToolCallBase {
  type: ToolCallType.RESULT;
  body: ToolCallResultBody;
}

export type ToolCall = (ToolCallInfo | ToolCallCall | ToolCallCommand | ToolCallResult);

export interface ToolCallGroup {
  // id: string;
  // status: ToolCallGroupStatus;
  toolCallList: ToolCall[];
}
