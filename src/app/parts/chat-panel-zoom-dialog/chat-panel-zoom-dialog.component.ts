import { Component, ElementRef, inject, output, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ContentPartType, MessageGroupForView } from '../../models/project-models';
import { MarkdownModule } from 'ngx-markdown';
import { ChatPanelBaseComponent } from '../chat-panel-base/chat-panel-base.component';
import { DomUtils } from '../../utils/dom-utils';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import JSZip from 'jszip';
import { saveAs } from 'file-saver'; // Blobファイルのダウンロードのためのライブラリ
import { Utils } from '../../utils';
import { MessageService } from '../../services/project.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-chat-panel-zoom-dialog',
  imports: [MarkdownModule, MatSnackBarModule, MatIconModule, MatButtonModule],
  templateUrl: './chat-panel-zoom-dialog.component.html',
  styleUrl: './chat-panel-zoom-dialog.component.scss'
})
export class ChatPanelZoomDialogComponent {

  readonly dialogRef: MatDialogRef<ChatPanelZoomDialogComponent> = inject(MatDialogRef<ChatPanelZoomDialogComponent>);
  readonly data = inject<{ messageGroup: MessageGroupForView }>(MAT_DIALOG_DATA);
  readonly snackBar = inject(MatSnackBar);
  readonly messageService = inject(MessageService);
  readonly readyEmitter = output<boolean>({ alias: 'ready' });
  readonly textBodyElem = viewChild<ElementRef<HTMLDivElement>>('textBodyElem');

  // Jsonの場合は```jsonで囲むための文字列
  bracketsList: { pre: '' | '```json\n', post: '' | '\n```' }[][] = [];
  blankBracket: { pre: '' | '```json\n', post: '' | '\n```' } = { pre: '', post: '' };

  constructor() {
    // console.log(this.data.messageGroup);
    this.setBrackets();
    this.onReady({}, '');
  }
  setBrackets(): void {
    this.data.messageGroup.messages.forEach((message, mIndex) => {
      this.bracketsList[mIndex] = [];
      message.contents.forEach((content, cIndex) => {
        if (content
          && [ContentPartType.TEXT, ContentPartType.ERROR].includes(content.type)
          && content.text
          && (content.text.startsWith('{') || content.text.startsWith('['))
        ) {
          this.bracketsList[mIndex][cIndex] = { pre: '```json\n', post: '\n```' };
          // エラーの時はJSONを整形しておく
          if (content.type === ContentPartType.ERROR) {
            // 整形失敗しても気にしない
            try { content.text = JSON.stringify(JSON.parse(content.text), null, 2); } catch (err) { }
          } else { }
        } else {
          this.bracketsList[mIndex][cIndex] = this.blankBracket;
        }
      });
    });
  }

  onReady($event: any, type: string): void {
    // console.log($event, type);
    this.convertSvgToImage();
    this.readyEmitter.emit(true);
  }

  convertSvgToImage() {
    const container = this.textBodyElem()?.nativeElement;
    if (container) {
      const svgs = container.querySelectorAll('code.language-svg,code.language-xml,code.language-markdown');
      svgs.forEach(_svg => {
        const svg = (_svg as HTMLPreElement);
        let textContent = svg.textContent || '';
        if (/<svg[\s>]/i.test(textContent)) {
          if (!textContent.includes('xmlns=')) {
            textContent = textContent.replace('>', ' xmlns="http://www.w3.org/2000/svg">');
          } else { }
          // textContent.includes('xmlns="http://www.w3.org/2000/svg"')
          // SVGをData URIに変換
          // const xml = new XMLSerializer().serializeToString(svg);
          const svg64 = Utils.toBase64(textContent || '');
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
      const html = container.querySelectorAll('code.language-html');
      html.forEach(_html => {
        const html = (_html as HTMLPreElement);
        const textContent = html.textContent || '';
        if (/<html[\s>]/i.test(textContent)) {
          // iframe要素を作成
          const iframe = document.createElement('iframe');
          iframe.srcdoc = html.textContent || '';
          iframe.width = '100%';
          iframe.style.border = 'none';
          iframe.style.backgroundColor = 'white';
          const maxHeight = 800;

          // iframeのload時にheightを調整する関数を設定
          iframe.onload = () => {
            try {
              // iframeのコンテンツの高さを取得して設定
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc) {
                // スクロール高さを取得
                const height = Math.min(iframeDoc.documentElement.scrollHeight, maxHeight);
                iframe.height = `${height}px`;

                // リサイズイベントを監視して高さを再調整（レスポンシブ対応）
                const resizeObserver = new ResizeObserver(() => {
                  const newHeight = Math.min(iframeDoc.documentElement.scrollHeight, maxHeight);
                  iframe.height = `${newHeight}px`;
                });
                resizeObserver.observe(iframeDoc.body);
              }
            } catch (e) {
              console.error('iframe height adjustment failed:', e);
              // エラー時はデフォルト高さを設定
              iframe.height = '500px';
            }
          };

          // 元のHTML要素を非表示にする
          html.style.display = 'block';
          html.style.height = '0';
          html.style.width = '0';
          html.style.overflow = 'hidden';
          html.parentNode?.appendChild(iframe);
        }
      });
    } else { }
  }


  downloadContent($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();

    let counter = 0;
    const zip = new JSZip();

    this.data.messageGroup.messages.forEach((message, mIndex) => {
      const textList = message.contents.map((content, index) => {
        if (content.type === 'text') {
          // 奇数インデックスがコードブロックなので、それだけ抜き出す。
          Utils.splitCodeBlock(content.text || '').filter((b, index) => index % 2 === 1).forEach(codeBlock => {
            const codeLineList = codeBlock.split('\n');
            let filename = `content-${counter}.txt`;
            const header = codeLineList.shift() || ''; // 先頭行を破壊的に抽出
            if (header.trim()) {
              const headers = header.trim().split(' ');
              const ext = this.messageService.languageExtensions[headers[0]] || headers[0];
              filename = headers[1] || `content-${counter}.${ext}`;
            } else {
              // plain block
            }
            // ZIPにファイルを追加
            zip.file(filename, codeLineList.join('\n'));
            counter++;
          });
        } else {
          // text以外のコンテンツは無視
          // TODO 本来はファイルとしてダウンロードさせるべきかも・・？
        }
      });
      if (counter) {
        // ZIPファイルを生成し、ダウンロードする
        zip.generateAsync({ type: 'blob' }).then(content => {
          // Blobを利用してファイルをダウンロード
          saveAs(content, `ribbon-${Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS')}.zip`);
          this.snackBar.open(`ダウンロードが完了しました。`, 'close', { duration: 1000 });
        });
      } else {
        this.snackBar.open(`コードブロックが含まれていないので何もしません。`, 'close', { duration: 3000 });
      }
    });

  }

  /**
   * テキストをクリップボードにコピーする
   */
  copyToClipboard($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    const textList = this.data.messageGroup.messages.map(message => {
      return message.contents.map(content => {
        if (content.type === 'text') {
          return content.text;
        } else {
          return '';
        }
      }).join('\n');
    });
    const text = textList.join('\n');
    DomUtils.copyToClipboard(text);
    this.snackBar.open(`コピーしました。`, 'close', { duration: 1000 });
  }

  closeDialog($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.dialogRef.close();
  }
}
