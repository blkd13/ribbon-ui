import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ChatCompletionTool, ChatCompletionToolMessageParam } from 'openai/resources/index.mjs';
import OpenAI from 'openai';

import { GService } from './g.service';
import { Observable, tap } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class ToolCallService {

  readonly g: GService = inject(GService);
  private readonly http: HttpClient = inject(HttpClient);

  tools: { group: string, tools: MyToolType[] }[] = [];

  constructor() {
    // 定義は起動時に取得しておく
    this.getFunctionDefinitions().subscribe(() => { });
  }

  getFunctionDefinitions(): Observable<MyToolType[]> {
    return this.http.get<MyToolType[]>('/function-definitions').pipe(
      tap(res => {
        res.forEach(tool => {
          const group = tool.info.group;
          const groupIndex = this.tools.findIndex(t => t.group === group);
          if (groupIndex === -1) {
            this.tools.push({ group, tools: [tool] });
          } else {
            this.tools[groupIndex].tools.push(tool);
          }
        });
      })
    );
  }

  toolCallListToToolCallSetList(toolCallList: ToolCallPart[]): ToolCallSet[] {
    const toolCallSetList: ToolCallSet[] = [];
    toolCallList.forEach(toolCall => this.appendToolCallPart(toolCallSetList, toolCall));
    return toolCallSetList;
  }

  appendToolCallPart(toolCallSetList: ToolCallSet[], toolCallPart: ToolCallPart): ToolCallSet[] {
    const masterToolCallPart = toolCallSetList.find(toolCallSet => toolCallSet.toolCallId === toolCallPart.toolCallId) || {
      toolCallGroupId: toolCallPart.toolCallGroupId,
      toolCallId: toolCallPart.toolCallId,
      info: null as any as ToolCallPartInfoBody,
      call: null as any as ToolCallPartCallBody,
      commandList: [] as ToolCallPartCommandBody[],
      resultList: [] as ToolCallPartResultBody[],
    } as ToolCallSet;
    if (masterToolCallPart.info) {
    } else {
      toolCallSetList.push(masterToolCallPart);
    }
    // id系が合ったら追加しておく
    masterToolCallPart.toolCallGroupId = masterToolCallPart.toolCallGroupId || toolCallPart.toolCallGroupId || '';
    masterToolCallPart.toolCallId = masterToolCallPart.toolCallId || toolCallPart.toolCallId;
    switch (toolCallPart.type) {
      case ToolCallPartType.INFO:
        masterToolCallPart.info = toolCallPart.body;
        break;
      case ToolCallPartType.CALL:
        masterToolCallPart.call = toolCallPart.body;
        break;
      case ToolCallPartType.COMMAND:
        masterToolCallPart.commandList.push(toolCallPart.body);
        break;
      case ToolCallPartType.RESULT:
        masterToolCallPart.resultList.push(toolCallPart.body);
        break;
    }
    return toolCallSetList;
  }

  getToolCallGroup(id: string): Observable<ToolCallGroupForView> {
    return this.http.get<ToolCallGroupForView>(`/user/tool-call-group/${id}`).pipe(tap(
      res => {
        this.fromatToolCallSetList(res.toolCallList);
      }
    ));
  }
  getToolCallGroupByToolCallId(id: string): Observable<ToolCallGroupForView> {
    return this.http.get<ToolCallGroupForView>(`/user/tool-call-group-by-tool-call-id/${id}`).pipe(tap(
      res => {
        this.fromatToolCallSetList(res.toolCallList);
      }
    ));
  }
  fromatToolCallSetList(toolCallPartList: ToolCallPart[]): ToolCallPart[] {
    return toolCallPartList.map(toolCall => {
      if (toolCall.type === ToolCallPartType.CALL) {
        toolCall.body.function.arguments = JSON.stringify(JSON.parse(toolCall.body.function.arguments || '{}'), null, 2);
      } else if (toolCall.type === ToolCallPartType.RESULT) {
        toolCall.body.content = JSON.stringify(JSON.parse(toolCall.body.content || '{}'), null, 2);
      } else { }
      return toolCall;
    });
  }
}


export interface ToolCallSet {
  toolCallGroupId: string;
  toolCallId: string;

  info: ToolCallPartInfoBody;
  call: ToolCallPartCallBody;
  commandList: ToolCallPartCommandBody[];
  resultList: ToolCallPartResultBody[];
}

export interface MyToolType {
  info: ToolCallPartInfoBody;
  definition: ChatCompletionTool;
}

export enum ToolCallPartType {
  INFO = 'info',
  CALL = 'call',
  COMMAND = 'command',
  RESULT = 'result',
}

export enum ToolCallGroupStatus {
  Normal = 'Normal',
  Deleted = 'Deleted',
}

export enum ToolCallPartStatus {
  Normal = 'Normal',
  Deleted = 'Deleted',
}

// 情報用のinterface
export interface ToolCallPartInfoBody {
  group: string;
  name: string;
  label: string;
  isActive: boolean;
  isInteractive: boolean; // ユーザーの入力を要するもの
  isRunnning: boolean;
  responseType?: 'text' | 'json' | 'markdown';
}

// 呼び出し用のinterface
export interface ToolCallPartCallBody {
  index: number;
  id: string;
  function: {
    arguments: any;
    name: string;
  };
  type: string;
}

// 入力用のinterface
export interface ToolCallPartCommandBody {
  command: 'execute' | 'cancel'; // コマンド
  input?: unknown; // ユーザーの入力
  arguments?: unknown; // argumentsを強制的に上書きする場合
}

// 結果用のinterface
export interface ToolCallPartResultBody {
  tool_call_id: string;
  role: string;
  content: any;
}

// 合成型
export type ToolCallPartBody =
  | ToolCallPartInfoBody // original
  | ToolCallPartCallBody | OpenAI.ChatCompletionChunk.Choice.Delta.ToolCall
  | ToolCallPartCommandBody // original
  | ToolCallPartResultBody | ChatCompletionToolMessageParam;

interface ToolCallBase {
  seq?: number;
  toolCallGroupId?: string;
  toolCallId: string;
}
export interface ToolCallPartInfo extends ToolCallBase {
  type: ToolCallPartType.INFO;
  body: ToolCallPartInfoBody;
}

export interface ToolCallPartCall extends ToolCallBase {
  type: ToolCallPartType.CALL;
  body: ToolCallPartCallBody;
}

export interface ToolCallPartCommand extends ToolCallBase {
  type: ToolCallPartType.COMMAND;
  body: ToolCallPartCommandBody;
}

export interface ToolCallPartResult extends ToolCallBase {
  type: ToolCallPartType.RESULT;
  body: ToolCallPartResultBody;
}

export type ToolCallPart = (ToolCallPartInfo | ToolCallPartCall | ToolCallPartCommand | ToolCallPartResult);

export interface ToolCallGroup {
  id: string;
  projectId: string;
  // status: ToolCallGroupStatus;
}

export interface ToolCallGroupForView extends ToolCallGroup {
  // id: string;
  // status: ToolCallGroupStatus;
  toolCallList: ToolCallPart[];
}
