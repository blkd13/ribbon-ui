import { Component, inject, input, OnInit, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DocViewComponent } from '../doc-view/doc-view.component';
import { ContentPart } from '../../models/project-models';
import { ChatContent } from '../../services/chat.service';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FileGroupEntity } from '../../services/file-manager.service';

@Component({
  selector: 'app-doc-tag',
  imports: [MatIconModule, MatDialogModule, MatTooltipModule, CommonModule],
  templateUrl: './doc-tag.component.html',
  styleUrl: './doc-tag.component.scss'
})
export class DocTagComponent implements OnInit {

  readonly removable = input(true);

  readonly content = input.required<(ContentPart | ChatContent)>();

  readonly remove = output<ContentPart | ChatContent>();

  readonly dialog: MatDialog = inject(MatDialog);

  image = '';
  ngOnInit(): void {
    if (this.content().type === 'file') {
      const fileGroup = (this.content() as any).fileGroup as FileGroupEntity;
      if (fileGroup.type === 'upload') {
        // this.image = 'assets/images/file-upload.svg';
      } else {
        this.image = 'image/gitlab-logo.svg';
      }
    } else { }
  }

  open(): void {
    this.dialog.open<DocViewComponent>(DocViewComponent, { width: '80vw', data: { content: this.content() } });
  }

  onRemove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.remove.emit(this.content());
  }
}
