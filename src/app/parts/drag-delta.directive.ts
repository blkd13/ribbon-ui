import { Directive, HostListener, Input, Output, EventEmitter } from '@angular/core';

@Directive({
  selector: '[appDragDelta]',
  standalone: true
})
export class DragDeltaDirective {

  @Input()
  appDragDelta!: HTMLElement;

  @Input()
  position: 'left' | 'right' | 'top' | 'bottom' = 'right';

  @Output() dragging = new EventEmitter<{ x: number; y: number }>();
  startX = 0;
  startY = 0;
  startW = 0;
  startH = 0;
  draggingActive = false;

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    if (this.appDragDelta) {
      this.draggingActive = true;

      // 開始位置を記録
      this.startX = event.clientX;
      this.startY = event.clientY;

      // 開始時のサイズを記録
      this.startW = this.appDragDelta.clientWidth;
      this.startH = this.appDragDelta.clientHeight;

      event.stopImmediatePropagation();
      event.preventDefault(); // 不要な選択動作を防止
    } else {
      // ターゲットがいないときは完全無視
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.draggingActive) {
      const sign = this.position === 'right' || this.position === 'bottom' ? 1 : -1;
      const deltaX = (event.clientX - this.startX) * sign;
      const deltaY = (event.clientY - this.startY) * sign;
      if (this.position === 'left' || this.position === 'right') {
        this.appDragDelta.style.width = `${(this.startW + deltaX).toFixed(1)}px`;
      } else if (this.position === 'top' || this.position === 'bottom') {
        this.appDragDelta.style.height = `${(this.startH + deltaY).toFixed(1)}px`;
      }
      console.log(`${this.appDragDelta.style.width}`);
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
