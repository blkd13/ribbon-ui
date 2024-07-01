import { Observable, forkJoin, of } from "rxjs";

export class DomUtils {
    static scrollToBottomIfNeeded(elem: HTMLElement): number {
        // 要素のスクロール可能な高さ
        const end = elem.scrollHeight - elem.clientHeight;

        // 現在のスクロール位置+20pxが要素の一番下でない場合、一番下までスクロール
        const d = (end - elem.scrollTop - 100);
            // console.log(`end=${end}, scrollTop=${elem.scrollTop}, d=${d}`);
        if (elem.scrollTop + 100 < end) {
            elem.scrollTop = end;
            return end - elem.scrollTop; // 移動量を返す
        } else {
            return 0;
        }
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
}

/**
 * forkJoinの引数が空の場合にforkJoinが全く起動しなくて扱いにくいので、空の場合はof([])を返すようにする。
 * @param observables 
 * @returns 
 */
export function safeForkJoin<T>(observables: Observable<T>[]): Observable<T[]> {
    return observables.length === 0 ? of([]) : forkJoin(observables);
}
