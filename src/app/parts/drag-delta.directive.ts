import { Directive, HostListener, Output, EventEmitter } from '@angular/core';

@Directive({
  selector: '[appDragDelta]',
  standalone: true
})
export class DragDeltaDirective {

  @Output() dragging = new EventEmitter<{ x: number; y: number }>();
  private startX = 0;
  private startY = 0;
  private draggingActive = false;

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    this.draggingActive = true;
    // 開始位置を記録
    this.startX = event.clientX;
    this.startY = event.clientY;
    event.stopImmediatePropagation();
    event.preventDefault(); // 不要な選択動作を防止
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.draggingActive) {
      const deltaX = event.clientX - this.startX;
      const deltaY = event.clientY - this.startY;
      // 差分をEmitterで配信
      this.dragging.emit({ x: deltaX, y: deltaY });
      // console.log({ x: deltaX, y: deltaY });
    } else { }
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.draggingActive = false;
  }
}
