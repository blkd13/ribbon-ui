import { Directive, HostListener, input, output } from '@angular/core';

@Directive({
  selector: '[appDragDelta]',
  standalone: true
})
export class DragDeltaDirective {

  readonly appDragDelta = input.required<HTMLElement>();

  readonly position = input<'left' | 'right' | 'top' | 'bottom'>('right');

  readonly dragging = output<{
    x: number;
    y: number;
  }>();
  startX = 0;
  startY = 0;
  startW = 0;
  startH = 0;
  draggingActive = false;

  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    const appDragDelta = this.appDragDelta();
    if (appDragDelta) {
      this.draggingActive = true;

      // 開始位置を記録
      this.startX = event.clientX;
      this.startY = event.clientY;

      // 開始時のサイズを記録
      this.startW = appDragDelta.clientWidth;
      this.startH = appDragDelta.clientHeight;

      event.stopImmediatePropagation();
      event.preventDefault(); // 不要な選択動作を防止
    } else {
      // ターゲットがいないときは完全無視
    }
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.draggingActive) {
      const position = this.position();
      const sign = position === 'right' || position === 'bottom' ? 1 : -1;
      const deltaX = (event.clientX - this.startX) * sign;
      const deltaY = (event.clientY - this.startY) * sign;
      const appDragDelta = this.appDragDelta();
      const positionValue = this.position();
      if (positionValue === 'left' || positionValue === 'right') {
        appDragDelta.style.width = `${(this.startW + deltaX).toFixed(1)}px`;
      } else if (positionValue === 'top' || positionValue === 'bottom') {
        appDragDelta.style.height = `${(this.startH + deltaY).toFixed(1)}px`;
      }
      console.log(`${appDragDelta.style.width}`);
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
