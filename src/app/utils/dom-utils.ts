import { Observable, concat, concatMap, forkJoin, from, of, toArray } from "rxjs";

export class DomUtils {
    static scrollToBottomIfNeeded(elem: HTMLElement): number {
        // 要素のスクロール可能な高さ（全体の高さ - ビューの高さ）
        const end = elem.scrollHeight - elem.clientHeight;

        // 現在のスクロール位置から下端までの距離
        const distanceToBottom = end - elem.scrollTop;

        // 下端から100px以内にいる場合のみ、スクロールを行う
        // // console.log(`distanceToBottom = ${distanceToBottom} = ${end} - ${elem.scrollTop}`);
        // if (distanceToBottom <= 300) {
        //     elem.scrollTop = end;
        //     return end - elem.scrollTop; // 実際に移動した量を返す
        // } else {
        //     console.log('skipped');
        //     return 0; // 移動しなかった場合は0を返す
        // }
        return 0;
    }

    static scrollToBottomIfNeededSmooth(elem: HTMLElement): void {
        // 要素のスクロール可能な高さ
        const scrollHeight = elem.scrollHeight;
        const clientHeight = elem.clientHeight;
        const scrollTop = elem.scrollTop;

        // スクロールが必要かどうかを判断するしきい値（ピクセル単位）
        const threshold = 0;

        console.log(`${scrollTop + clientHeight + threshold < scrollHeight}:scrollHeight=${scrollHeight}, clientHeight=${clientHeight}, scrollTop=${scrollTop}, LEFT=${scrollTop + clientHeight + threshold} RIGHT=${scrollHeight}`);
        // 現在のスクロール位置+閾値が要素の一番下でない場合、スムーススクロールを実行
        if (scrollTop + clientHeight + threshold < scrollHeight) {
            elem.scrollTo({
                top: scrollHeight - clientHeight,
                behavior: 'smooth',
            });
        }
    }

    // スクロールの進行状況を監視するためのメソッド
    static monitorScrollProgress(elem: HTMLElement, onComplete: () => void): void {
        let lastScrollTop = elem.scrollTop;
        const checkScroll = () => {
            if (elem.scrollTop !== lastScrollTop) {
                lastScrollTop = elem.scrollTop;
                requestAnimationFrame(checkScroll);
            } else {
                onComplete();
            }
        };
        requestAnimationFrame(checkScroll);
    }

    static scrollToRightIfNeeded(elem: HTMLElement): number {
        // 要素のスクロール可能な高さと現在のスクロール位置
        const end = elem.scrollWidth - elem.clientWidth;

        // 現在のスクロール位置+20pxが要素の一番下でない場合、一番下までスクロール
        if (elem.scrollLeft + 100 > end) {
            elem.scrollLeft = end;
            return end - elem.scrollLeft; // 移動量を返す
        } else {
            return 0;
        }
    }

    static scrollToTopIfNeeded(elem: HTMLElement): number {
        // 要素のスクロール可能な高さと現在のスクロール位置
        const end = elem.scrollHeight - elem.clientHeight;

        // 現在のスクロール位置+20pxが要素の一番下でない場合、一番下までスクロール
        if (elem.scrollTop > 100) {
            elem.scrollTop = 0;
            return elem.scrollTop; // 移動量を返す
        } else {
            return 0;
        }
    }

    static copyToClipboard(text: string): void {
        const textArea = document.createElement("textarea");
        textArea.style.cssText = "position:absolute;left:-100%";
        document.body.appendChild(textArea);
        textArea.value = text;
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
    }

    /**
     * 入力ボックスの高さを合わせる。
     */
    static textAreaHeighAdjust(textAreaElem: HTMLTextAreaElement, textAreaHeighAdjustInDto: TextAreaHeighAdjustInDto = { padding: 20, lineHeight: 26, minLineCount: 2 }): void {
        const lineCount = textAreaElem.value.split('\n').length;
        const lineHeight = textAreaHeighAdjustInDto.lineHeight || 26;
        const minLineCount = textAreaHeighAdjustInDto.minLineCount || 2;
        const padding = textAreaHeighAdjustInDto.padding || 20;
        textAreaElem.style.height = `${Math.min(15, Math.max(minLineCount, lineCount)) * lineHeight + padding}px`;
    }
}
export type TextAreaHeighAdjustInDto = { padding: number, lineHeight: number, minLineCount: number };

/**
 * forkJoinの引数が空の場合にforkJoinが全く起動しなくて扱いにくいので、空の場合はof([])を返すようにする。
 * @param observables 
 * @returns 
 */
export function safeForkJoin<T>(observables: Observable<T>[]): Observable<T[]> {
    return observables.length === 0 ? of([]) : forkJoin(observables);
}
