import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { Observable, Subscription, tap, catchError, throwError } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';
import { saveAs } from 'file-saver';

import { FileManagerService, FullPathFile } from '../../../../services/file-manager.service';
import { MessageService } from '../../../../services/core/message.service';
import { Utils } from '../../../../utils';
import { Project, ContentPart } from '../../../../models/project-models';
import { ChatInputArea } from '../../../../services/chat.service';

@Component({
  selector: 'app-file-management',
  template: `<!-- Template will be extracted from main component -->`,
  standalone: true
})
export class FileManagementComponent {
  @Input() selectedProject!: Project;
  @Input() inputArea!: ChatInputArea;
  @Input() isLock = false;
  @Input() tokenCounting = false;

  @Output() filesDropped = new EventEmitter<FullPathFile[]>();
  @Output() fileUploadCompleted = new EventEmitter<void>();
  @Output() fileUploadError = new EventEmitter<Error>();
  @Output() lockStateChanged = new EventEmitter<boolean>();
  @Output() tokenCountingChanged = new EventEmitter<boolean>();
  @Output() inputAreaChanged = new EventEmitter<ChatInputArea>();

  readonly fileManagerService = inject(FileManagerService);
  readonly messageService = inject(MessageService);
  readonly snackBar = inject(MatSnackBar);

  /**
   * ファイルドロップ処理
   */
  onFilesDropped(files: FullPathFile[]): Subscription {
    // 複数ファイルを纏めて追加したときは全部読み込み終わってからカウントする
    this.tokenCounting = true;
    this.tokenCountingChanged.emit(true);
    
    this.isLock = true;
    this.lockStateChanged.emit(true);

    const label = this.generateFileLabel(files);
    
    // ファイル用のコンテンツアイテムを作成
    const file: any = {
      type: 'file',
      fileGroupId: '',
      linkId: '',
      text: label,
      isLoading: true
    };
    
    this.inputArea.content.push(file);
    this.inputAreaChanged.emit(this.inputArea);

    return this.fileManagerService
      .uploadFiles({
        uploadType: 'Group',
        projectId: this.selectedProject.id,
        contents: files.map(f => ({
          filePath: f.fullPath,
          base64Data: f.base64String,
        }))
      })
      .pipe(
        tap(result => {
          result.results.forEach(fileGroupEntity => {
            file.fileGroupId = fileGroupEntity.id;
            file.linkId = file.fileGroupId;
            file.isLoading = false;
          });

          this.fileUploadCompleted.emit();
          this.isLock = false;
          this.lockStateChanged.emit(false);
        }),
        catchError(error => {
          this.snackBar.open(`アップロードエラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
          this.fileUploadError.emit(error);
          this.isLock = false;
          this.lockStateChanged.emit(false);
          return throwError(() => error);
        })
      )
      .subscribe();
  }

  /**
   * ファイル選択ダイアログからのファイル選択処理
   */
  onFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const items = target.files;
    
    if (items) {
      this.fileManagerService.onFileOrFolderMultipleForInputTag(items as any)
        .then((files: FullPathFile[]) => {
          this.onFilesDropped(files);
        })
        .catch(error => {
          this.snackBar.open(`ファイル処理エラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
          this.fileUploadError.emit(error);
        });
    }
  }

  /**
   * ファイル選択ダイアログを開く
   */
  openFileDialog(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  /**
   * コンテンツのダウンロード
   */
  downloadContents(threadGroupId: string): Observable<void> {
    return this.messageService.downloadContent(threadGroupId).pipe(
      tap(zip => {
        // ZIPファイルを生成し、ダウンロードする
        zip.generateAsync({ type: 'blob' }).then(content => {
          // Blobを利用してファイルをダウンロード
          saveAs(content, `ribbon-${Utils.formatDate(new Date(), 'yyyyMMddHHmmssSSS')}.zip`);
        });
      }),
      catchError(error => {
        this.snackBar.open(error, 'close', { duration: 1000 });
        return throwError(() => error);
      })
    );
  }

  /**
   * コンテンツパーツの削除
   */
  removeContent(content: ContentPart): Observable<void> {
    return this.messageService.deleteContentPart(content.id).pipe(
      tap(() => {
        // メッセージからコンテンツを削除
        const message = this.messageService.messageMas[content.messageId];
        if (message && message.contents) {
          const index = message.contents.indexOf(content);
          if (index >= 0) {
            message.contents.splice(index, 1);
          }
        }
      }),
      catchError(error => {
        this.snackBar.open(`削除エラーです\n${JSON.stringify(error)}`, 'close', { duration: 30000 });
        return throwError(() => error);
      })
    );
  }

  /**
   * 入力エリアからコンテンツを削除
   */
  removeFromInputArea(index: number): void {
    if (index >= 0 && index < this.inputArea.content.length) {
      this.inputArea.content.splice(index, 1);
      this.inputAreaChanged.emit(this.inputArea);
    }
  }

  /**
   * アップロード中のファイルがあるかチェック
   */
  hasUploadingFiles(): boolean {
    return this.inputArea.content.some(content => 
      content.type === 'file' && (content as any).isLoading
    );
  }

  /**
   * ファイルタイプのコンテンツがあるかチェック
   */
  hasFileContent(): boolean {
    return this.inputArea.content.some(content => content.type === 'file');
  }

  /**
   * ファイルコンテンツのサイズを取得
   */
  getFileContentSize(): number {
    return this.inputArea.content.filter(content => content.type === 'file').length;
  }

  /**
   * ファイル形式の検証
   */
  validateFileFormat(file: File): { valid: boolean; message?: string } {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/csv',
      'application/json', 'application/xml',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        message: `サポートされていないファイル形式です: ${file.type}`
      };
    }

    // ファイルサイズの制限（例: 50MB）
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return {
        valid: false,
        message: `ファイルサイズが大きすぎます。最大50MBまでです。`
      };
    }

