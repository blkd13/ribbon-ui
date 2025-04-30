import { Component, inject, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MarkdownModule } from 'ngx-markdown';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { detect } from 'jschardet';
import { ContentPart } from '../../models/project-models';
import { FileEntity, FileEntityForView, FileGroupEntityForView, FileManagerService } from './../../services/file-manager.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { SelectTreeComponent } from '../select-tree/select-tree.component';
import { DragDeltaDirective } from '../drag-delta.directive';
import { GService } from '../../services/g.service';



// FileNodeというTree構造を表すインターフェイスを定義します。
interface FileNode {
  name: string;
  type: 'directory' | 'file';
  children?: FileNode[];
  file?: FileEntityForView;
  isActive: boolean;
  indeterminate: boolean;
  disabled: boolean;
}


@Component({
  selector: 'app-doc-view',
  imports: [
    CommonModule, FormsModule, MarkdownModule, MatIconModule, MatButtonModule, MatCheckboxModule, MatDividerModule,
    SelectTreeComponent, DragDeltaDirective
  ],
  templateUrl: './doc-view.component.html',
  styleUrl: './doc-view.component.scss'
})
export class DocViewComponent {

  index: number = -1;
  fileGroup!: FileGroupEntityForView;

  brackets: { pre: string, post: string } = { pre: '', post: '' };

  type!: 'image' | 'text' | 'audio' | 'video' | 'pdf' | 'other';

  text: string = '';
  bytes!: Uint8Array;
  pdfUrl!: SafeResourceUrl;

  label: string = '';
  dataUrl: string = '';

  encode: 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP' | 'Windows-31J' = 'UTF-8';

  treeData: FileNode[] = []; // ツリー構造化したデータを保持する配列

  fileTypeList: string[] = [];
  fileTypeMap: { [fileType: string]: { isActive: boolean, indeterminate: boolean, disabled: boolean } } = {};

  readonly dialogRef: MatDialogRef<DocViewComponent> = inject(MatDialogRef<DocViewComponent>);
  readonly sanitizer: DomSanitizer = inject(DomSanitizer);
  readonly g: GService = inject(GService);
  readonly data: { content: ContentPart } = inject(MAT_DIALOG_DATA);
  readonly fileManagerService: FileManagerService = inject(FileManagerService);

  constructor() {
    const fileGroupId = this.data.content.linkId || (this.data.content as any as { fileGroupId: string }).fileGroupId;
    if (fileGroupId) {
      this.fileManagerService.getFileGroup(fileGroupId).subscribe({
        next: next => {
          this.fileGroup = next;
          this.setIndeterminate();
          this.fileTypeList = [...new Set(this.fileGroup.files.map(file => file.fileType))];

          next.files.forEach(file => {
            file.isActive = this.g.invalidMimeTypes.includes(file.fileType) ? false : file.isActive;
          });
          // this.fileGroup.files.sort((a, b) => a.fileName.localeCompare(b.fileName));

          // // ツリー構造に変換
          // this.treeData = this.buildFileTree(this.fileGroup.files);

          // 初期選択
          this.setIndex(0);
        },
      });
    } else {
      // ファイルグループがない場合の処理
    }

  }


  // ファイルのリストからツリー構造を構築する
  buildFileTree(files: FileEntityForView[]): FileNode[] {
    const root: FileNode[] = [];
    files.forEach(file => {
      const pathParts = file.fileName.split('/'); // ファイル名に含まれるディレクトリ区切り文字を想定
      this.insertFileNode(root, pathParts, file, this.g.invalidMimeTypes);
    });

    return root;
  }

  // 再帰的にノードを挿入する関数
  insertFileNode(currentLevel: FileNode[], pathParts: string[], file: FileEntityForView, invalidMimeTypes: string[]): void {
    const part = pathParts[0];
    const isLast = pathParts.length === 1;

    let node = currentLevel.find(n => n.name === part);

    if (!node) {
      node = {
        name: part,
        type: isLast ? 'file' : 'directory',
        children: isLast ? [] : [],
        file: isLast ? file : undefined,
        isActive: file.isActive,
        indeterminate: false,
        disabled: isLast && invalidMimeTypes.includes(file.fileType),
      };

      if (!isLast) {
        node.children = [];
      }

      currentLevel.push(node);
    }

    if (!isLast && node.type === 'directory' && node.children) {
      this.insertFileNode(node.children, pathParts.slice(1), file, invalidMimeTypes);
    } else if (isLast) {
      // 最終ノードはファイル
      node.file = file;
      node.type = 'file';
      // 無効ファイルはdisabledフラグ
      node.disabled = invalidMimeTypes.includes(file.fileType);
      node.isActive = file.isActive;
    }
  }

  // ディレクトリ/ファイルのチェック状態更新
  checkFile(file: FileEntityForView): void {
    this.setIndeterminate();
    // this.fileManagerService.activateFile(file.isActive, [file.id]).subscribe({
    //   next: next => {
    //     console.log(next);
    //   },
    // });
  }

