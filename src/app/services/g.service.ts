import { Injectable } from '@angular/core';
import { User } from '../models/models';
import { Subject } from 'rxjs';

export type Lang = 'ja' | 'en';
export type MultilingualPrompt = Record<Lang, string>;

@Injectable({
  providedIn: 'root'
})
export class GService {

  version = 'v20241212-1';

  // ローディング中のHTTP通信数
  httpConnectCount: Subject<number> = new Subject<number>();

  autoRedirectToLoginPageIfAuthError: boolean = true;

  globalEventHandlers: Subject<Event> = new Subject<Event>();

  lang: Lang;

  info: { user: User } = { user: {} as User };
  public queries: { [key: string]: string } = {};

  // 画面間遷移で大き目の情報受け渡したいとき用。
  share: any = {};

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
