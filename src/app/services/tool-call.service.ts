import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { GService } from './g.service';
import { ChatCompletionTool } from 'openai/resources/index.mjs';

export interface MyToolInfo {
  group: string;
  label: string;
  name: string; // 画面に来るときは絶対ある
  requireComfirm?: boolean; // 実行確認を要するもの
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
