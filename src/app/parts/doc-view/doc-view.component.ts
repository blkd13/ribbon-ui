import { Component, inject, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MarkdownModule } from 'ngx-markdown';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { detect } from 'jschardet';
import { ContentPart } from '../../models/project-models';
import { FileManagerService } from './../../services/file-manager.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Utils } from '../../utils';

@Component({
  selector: 'app-doc-view',
  standalone: true,
  imports: [FormsModule, MarkdownModule, MatIconModule, MatButtonModule],
  templateUrl: './doc-view.component.html',
  styleUrl: './doc-view.component.scss'
})
export class DocViewComponent {

  contents: ContentPart[];
  content: ContentPart;
  brackets: { pre: string, post: string } = { pre: '', post: '' };

  type!: 'image' | 'text' | 'audio' | 'video' | 'pdf' | 'other';

  text: string = '';
  bytes!: Uint8Array;
  pdfUrl!: SafeResourceUrl;

  label: string = '';
  dataUrl: string = '';

  encode: 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP' | 'Windows-31J' = 'UTF-8';

  readonly dialogRef: MatDialogRef<DocViewComponent> = inject(MatDialogRef<DocViewComponent>);
  readonly sanitizer: DomSanitizer = inject(DomSanitizer);
  readonly data: { index: number, contents: ContentPart[] } = inject(MAT_DIALOG_DATA);
  readonly fileManagerService: FileManagerService = inject(FileManagerService);

  constructor() {
    this.contents = this.data.contents.filter(content => content.type === 'file');
    this.content = this.data.contents[this.data.index];
    this.setIndex(this.data.index);
  }

  changeIndex(type: 'increment' | 'decrement'): void {
    let index = this.data.index;
    const increment = type === 'increment' ? +1 : -1;
    for (let i = this.data.index; i < this.data.contents.length; i += increment) {
      if (this.data.contents[i].type === 'file') {
        index = i;
        break;
      } else {
        //
      }
    }
    this.setIndex(index);
  }

  setIndex(index: number): void {
    this.data.index = index;
    this.content = this.data.contents[index];
    this.label = (this.content.text || '');

    if (this.content.fileId) { } else { return; }
    this.fileManagerService.downloadFile(this.content.fileId).subscribe({
      next: next => {
        this.dataUrl = next;
        if (this.dataUrl.startsWith('data:image/')) {
          this.type = 'image';
        } else if (this.dataUrl.startsWith('data:text/')
          || this.dataUrl.startsWith('data:application/octet-stream')
          || this.dataUrl.startsWith('data:application/x-csh')
          || this.dataUrl.startsWith('data:application/x-sh')
          || this.dataUrl.startsWith('data:application/x-sql')
          || this.dataUrl.startsWith('data:application/x-typescript')
          || this.dataUrl.startsWith('data:application/xml')
          || this.dataUrl.startsWith('data:application/x-ns-proxy-autoconfig')
        ) {
          this.type = 'text';
          try {
            const base64Binary = atob(this.dataUrl.substring(this.dataUrl.indexOf(',') + 1));
            // バイナリ文字列をUint8Arrayに変換
            const len = base64Binary.length;
            this.bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              this.bytes[i] = base64Binary.charCodeAt(i);
            }

            // 自動エンコーディングを使う
            const detectedEncoding = detect(base64Binary);
            console.log("Detected encoding:", detectedEncoding.encoding);
            this.encode = detectedEncoding.encoding as 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP' | 'Windows-31J';
            if (detectedEncoding.encoding === 'ISO-8859-2') {
              this.encode = 'Windows-31J';
            } else if (!detectedEncoding.encoding) {
              this.encode = 'Windows-31J';
            }
            const decodedString = this.decode();
            let trg = this.label.replace(/.*\./g, '');
            trg = { cob: 'cobol', cbl: 'cobol', pco: 'cobol' }[trg] || trg;
            console.log(`${trg}:${this.label}`);
            this.text = `\`\`\`${trg}\n${decodedString}\n\`\`\``;
            // this.inDto.args.messages.push({ role: 'user', content: [{ type: 'text', text: covered }] });
          } catch (e) {
            console.log('--------------------');
            console.log(e);
            // this.text = this.dataUrl;
          }
        } else if (this.dataUrl.startsWith('data:audio/')) {
          this.type = 'audio';
        } else if (this.dataUrl.startsWith('data:video/')) {
          this.type = 'video';
        } else if (
          this.dataUrl.startsWith('data:application/pdf')
          || this.dataUrl.startsWith('data:application/msword')
          || this.dataUrl.startsWith('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          || this.dataUrl.startsWith('data:application/vnd.ms-powerpoint')
          || this.dataUrl.startsWith('data:application/vnd.openxmlformats-officedocument.presentationml.presentation')
        ) {
          if (this.dataUrl.startsWith('data:application/pdf')) {
            this.type = 'pdf';
            this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.dataUrl);
          } else {
            this.type = 'other';
            if (this.content.fileId) {
              this.fileManagerService.downloadFile(this.content.fileId, 'pdf').subscribe({
                next: next => {
                  this.type = 'pdf';
                  this.dataUrl = next;
                  this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.dataUrl);
                  console.log();
                }
              });
            }
          }
        } else {
          this.type = 'other';
        }

      }
    });
  }

  decode(): string {
    // Uint8ArrayをUTF-8としてデコード
    const decoder = new TextDecoder(this.encode);
    const decodedString = decoder.decode(this.bytes);
    return decodedString;
  }

  downloadFile(): void {
    // Anchor要素を生成
    const link = document.createElement('a');
    // Blobの作成
    const blob = this.dataURLtoBlob(this.dataUrl);
    // Blob URLの作成
    const url = window.URL.createObjectURL(blob);

    // ダウンロードリンクの設定
    link.href = url;
    link.download = this.label;
    document.body.appendChild(link);
    link.click();

    // リンクを削除
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  // Data URLをBlobに変換する関数
  dataURLtoBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);

    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }

    return new Blob([u8arr], { type: mime });
  }

}
