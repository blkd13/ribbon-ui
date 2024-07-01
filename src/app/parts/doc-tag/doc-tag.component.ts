import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChatCompletionContentPart, ChatCompletionContentPartImage } from '../../models/models';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { DocViewComponent } from '../doc-view/doc-view.component';

@Component({
  selector: 'app-doc-tag',
  standalone: true,
  imports: [MatIconModule, MatDialogModule],
  templateUrl: './doc-tag.component.html',
  styleUrl: './doc-tag.component.scss'
})
export class DocTagComponent {

  @Input()
  content!: ChatCompletionContentPartImage;

  @Output()
  remove: EventEmitter<ChatCompletionContentPartImage> = new EventEmitter();

  constructor(
    private dialog: MatDialog,
  ) {
  }

  open(): void {
    this.dialog.open<DocViewComponent>(DocViewComponent, { width: '80vw', data: { content: this.content } });
  }

  onRemove($event: MouseEvent): void {
    $event.stopImmediatePropagation();
    $event.preventDefault();
    this.remove.emit(this.content);
  }
}
