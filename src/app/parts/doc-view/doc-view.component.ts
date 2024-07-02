import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ChatCompletionContentPartImage } from '../../models/models';
import { MarkdownModule } from 'ngx-markdown';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { detect } from 'jschardet';

@Component({
  selector: 'app-doc-view',
  standalone: true,
  imports: [FormsModule, MarkdownModule],
  templateUrl: './doc-view.component.html',
  styleUrl: './doc-view.component.scss'
})
export class DocViewComponent {

  content: ChatCompletionContentPartImage;
  brackets: { pre: string, post: string } = { pre: '', post: '' };

  type: 'image' | 'text' | 'audio' | 'video' | 'pdf' | 'other';

  text: string = '';
  bytes!: Uint8Array;
  pdfUrl!: SafeResourceUrl;

  encode: 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP' = 'UTF-8';

  constructor(
    private dialogRef: MatDialogRef<DocViewComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { content: ChatCompletionContentPartImage },
    private sanitizer: DomSanitizer,
  ) {
    this.content = data.content;
    const label = (this.content.image_url.label || '').toLowerCase();
    if (this.content.image_url.url.startsWith('data:image/')) {
      this.type = 'image';
    } else if (this.content.image_url.url.startsWith('data:text/') || this.content.image_url.url.startsWith('data:application/octet-stream')) {
      this.type = 'text';
      try {
        const base64Binary = atob(this.content.image_url.url.substring(this.content.image_url.url.indexOf(',') + 1));
        // バイナリ文字列をUint8Arrayに変換
        const len = base64Binary.length;
        this.bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          this.bytes[i] = base64Binary.charCodeAt(i);
        }

        // 自動エンコーディングを使う
        const detectedEncoding = detect(base64Binary);
        console.log("Detected encoding:", detectedEncoding.encoding);
        this.encode = detectedEncoding.encoding as 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP';
        if (detectedEncoding.encoding === 'ISO-8859-2') {
          this.encode = 'SHIFT_JIS';
        }
        const decodedString = this.decode();
        let trg = label.replace(/.*\./g, '');
        trg = { cob: 'cobol', cbl: 'cobol', pco: 'cobol' }[trg] || trg;
        console.log(`${trg}:${this.content.image_url.label}`);
        this.text = `\`\`\`${trg}\n${decodedString}\`\`\``;
        // this.inDto.args.messages.push({ role: 'user', content: [{ type: 'text', text: covered }] });
      } catch (e) {
        console.log('--------------------');
        console.log(e);
        // this.text = this.content.image_url.url;
      }
    } else if (this.content.image_url.url.startsWith('data:audio/')) {
      this.type = 'audio';
    } else if (this.content.image_url.url.startsWith('data:video/')) {
      this.type = 'video';
    } else if (this.content.image_url.url.startsWith('data:application/pdf')) {
      this.type = 'pdf';
      this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.content.image_url.url);
    } else {
      this.type = 'other';
    }
  }

  decode(): string {
    // Uint8ArrayをUTF-8としてデコード
    const decoder = new TextDecoder(this.encode);
    const decodedString = decoder.decode(this.bytes);
    return decodedString;
  }
}
