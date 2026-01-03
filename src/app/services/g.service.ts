import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { User } from '../models/models';

export type Lang = 'ja' | 'en' | 'zh';
export type Locale = 'ja-JP' | 'en-US' | 'zh-CN';
export type MultilingualPrompt = Record<Lang, string>;

@Injectable({
  providedIn: 'root'
})
export class GService {

  version = 'v20251222';
  appType: string = environment.appType;

  // ローディング中のHTTP通信数
  httpConnectCount: Subject<number> = new Subject<number>();

  globalEventHandlers: Subject<Event> = new Subject<Event>();

  invalidMimeTypes = [
    'application/octet-stream',
    'application/java-vm',
    'application/java-archive',
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

  lang!: Lang;
  locale!: Locale;

  orgKey: string;

  info: { user: User } = { user: {} as User };
  info$: Subject<{ user: User }> = new Subject<{ user: User }>();

  public queries: { [key: string]: string } = {};

  public isMobile = /iPhone|iPod|Android/i.test(navigator.userAgent);
  public isMobilePrefix = this.isMobile ? '/m/' : '/';

  // ① 完了キャッシュ：URL -> SVGテキスト
  public doneCache: { [url: string]: string } = {};
  // ② 進行中キャッシュ：URL -> 共有Observable（ロック）
  public inflight: { [url: string]: Observable<string> } = {};

  // 画面間遷移で大き目の情報受け渡したいとき用。
  share: any = {};

  constructor() {
    //クエリパラメータを取得
    location.search.slice(1).split('&').forEach((query) => {
      const [key, value] = query.split('=');
      this.queries[key] = value;
    });

    // 組織キー
    this.orgKey = this.queries['orgKey'] || environment.defaultOrgKey;

  }
}
