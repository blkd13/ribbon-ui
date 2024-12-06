import { Pipe, PipeTransform } from '@angular/core';
import { Utils } from '../utils';

@Pipe({
  name: 'relativeTime',
  standalone: true
})
export class RelativeTimePipe implements PipeTransform {

  transform(_value: Date): string {
    const value = Utils.toDateIfValid(_value);

    if (!value) {
      // dateじゃなかったら空文字を返却
      return '';
    } else { /** 継続 */ }

    const now = new Date();
    const seconds = Math.floor((now.getTime() - value.getTime()) / 1000);
    const rtf = new Intl.RelativeTimeFormat('ja');

    if (seconds < 60) {
      return rtf.format(-seconds, 'second'); // "数秒前"
    } else if (seconds < 3600) {
      return rtf.format(-Math.floor(seconds / 60), 'minute'); // "数分前"
    } else if (seconds < 86400) {
      return rtf.format(-Math.floor(seconds / 3600), 'hour'); // "数時間前"
    } else if (seconds < 604800) { // 1週間以内
      return rtf.format(-Math.floor(seconds / 86400), 'day'); // "数日前"
    } else {
      return value.toLocaleDateString(); // 具体的な日付を表示
    }
  }
}
