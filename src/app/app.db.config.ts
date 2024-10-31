import { DBConfig } from "ngx-indexed-db";

export const dbConfig: DBConfig = {
    name: 'chat-ui',
    version: 1,
    objectStoresMeta: [{
        store: 'threadList',
        storeConfig: { keyPath: 'id', autoIncrement: true },
        storeSchema: [
            { name: 'title', keypath: 'title', options: { unique: false, multiEntry: false, index: true } },
            { name: 'timestamp', keypath: 'timestamp', options: { unique: false, multiEntry: false, index: true } },
            { name: 'description', keypath: 'description', options: { unique: false, multiEntry: false, index: false } },
            { name: 'body', keypath: 'body', options: { unique: false, multiEntry: false, index: false } },
        ]
    }]
};

export const dbConfig2: DBConfig = {
    name: 'chat-ui',
    version: 2,
    objectStoresMeta: [{
        store: 'threadList',
        storeConfig: { keyPath: 'id', autoIncrement: true },
        storeSchema: [
            { name: 'seq', keypath: 'seq', options: { unique: true, multiEntry: false, index: true } }, // 並び順
            { name: 'title', keypath: 'title', options: { unique: false, multiEntry: false, index: true } },
            { name: 'timestamp', keypath: 'timestamp', options: { unique: false, multiEntry: false, index: true } },
            { name: 'description', keypath: 'description', options: { unique: false, multiEntry: false, index: false } },
            { name: 'messageIdList', keypath: 'messageIdList', options: { unique: true, multiEntry: false, index: false } },
        ]
    }, {
        store: 'messageTitleList',
        storeConfig: { keyPath: 'id', autoIncrement: true },
        storeSchema: [
            { name: 'role', keypath: 'role', options: { unique: false, multiEntry: false, index: false } },
            { name: 'state', keypath: 'state', options: { unique: false, multiEntry: false, index: false } }, // メッセージ受信中かどうかとか。これはあんまり使わないかも。
            { name: 'isExpanded', keypath: 'isExpanded', options: { unique: false, multiEntry: false, index: false } }, // 広げるか閉じるか
            { name: 'isCached', keypath: 'isCached', options: { unique: false, multiEntry: false, index: false } }, // コンテキストキャッシュ化されているかどうか（ロックを掛ける必要があるので）
            { name: 'title', keypath: 'title', options: { unique: false, multiEntry: false, index: false } }, // エキスパンションを閉じたときのテキスト。bodyの頭300文字で良いと思う。
            { name: 'bodyId', keypath: 'bodyId', options: { unique: false, multiEntry: false, index: false } },
        ]
    }, {
        store: 'messageBodyList',
        storeConfig: { keyPath: 'id', autoIncrement: true },
        storeSchema: [
            { name: 'body', keypath: 'body', options: { unique: false, multiEntry: false, index: false } }, // デカいのでこれ単独のstoreにしておく。
        ]
    }]
};