  // ディレクトリチェック切り替え
  checkDirectory(node: FileNode): void {
    // ディレクトリ内の全ファイルをチェック状態に合わせる
    this.setDirectoryActive(node, node.isActive);

    // // ファイル群を更新
    // const ids: string[] = this.collectFileIds(node);
    // this.fileManagerService.activateFile(node.isActive, ids).subscribe({
    //   next: next => {
    //     console.log(next);
    //   },
    // });

    // 親ディレクトリを遡ってindeterminateやisActiveを更新する処理が必要な場合は、
    // 表示前にbuildFileTree時などに参照を持たせておくか、全体を再評価するメソッドを利用します。
  }

  setDirectoryActive(node: FileNode, isActive: boolean): void {
    if (node.type === 'file' && node.file && !node.disabled) {
      node.isActive = isActive;
      node.file.isActive = isActive;
    }
    if (node.children) {
      node.children.forEach(child => {
        if (!child.disabled) {
          child.isActive = isActive;
          if (child.type === 'file' && child.file) {
            child.file.isActive = isActive;
          }
          this.setDirectoryActive(child, isActive);
        }
      });
    }
    this.updateDirectoryCheckStates(node);
  }

  // 子ノードの状態から現在のディレクトリノードのindeterminateなどを再計算
  updateDirectoryCheckStates(node: FileNode): void {
    if (node.type === 'file') {
      // ファイルならそのまま
      return;
    }
    if (!node.children || node.children.length === 0) {
      return;
    }

    let allActive = true;
    let anyActive = false;

    node.children.forEach(child => {
      this.updateDirectoryCheckStates(child);
      if (child.isActive) {
        anyActive = true;
      } else {
        allActive = false;
      }
      if (child.indeterminate) {
        allActive = false;
        anyActive = true;
      }
    });

    node.isActive = allActive && !node.disabled;
    node.indeterminate = !allActive && anyActive;
  }

  collectFileIds(node: FileNode): string[] {
    const ids: string[] = [];
    if (node.type === 'file' && node.file) {
      ids.push(node.file.id);
    }
    if (node.children) {
      node.children.forEach(child => {
        ids.push(...this.collectFileIds(child));
      });
    }
    return ids;
  }



  /// ------------------------------


  setIndeterminate(): void {
    // ファイル種別ごとにチェックボックスの状態を設定する。面倒なのは indeterminate の判定。
    // TODO 毎回全量洗い替えしてるので後で直した方がよい。
    this.fileTypeMap = this.fileGroup.files.reduce((mas, file) => {
      if (this.g.invalidMimeTypes.includes(file.fileType)) {
        mas[file.fileType] = { isActive: false, indeterminate: false, disabled: true };
      } else {
        if (mas[file.fileType]) {
          mas[file.fileType] = { isActive: file.isActive || mas[file.fileType].isActive, indeterminate: mas[file.fileType].indeterminate || (mas[file.fileType].isActive !== file.isActive), disabled: false };
          // console.log(mas[file.fileType].indeterminate);
        } else {
          mas[file.fileType] = { isActive: file.isActive, indeterminate: false, disabled: false };
        }
      }
      return mas;
    }, {} as { [fileType: string]: { isActive: boolean, indeterminate: boolean, disabled: boolean } });
  }

