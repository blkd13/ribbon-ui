import { CommonModule } from '@angular/common';
import { Component, inject, input, OnInit, output } from '@angular/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { getFileIcon, getFolderIcon } from '../../ext/vscode-material-icon-theme/core';
import { ContentPart } from '../../models/project-models';
import { ChatContent } from '../../services/chat.service';
import { FileGroupEntity, FileManagerService } from '../../services/file-manager.service';
import { DocViewComponent } from '../doc-view/doc-view.component';


@Component({
  selector: 'app-doc-tag',
  imports: [CommonModule, MatIconModule, MatDialogModule, MatTooltipModule, MatProgressSpinnerModule],
  templateUrl: './doc-tag.component.html',
  styleUrl: './doc-tag.component.scss'
})
export class DocTagComponent implements OnInit {

  readonly removable = input(true);

  readonly content = input.required<(ContentPart | ChatContent) & { isLoading?: boolean }>();

  readonly remove = output<ContentPart | ChatContent>();

  readonly updated = output<boolean>();

  readonly dialog: MatDialog = inject(MatDialog);

  readonly fileManagerService = inject(FileManagerService);

  getVSCodeFileIcon = getFileIcon;
  getVSCodeFolderIcon = getFolderIcon;

  image = '';
  type = '';
  fgType = '';
  ngOnInit(): void {
    if (this.content().type === 'file') {
      const fileGroup = (this.content() as any).fileGroup as FileGroupEntity;
      // console.log(this.content());
      if (fileGroup) {
        if (fileGroup.type === 'gitlab') {
          this.image = 'image/gitlab-logo.svg';
          this.image = `vsc-material-icons/icons/folder-${fileGroup.type}.svg`;
        } else if (fileGroup.type === 'gitea') {
          this.image = 'image/gitea-logo.svg';
          this.image = `vsc-material-icons/icons/folder-${fileGroup.type}.svg`;
        } else if (!fileGroup.label.includes('/') && fileGroup.label.includes('.') && (fileGroup.type === 'ai' || fileGroup.type === 'upload')) {
          this.fgType = fileGroup.type;
          const trg = fileGroup.label.split('.').pop()?.toLowerCase();
          if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'].includes(trg || '')) {
            this.fileManagerService.getFileGroup(fileGroup.id).subscribe({
              next: next => {
                this.fileManagerService.downloadFile(next.files[0].id).subscribe({
                  next: base64String => {
                    this.type = 'image';
                    const blob = this.dataURLtoBlob(base64String);
                    this.image = URL.createObjectURL(blob);
                  },
                  error: err => {
                    // this.image = 'assets/images/file-upload.svg';
                  },
                });
              },
            });
          }
        } else {
          // this.image = 'assets/images/file-upload.svg';
        }
      } else {
        // this.image = 'assets/images/file-upload.svg';
      }
    } else if (this.content().type === 'base64') {
      this.type = 'image';
      const blob = this.dataURLtoBlob(this.content().text || '');
      this.image = URL.createObjectURL(blob);
      this.fgType = 'ai';
    } else { }
  }

  format(name?: string): string | undefined {
    if (name && name.endsWith('/')) {
      return name.substring(0, name.length - 1);
    } else {
      return name;
    }
  }

  open(): void {
    this.dialog.open<DocViewComponent>(DocViewComponent, { width: '80vw', data: { content: this.content() } }).afterClosed().subscribe({
      next: next => {
        this.updated.emit(true);
      }
    });
  }

  onRemove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.remove.emit(this.content());
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
