// inline-svg.directive.ts
import { HttpClient } from '@angular/common/http';
import {
  Directive, ElementRef, inject, Input, OnChanges, OnDestroy, OnInit, Renderer2, SimpleChanges
} from '@angular/core';
import { Subject } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs/operators';
import { GService } from '../services/g.service';

@Directive({
  selector: 'img[appInlineSvg], [appInlineSvg][src]'
})
export class InlineSvgDirective implements OnInit, OnChanges, OnDestroy {
  @Input() src!: string;
  @Input() stripFill = false;
  @Input() addClass = '';

  private readonly g: GService = inject(GService);

  private destroy$ = new Subject<void>();

  constructor(
    private el: ElementRef<HTMLElement>,
    private http: HttpClient,
    private renderer: Renderer2
  ) { }

  ngOnInit() {
    if (!this.src) {
      const attr = (this.el.nativeElement as HTMLImageElement).getAttribute('src');
      if (attr) this.src = attr;
    }
    this.inline();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['src'] && !changes['src'].firstChange) {
      this.inline();
    }
  }

  private inline() {
    if (!this.src) return;

    // console.log('InlineSvgDirective: fetching.doneCache', Object.keys(this.g.doneCache));
    // console.log('InlineSvgDirective: fetching.inflight', Object.keys(this.g.inflight));
    // 1) 完了キャッシュ命中 → 即置換
    const hit = this.g.doneCache[this.src];
    if (hit) {
      this.replaceWithSvg(hit);
      return;
    }

    // 2) 進行中キャッシュ命中 → ぶら下がるだけ（合流）
    const inflight$ = this.g.inflight[this.src];
    if (inflight$) {
      inflight$.subscribe({
        next: (text) => this.replaceWithSvg(text),
        error: () => {/* 失敗してもDOMは<IMG>のまま */ },
      });
      return;
    }

    // 3) 新規取得を開始し、開始時点で "進行中" を登録（＝ロック）
    const req$ = this.http.get(this.src, { responseType: 'text' }).pipe(
      tap((text) => {
        // 成功したら完了キャッシュへ
        this.g.doneCache[this.src] = text;
      }),
      finalize(() => {
        // 完了/失敗にかかわらずロック解除
        delete this.g.inflight[this.src];
      }),
      // 同時購読を1発のHTTPに合流させる
      shareReplay(1)
    );

    this.g.inflight[this.src] = req$;
    // console.log('InlineSvgDirective: fetching.inflight', Object.keys(this.g.inflight));

    req$.subscribe({
      next: (text) => this.replaceWithSvg(text),
      error: (err) => {
        console.warn('InlineSvgDirective: fetch failed', this.src, err);
      }
    });
  }

  private replaceWithSvg(svgText: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    let svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    // fill/stroke を削ってCSS制御しやすく（任意）
    if (this.stripFill) {
      svgEl.querySelectorAll('[fill]').forEach(n => n.removeAttribute('fill'));
      svgEl.querySelectorAll('[stroke]').forEach(n => n.removeAttribute('stroke'));
      svgEl.removeAttribute('fill');
      svgEl.removeAttribute('stroke');
    }

    // <img> の属性を引き継ぐ
    const img = this.el.nativeElement as HTMLImageElement;

    if (img.id) svgEl.setAttribute('id', img.id);

    const cls = (img.getAttribute('class') || '');
    const extra = this.addClass ? ` ${this.addClass}` : '';
    const mergedClass = `${cls}${extra}`.trim();
    if (mergedClass) svgEl.setAttribute('class', mergedClass);

    const styleAttr = img.getAttribute('style');
    if (styleAttr) svgEl.setAttribute('style', styleAttr);

    const width = img.getAttribute('width');
    const height = img.getAttribute('height');
    if (width) svgEl.setAttribute('width', width);
    if (height) svgEl.setAttribute('height', height);

    const alt = img.getAttribute('alt');
    if (alt) {
      svgEl.setAttribute('aria-label', alt);
    } else {
      svgEl.setAttribute('aria-hidden', 'true');
    }
    svgEl.setAttribute('focusable', 'false');

    // 差し替え
    const wrap = this.renderer.createElement('div');
    wrap.innerHTML = svgEl.outerHTML;
    const realSvg = wrap.firstElementChild as SVGElement;
    this.renderer.insertBefore(img.parentNode, realSvg, img);
    this.renderer.removeChild(img.parentNode, img);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
