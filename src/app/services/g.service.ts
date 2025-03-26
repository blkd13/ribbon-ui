import { Injectable } from '@angular/core';
import { User } from '../models/models';
import { Subject } from 'rxjs';

export type Lang = 'ja' | 'en';
export type MultilingualPrompt = Record<Lang, string>;

@Injectable({
  providedIn: 'root'
})
export class GService {

  version = 'v20250326';

  // ローディング中のHTTP通信数
  httpConnectCount: Subject<number> = new Subject<number>();

  autoRedirectToLoginPageIfAuthError: boolean = true;

  globalEventHandlers: Subject<Event> = new Subject<Event>();

  invalidMimeTypes = [
    'application/octet-stream',
    'application/java-vm',
    'application/x-elf',
    'application/x-msdownload',
    'application/gzip',
    'application/zip',
    "application/zstd",
    "application/x-gzip",
    "application/x-tar",
    "application/x-bzip2",
    "application/x-xz",
    "application/x-rar-compressed",
    'application/x-7z-compressed',
    "application/x-compress",
    'application/font-woff',
    'application/vnd.ms-fontobject',
    'font/woff',
    'font/woff2',
    'font/ttf',
    'font/otf',
    'font/eot',
    'font/collection',
    'application/x-font-ttf',
    'application/x-font-otf',
    'application/x-font-woff',
    'font/sfnt',
    'image/x-icon',
    'application/x-ms-application',
    'application/x-pkcs12',
    'application/pkix-cert',
  ];

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
