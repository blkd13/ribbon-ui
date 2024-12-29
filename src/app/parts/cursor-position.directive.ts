// cursor-position.directive.ts
import { Directive, ElementRef, HostListener, Renderer2, output } from '@angular/core';

@Directive({
  selector: '[appCursorPosition]',
  standalone: true,
})
export class CursorPositionDirective {
  readonly cursorPositionChange = output<{
    x: number;
    y: number;
}>();
  private mirror: HTMLElement | null = null;
  cursorX: number = 0;
  cursorY: number = 0;

  constructor(private el: ElementRef, private renderer: Renderer2) {
    this.createMirrorElement();
  }

  private createMirrorElement() {
    const textarea = this.el.nativeElement;
    this.mirror = document.createElement('div');

    // CSSの複製
    const computed = window.getComputedStyle(textarea);
    this.mirror.style.fontSize = computed.fontSize;
    this.mirror.style.fontFamily = computed.fontFamily;
    this.mirror.style.lineHeight = computed.lineHeight;
    this.mirror.style.padding = computed.padding;
    this.mirror.style.width = computed.width;
    this.mirror.style.height = computed.height;
    this.mirror.style.border = computed.border;
    this.mirror.style.whiteSpace = 'pre-wrap';
    this.mirror.style.wordWrap = 'break-word';
    this.mirror.style.position = 'absolute';
    this.mirror.style.visibility = 'hidden';
    this.mirror.style.left = '0';
    this.mirror.style.top = '0';

    document.body.appendChild(this.mirror);
  }

  @HostListener('input') onTextInput() {
    this.updateCursorPosition();
  }

  // @HostListener('click') onClick() {
  //   this.updateCursorPosition();
  // }

  private updateCursorPosition() {
    if (!this.mirror) return;

    const textarea = this.el.nativeElement;

    // テキストのコピーとカーソル位置のマーカー追加
    const textValue = textarea.value.substring(0, textarea.selectionStart);
    this.mirror.textContent = textValue;
    const span = document.createElement('span');
    span.textContent = '|'; // マーカーの代わり
    this.mirror.appendChild(span);

    // textareaとマーカーの位置を取得
    const rect = textarea.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();

    this.cursorX = rect.left + (spanRect.left - this.mirror.getBoundingClientRect().left);
    this.cursorY = rect.top + (spanRect.top - this.mirror.getBoundingClientRect().top);

    // 座標の通知
    this.cursorPositionChange.emit({ x: this.cursorX, y: this.cursorY });

    // マーカーを削除
    this.mirror.removeChild(span);
  }
}

