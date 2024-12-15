import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DocViewComponent } from '../doc-view/doc-view.component';
import { ContentPart } from '../../models/project-models';
import { ChatContent } from '../../services/chat.service';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-doc-tag',
  standalone: true,
  imports: [MatIconModule, MatDialogModule, MatTooltipModule, CommonModule],
  templateUrl: './doc-tag.component.html',
  styleUrl: './doc-tag.component.scss'
})
export class DocTagComponent {

  @Input()
  content!: (ContentPart | ChatContent);

  @Output()
  remove: EventEmitter<ContentPart | ChatContent> = new EventEmitter();

  readonly dialog: MatDialog = inject(MatDialog);

  open(): void {
    this.dialog.open<DocViewComponent>(DocViewComponent, { width: '80vw', data: { content: this.content } });
  }

  onRemove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.remove.emit(this.content);
  }
}
