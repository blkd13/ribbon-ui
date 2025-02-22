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
    let toolCallSet: ToolCallSet;
    toolCallList.forEach(toolCall => {
      switch (toolCall.type) {
        case ToolCallPartType.INFO:
          toolCallSet = { info: toolCall.body, call: null, commandList: [], resultList: [] } as any;
          toolCallSetList.push(toolCallSet);
          break;
        case ToolCallPartType.CALL:
          toolCallSet.call = toolCall;
          break;
        case ToolCallPartType.COMMAND:
          toolCallSet.commandList.push(toolCall);
          break;
        case ToolCallPartType.RESULT:
          toolCallSet.resultList.push(toolCall);
          break;
      }
    });
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
        toolCall.body.function.arguments = JSON.stringify(JSON.parse(toolCall.body.function.arguments), null, 2);
      } else if (toolCall.type === ToolCallPartType.RESULT) {
        toolCall.body.content = JSON.stringify(JSON.parse(toolCall.body.content), null, 2);
      } else { }
      return toolCall;
    });
  }
}


export interface ToolCallSet {
  info: ToolCallPartInfo;
  call: ToolCallPartCall;
  commandList: ToolCallPartCommand[];
  resultList: ToolCallPartResult[];
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
  isActive: boolean;
  group: string;
  name: string;
  label: string;
  isInteractive: boolean; // ユーザーの入力を要するもの
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
