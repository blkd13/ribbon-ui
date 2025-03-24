import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToolCallPart, ToolCallPartCall, ToolCallPartResult, ToolCallService, ToolCallSet } from '../../services/tool-call.service';
import { MarkdownModule } from 'ngx-markdown';
import { CommonModule } from '@angular/common';


/**
 * この画面は関数呼び出しの詳細を表示する画面。
 * ユーザー入力で引数を指定できるようにする。
 */


@Component({
  selector: 'app-tool-call-call-result-dialog',
  imports: [MarkdownModule, CommonModule],
  templateUrl: './tool-call-call-result-dialog.component.html',
  styleUrl: './tool-call-call-result-dialog.component.scss'
})
export class ToolCallCallResultDialogComponent {

  public dialogRef: MatDialogRef<ToolCallCallResultDialogComponent> = inject(MatDialogRef);
  // public readonly data = inject<{ toolCallGroupId: string, index: number }>(MAT_DIALOG_DATA);
  public readonly data = inject<{ toolCallId: string }>(MAT_DIALOG_DATA);

  private readonly toolCallService: ToolCallService = inject(ToolCallService);

  index: number = 0;
  isError = false;
  toolCallSetList: ToolCallSet[] = [];

  constructor() {
    // this.index = this.data.index;
    this.toolCallService.getToolCallGroupByToolCallId(this.data.toolCallId).subscribe(toolCallGroup => {
      this.toolCallSetList = this.toolCallService.toolCallListToToolCallSetList(toolCallGroup.toolCallList);

      // 無理矢理エラー判定
      if (this.toolCallSetList[this.index]) {
        const result = this.toolCallSetList[this.index].resultList.at(-1);
        if (result) {
          try {
            const json = JSON.parse(result.content);
            if (json.isError) {
              this.isError = true;
            } else { }
          } catch { }
        } else { }
      } else { }
    });
  }

  jsonToString(text: string): string {
    try {
      const json = JSON.parse(text);
      if (typeof json === 'string') {
        return json;
      } else {
        return JSON.stringify(json, null, 2);
      }
    } catch {
      return text;
    }
  }
}
