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
