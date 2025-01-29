import { Component, inject, input, OnInit, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DocViewComponent } from '../doc-view/doc-view.component';
import { ContentPart } from '../../models/project-models';
import { ChatContent } from '../../services/chat.service';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FileGroupEntity } from '../../services/file-manager.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { getFileIcon, getFolderIcon } from '../../ext/vscode-material-icon-theme/core';


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

  getVSCodeFileIcon = getFileIcon;
  getVSCodeFolderIcon = getFolderIcon;

  image = '';
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
        } else {
          // this.image = 'assets/images/file-upload.svg';
        }
      } else {
        // this.image = 'assets/images/file-upload.svg';
      }
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
}
