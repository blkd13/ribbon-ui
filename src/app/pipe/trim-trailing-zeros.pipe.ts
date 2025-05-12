import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'trimTrailingZeros',
})
export class TrimTrailingZerosPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    return value
      .replace(/(\.\d*?[1-9])0+$/g, '$1')  // 小数点以下に非ゼロがある場合の末尾ゼロ削除
      .replace(/\.0+$/, '')                // 全て0の場合小数点ごと削除
      .replace(/^(-?\d+)\.0*$/, '$1');     // '15.0000' → '15'
  }
}
