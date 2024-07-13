import { Injectable } from '@angular/core';
import { User } from '../models/models';
import { Subject } from 'rxjs';

export type Lang = 'ja' | 'en';
export type MultilingualPrompt = Record<Lang, string>;

@Injectable({
  providedIn: 'root'
})
export class GService {

  // ローディング中のHTTP通信数
  httpConnectCount: Subject<number> = new Subject<number>();

  globalEventHandlers: Subject<Event> = new Subject<Event>();

  lang: Lang;

  info: { user: User } = { user: {} as User };
  public queries: { [key: string]: string } = {};
  constructor() {
    //クエリパラメータを取得
    location.search.slice(1).split('&').forEach((query) => {
      const [key, value] = query.split('=');
      this.queries[key] = value;
    });

    // 言語設定
    this.lang = this.queries['lang'] === 'en' ? 'en' : 'ja';
  }
}

export class Info {

}