  setFile(file: FileEntityForView): void {
    // this.fileManagerService.activateFile(file.isActive, [file.id]).subscribe({
    //   next: next => {
    //     console.log(next);
    //   },
    // });

    this.setIndex(this.fileGroup.files.findIndex(f => f.id === file.id));
  }
  setIndex(index: number): void {
    if (index === this.index) return;
    this.index = index;
    this.label = this.fileGroup.files[index].fileName;

    if (this.fileGroup) { } else { return; }
    this.fileManagerService.downloadFile(this.fileGroup.files[index].id).subscribe({
      next: next => {
        this.dataUrl = next;
        if (this.dataUrl.startsWith('data:image/')) {
          this.type = 'image';
        } else if (false
          || this.dataUrl.startsWith('data:text/')
          // || this.dataUrl.startsWith('data:application/octet-stream')
          || this.dataUrl.startsWith('data:application/json')
          || this.dataUrl.startsWith('data:application/xml')
          || this.dataUrl.startsWith('data:application/x-yaml')
          || this.dataUrl.startsWith('data:application/x-toml')
          || this.dataUrl.startsWith('data:application/csv')
          || this.dataUrl.startsWith('data:application/x-ndjson')
          || this.dataUrl.startsWith('data:application/javascript')
          || this.dataUrl.startsWith('data:application/x-typescript')
          || this.dataUrl.startsWith('data:application/sql')
          || this.dataUrl.startsWith('data:application/graphql')
          || this.dataUrl.startsWith('data:application/x-sh')
          || this.dataUrl.startsWith('data:application/x-python')
          || this.dataUrl.startsWith('data:application/x-ipynb+json')
          || this.dataUrl.startsWith('data:application/x-ruby')
          || this.dataUrl.startsWith('data:application/x-php')
          || this.dataUrl.startsWith('data:application/x-latex')
          || this.dataUrl.startsWith('data:application/x-troff')
          || this.dataUrl.startsWith('data:application/x-tex')
          || this.dataUrl.startsWith('data:application/x-www-form-urlencoded')
          || this.dataUrl.startsWith('data:application/ld+json')
          || this.dataUrl.startsWith('data:application/vnd.api+json')
          || this.dataUrl.startsWith('data:application/problem+json')
          || this.dataUrl.startsWith('data:application/rtf')
          || this.dataUrl.startsWith('data:application/x-sql')
          || this.dataUrl.startsWith('data:application/xhtml+xml')
          || this.dataUrl.startsWith('data:application/rss+xml')
          || this.dataUrl.startsWith('data:application/atom+xml')
          || this.dataUrl.startsWith('data:application/x-tcl')
          || this.dataUrl.startsWith('data:application/x-lisp')
          || this.dataUrl.startsWith('data:application/x-r')
          || this.dataUrl.startsWith('data:application/postscript')
          || this.dataUrl.startsWith('data:application/vnd.google-earth.kml+xml')
          || this.dataUrl.startsWith('data:application/x-bash')
          || this.dataUrl.startsWith('data:application/x-csh')
          || this.dataUrl.startsWith('data:application/x-scala')
          || this.dataUrl.startsWith('data:application/x-kotlin')
          || this.dataUrl.startsWith('data:application/x-swift')
          || this.dataUrl.startsWith('data:application/x-plist')
          || this.dataUrl.startsWith('data:application/vnd.apple.mpegurl')
          || this.dataUrl.startsWith('data:application/x-apple-diskimage')
          || this.dataUrl.startsWith('data:application/x-objc')
          || this.dataUrl.startsWith('data:application/vnd.apple.pkpass')
          || this.dataUrl.startsWith('data:application/x-darwin-app')
          || this.dataUrl.startsWith('data:application/pem-certificate-chain')
          || this.dataUrl.startsWith('data:application/x-x509-ca-cert')
          || this.dataUrl.startsWith('data:application/x-ns-proxy-autoconfig')
          // 'image/svg',
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
            // console.log("Detected encoding:", detectedEncoding.encoding);
            this.encode = detectedEncoding.encoding as 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP' | 'Windows-31J';
            if (detectedEncoding.encoding === 'ISO-8859-2') {
              this.encode = 'Windows-31J';
            } else if (!detectedEncoding.encoding) {
              this.encode = 'Windows-31J';
            }
            const decodedString = this.decode();
            let trg = this.label.replace(/.*\./g, '');
            trg = { cob: 'cobol', cbl: 'cobol', pco: 'cobol', htm: 'html' }[trg] || trg;
            // console.log(`${trg}:${this.label}`);
            this.text = `\`\`\`${trg}\n${decodedString}\n\`\`\``;
            // this.inDto.args.messages.push({ role: 'user', content: [{ type: 'text', text: covered }] });
          } catch (e) {
            // console.log('--------------------');
            // console.log(e);
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
          || this.dataUrl.startsWith('data:application/vnd.ms-excel')
          || this.dataUrl.startsWith('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
          || this.dataUrl.startsWith('data:application/vnd.ms-excel.sheet.macroEnabled.12')
        ) {
          if (this.dataUrl.startsWith('data:application/pdf')) {
            this.type = 'pdf';
            this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.dataUrl);
          } else {
            this.type = 'other';
            if (this.fileGroup.files[index].id) {
              this.fileManagerService.downloadFile(this.fileGroup.files[index].id, 'pdf').subscribe({
                next: next => {
                  this.type = 'pdf';
                  this.dataUrl = next;
                  this.pdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.dataUrl);
                  // console.log();
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

  // checkFile(file: FileEntityForView): void {
  //   this.setIndeterminate();
  //   this.fileManagerService.activateFile(file.isActive, [file.id]).subscribe({
  //     next: next => {
  //       console.log(next);
  //     },
  //   });
  // }

  checkFileType(fileType: string): void {
    const ids: string[] = [];
    this.fileGroup.files.forEach(file => {
      if (file.fileType === fileType) {
        if (file.isActive === this.fileTypeMap[fileType].isActive) {
          /** 元から適用されてるので無視でよい */
        } else {
          file.isActive = this.fileTypeMap[fileType].isActive;
          ids.push(file.id);
        }
      } else { /** 関係ない */ }
    });

    // fileTypeMapの状態を更新
    this.fileTypeMap[fileType].indeterminate = false;

    // this.fileManagerService.activateFile(this.fileTypeMap[fileType].isActive, ids).subscribe({
    //   next: next => {
    //     console.log(next);
    //   },
    // });
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
