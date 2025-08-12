import { Directive, HostBinding, HostListener, inject, output } from '@angular/core';
import { FileManagerService, FullPathFile } from '../services/file-manager.service';
import { LoggerService } from '../services/logger';

@Directive({
  selector: '[appFileDrop]',
  standalone: true
})
export class FileDropDirective {

  readonly fileManagerService: FileManagerService = inject(FileManagerService);
  readonly logger = inject(LoggerService);

  readonly filesDropped = output<FullPathFile[]>();
  readonly filesHovered = output<boolean>();

  @HostBinding('class.hovered') public isHovered = false;

  @HostListener('dragover', ['$event']) onDragOver(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    this.filesHovered.emit(true);
    this.isHovered = true;
  }

  @HostListener('dragend', ['$event']) onDragEnd(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    this.filesHovered.emit(false);
    this.isHovered = false;
  }

  @HostListener('drop', ['$event']) async onDrop(evt: DragEvent) {
    evt.preventDefault();
    evt.stopPropagation();
    this.filesHovered.emit(false);
    this.isHovered = false;

    const items = evt.dataTransfer?.items;
    if (!items) return;

    const fileItems = [];
    for (let i = 0; i < items.length; i++) {
      this.logger.debug(`Item ${i}: kind=${items[i].kind}, type=${items[i].type}`);
      if (items[i].kind === 'string' && (items[i].type === 'text/plain' || items[i].type === 'text/html')) {
        // テキストファイルは無視する。
      } else {
        fileItems.push(items[i]);
      }
    }
    if (fileItems.length === 0) return;

    this.fileManagerService.onFileOrFolderMultipleForDragAndDrop(fileItems).then(files => {
      this.filesDropped.emit(files);
    });
  }

  @HostListener('paste', ['$event']) async onPaste($event: ClipboardEvent) {
    if ($event.clipboardData) {
      const items = $event.clipboardData.items;
      const itemsOnlyFile = [];
      const fileList = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          itemsOnlyFile.push(items[i]);
          fileList.push(items[i].getAsFile());
        } else { }
      }
      if (itemsOnlyFile.length === fileList.length && fileList.length > 0) {
        // ファイルがペーストされた場合はDrag＆Dropとして扱う。
        // this.onFilesDropped(fileList);
        this.fileManagerService
          .onFileOrFolderMultipleForDragAndDrop(itemsOnlyFile)
          .then(files => this.filesDropped.emit(files));
        this.stopPropagation($event);
      } else { }
    } else { }
  }

  onFilesDropped(fileList: FullPathFile[]) {
    this.filesDropped.emit(fileList);
  }

  /** イベント伝播しないように止める */
  stopPropagation($event: Event): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
  }
}
