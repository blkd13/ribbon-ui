import { Component, ElementRef, inject, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToolCallPart, ToolCallPartCall, ToolCallPartResult, ToolCallService, ToolCallSet } from '../../services/tool-call.service';
import { MarkdownModule } from 'ngx-markdown';
import { CommonModule } from '@angular/common';
import { Utils } from '../../utils';
import { MatTabsModule } from '@angular/material/tabs';
import { DomSanitizer, SafeHtml, SafeUrl } from '@angular/platform-browser';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';


/**
 * この画面は関数呼び出しの詳細を表示する画面。
 * ユーザー入力で引数を指定できるようにする。
 */


@Component({
  selector: 'app-tool-call-call-result-dialog',
  imports: [MarkdownModule, CommonModule, MatTabsModule, MatExpansionModule, MatCardModule],
  templateUrl: './tool-call-call-result-dialog.component.html',
  styleUrl: './tool-call-call-result-dialog.component.scss'
})
export class ToolCallCallResultDialogComponent {

  public dialogRef: MatDialogRef<ToolCallCallResultDialogComponent> = inject(MatDialogRef);
  // public readonly data = inject<{ toolCallGroupId: string, index: number }>(MAT_DIALOG_DATA);
  public readonly data = inject<{ toolCallId: string }>(MAT_DIALOG_DATA);
  readonly sanitizer: DomSanitizer = inject(DomSanitizer);


  private readonly toolCallService: ToolCallService = inject(ToolCallService);

  index: number = 0;
  isErrorRequest = false;
  isErrorResponse = false;
  toolCallSetList: ToolCallSet[] = [];

  constructor() {
    // this.index = this.data.index;
    this.toolCallService.getToolCallGroupByToolCallId(this.data.toolCallId).subscribe({
      next: toolCallGroup => {
        this.toolCallSetList = this.toolCallService.toolCallListToToolCallSetList(toolCallGroup.toolCallList);

        // 無理矢理エラー判定
        if (this.toolCallSetList[this.index]) {
          const result = this.toolCallSetList[this.index].resultList.at(-1);
          if (result) {
            try {
              const json = JSON.parse(result.content);
              if (json.isError) {
                this.isErrorResponse = true;
              } else { }

              // web_searchの結果を表示するために、JSONをパースしてDTOに変換
              if (this.toolCallSetList[this.index].info.name === 'web_search') {
                this.buildWebSearchDto(result.content);
              } else if (this.toolCallSetList[this.index].info.name === 'get_web_page_contents') {
                this.buildWebContentDto(result.content);
              } else { }
              setTimeout(() => {
                this.convertSvgToImage();
              }, 10);
            } catch { }
          } else { }
        } else { }
      },
      error: (error) => {
        console.error(error);
        this.isErrorRequest = true;
      }
    });
  }

  jsonPretty(text: string): string {
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

  jsonParseToObject(text: string): any {
    let ret = {};
    try {
      ret = JSON.parse(text || '{}') as any;
    } catch (error) {
      console.error(error);
      ret = { error };
    }
    return ret;
  }


  // ここ、ChatPanelMessageComponentを真似過ぎてて何とかしたい。onReadyは何故か利かなかった。。
  readonly textBodyElem = viewChild<ElementRef<HTMLDivElement>>('textBodyElem');
  convertSvgToImage() {
    const container = this.textBodyElem()?.nativeElement;
    if (container) {
      const svgs = container.querySelectorAll('code.language-svg,code.language-xml,code.language-html,language-markdown');
      svgs.forEach(_svg => {
        const svg = (_svg as HTMLPreElement);
        const textContent = svg.textContent || '';
        if (textContent.startsWith(`<?xml version="1.0" encoding="utf-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"
  "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">`)) {
          // SVGをData URIに変換
          // const xml = new XMLSerializer().serializeToString(svg);
          const svg64 = btoa(unescape(encodeURIComponent(svg.textContent || '')));
          const image64 = 'data:image/svg+xml;base64,' + svg64;

          // 新しい<img>要素を作成
          const img = document.createElement('img');
          img.src = image64;
          img.alt = svg.textContent || '';
          // img.width = svg.width.baseVal.value; // SVGのwidthを引き継ぐ
          // img.height = svg.height.baseVal.value; // SVGのheightを引き継ぐ

          // this.message.contents[0].text = `![画像](${image64})`;

          // SVGを<img>で置き換える
          svg.style.display = 'block';
          svg.style.height = '0';
          svg.style.width = '0';
          svg.style.overflow = 'hidden';
          svg.parentNode?.appendChild(img);
          // svg.parentNode?.replaceChild(img, svg);
        } else { }
      });
    } else { }
  }

  webSearchDto: {
    items: {
      title: string;
      link: string;
      snippet: string;
      body: string;
      faviconUrl: SafeUrl;
    }[]
  } = { items: [] }; // Changed from {} to [] to initialize as an array
  buildWebSearchDto(content: string): SafeUrl {
    try {
      JSON.parse(content).forEach((item: { title: string, link: string, snippet: string, body?: string }) => {
        const urlObj = new URL(item.link);
        const faviconUrl = this.sanitizer.bypassSecurityTrustUrl(`https://${urlObj.hostname}/favicon.ico`);
        this.webSearchDto.items.push({ title: item.title, link: item.link, snippet: item.snippet, body: item.body || '', faviconUrl });
      });
    } catch (e) {
      console.error(e);
    }
    return '';
  }

  webContentDto: {
    items: {
      body: string;
      title: string;
      safeBody: SafeHtml;
      faviconUrl: SafeUrl;
      url: string
    }[]
  } = { items: [] }; // Changed from {} to [] to initialize as an array
  buildWebContentDto(content: string): SafeUrl {
    try {
      JSON.parse(content).forEach((item: { title: string, body: string, url: string }) => {
        const urlObj = new URL(item.url);
        const faviconUrl = this.sanitizer.bypassSecurityTrustUrl(`https://${urlObj.hostname}/favicon.ico`);
        this.webContentDto.items.push({ title: item.title, body: item.body, safeBody: this.sanitizer.bypassSecurityTrustHtml(item.body || ''), faviconUrl, url: item.url });
      });
    } catch (e) {
      console.error(e);
    }
    return '';
  }

}