    return { valid: true };
  }

  /**
   * ドラッグ&ドロップのファイル検証
   */
  validateDroppedFiles(files: FullPathFile[]): { valid: boolean; message?: string } {
    const maxFiles = 10; // 最大ファイル数
    
    if (files.length > maxFiles) {
      return {
        valid: false,
        message: `一度にアップロードできるファイル数は${maxFiles}個までです。`
      };
    }

    // 各ファイルの検証（FullPathFileからFileオブジェクトを復元する必要がある場合）
    // for (const file of files) {
    //   const validation = this.validateFileFormat(file as any);
    //   if (!validation.valid) {
    //     return validation;
    //   }
    // }

    return { valid: true };
  }

  /**
   * ファイルのプレビュー情報を取得
   */
  getFilePreview(content: any): { type: string; preview?: string } {
    if (content.type !== 'file') {
      return { type: 'unknown' };
    }

    const fileName = content.text || '';
    const extension = fileName.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return { type: 'image', preview: content.linkId };
      case 'pdf':
        return { type: 'pdf' };
      case 'txt':
      case 'csv':
        return { type: 'text' };
      case 'json':
        return { type: 'json' };
      case 'xml':
        return { type: 'xml' };
      case 'xls':
      case 'xlsx':
        return { type: 'excel' };
      default:
        return { type: 'file' };
    }
  }

  private generateFileLabel(files: FullPathFile[]): string {
    if (files.length === 1) {
      return files[0].fullPath;
    } else {
      const file = files.find(f => f.fullPath.includes('/'));
      if (file) {
        // フォルダが含まれる場合はフォルダ名を表示
        return `${file.fullPath.split('/')[0]}/`;
      } else {
        return `${files.length} files`;
      }
    }
  }

  /**
   * 入力エリアのクリア
   */
  clearInputArea(): void {
    this.inputArea.content = [{ type: 'text', text: '' }];
    this.inputAreaChanged.emit(this.inputArea);
  }

  /**
   * ファイルアップロードの進行状況を取得
   */
  getUploadProgress(): { total: number; completed: number; percentage: number } {
    const fileContents = this.inputArea.content.filter(content => content.type === 'file');
    const total = fileContents.length;
    const completed = fileContents.filter(content => !(content as any).isLoading).length;
    const percentage = total > 0 ? (completed / total) * 100 : 0;

    return { total, completed, percentage };
  }
}