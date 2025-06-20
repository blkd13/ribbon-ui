/**
 * Utilsクラスは、共通のユーティリティメソッドを提供するためのクラスです。
 */
export class Utils {

    /**
     * 文字列を kebab-case ケースに変換する関数
     * @param str - ケース変換する文字列
     * @returns kebab-case ケースに変換された文字列
     */
    static toKebabCase(str: string): string {
        return Utils.toCamelCase(str).replace(/[A-Z]/g, match => `-${match.toLowerCase()}`).replace(/^-/g, '');
    }

    /**
     * 文字列を snake_case に変換する関数
     * @param str - ケース変換する文字列
     * @returns snake_case に変換された文字列
     */
    static toSnakeCase(str: string): string {
        return Utils.toKebabCase(str).replace(/-/g, '_');
    }

    /**
     * 文字列を camelCase に変換する関数
     * @param str - ケース変換する文字列
     * @returns camelCase ケースに変換された文字列
     */
    static toCamelCase(str: string): string {
        return Utils.toAscii(str, true);
    }

    /**
     * 文字列を PascalCase ケースに変換する関数
     * @param str - ケース変換する文字列
     * @returns PascalCase に変換された文字列
     */
    static toPascalCase(str: string): string {
        return Utils.toAscii(str, false);
    }

    /**
     * 文字列を ASCII に変換する関数
     * @param str - ケース変換する文字列
     * @param isCamel - CamelCaseに変換するかどうか
     * @returns ASCII に変換された文字列
     * @private
     */
    private static toAscii(str: string, isCamel: boolean = true): string {
        if (!str) return str;
        // 空白やアンダースコアを区切り文字として分割します
        const words = str.split(/[-\s_]+/);
        // 分割された単語をCamelCaseに変換します
        const camelCaseWords = words.map((word: string, index: number) => {
            // 2番目以降の単語は先頭を大文字にして連結します
            const tail = word.slice(1);
            if (tail.match(/^[A-Z0-9]*$/g)) {
                // 2番目以降の単語がすべて大文字の場合は小文字にします
                word = word.toLowerCase();
            } else {
                // 混在する場合はそのままにします
                // console.log(`MIXED:${tail}`);
            }
            return (index === 0 && isCamel ? word.charAt(0).toLowerCase() : word.charAt(0).toUpperCase()) + word.slice(1);
        });
        // CamelCaseの文字列に変換して返します
        return camelCaseWords.join("");
    }

    /**
     * 文字列をBase64に変換する関数
     * @param str - 変換する文字列
     * @returns Base64に変換された文字列
     */
    public static toBase64(str: string): string {
        return btoa(new TextEncoder().encode(str).reduce((data, byte) => data + String.fromCharCode(byte), ''));
    }

    /**
     * 文字列の最初の文字を大文字に変換する関数
     * @param str - 大文字に変換する文字列
     * @returns 大文字に変換された文字列
     */
    static capitalize(str: string) {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * 文字列の最初の文字を小文字に変換する関数
     * @param str - 小文字に変換する文字列
     * @returns 小文字に変換された文字列
     */
    static decapitalize(str: string) {
        if (!str) return str;
        return str.charAt(0).toLowerCase() + str.slice(1);
    }

    /**
     * TypeScriptコードを整形する関数
     * @param code - 整形するTypeScriptコード
     * @returns 整形されたTypeScriptコード
     */
    static tsForm(code: string) {
        const lines = code.replace(/\r/g, '').split("\n");
        const result = lines.map((line, index) => {
            if (index === lines.length - 1 || line.endsWith(";")) {
                return line.trim() + '\n'; // 行末が;で終わる行または最後の行はそのまま返す
            } else {
                return line.trim(); // 行頭と行末のスペースを削除する
            }
        }).join("");
        return result;
    }

    /**
     * スペースを正規化する関数
     * 
     * @param str 正規化する文字列
     * @returns 正規化された文字列
     */
    static spaceNormalize(str: string): string {
        const lines = str.split("\n"); // 改行コードで分割
        const result = lines.map(line => {
            const matches = line.match(/^(\s*)(\S+(?:\s+\S+)*)\s*$/); // 行頭のスペースと行末のスペースを取り出す
            if (!matches || matches.length < 3) { return line; }
            const indent = matches[1]; // 行頭のスペース
            const words = matches[2].replace(/\s+/g, " "); // スペースの連続を1つのスペースに置換
            return indent + words;
        }).join("\n"); // 改行コードで結合
        return result;
    }

    /**
     * 日付をフォーマットする関数
     * 
     * @param date フォーマットする日付
     * @param format フォーマット
     * @returns フォーマットされた文字列
     */
    static formatDate(date: Date = new Date(), format: string = 'yyyy/MM/dd HH:mm:ss.SSS') {
        format = format.replace(/yyyy/g, '' + date.getFullYear());
        format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
        format = format.replace(/dd/g, ('0' + date.getDate()).slice(-2));
        format = format.replace(/HH/g, ('0' + date.getHours()).slice(-2));
        format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
        format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
        format = format.replace(/SSS/g, ('00' + date.getMilliseconds()).slice(-3));
        return format;
    }

    /**
     * Date型、またはDate型に変換可能な文字列をDate型に変換する。
     * 変換できない場合は undefined を返す。
     * 
     * @param value 変換する値
     * @returns Dateオブジェクト、または undefined
     */
    static toDateIfValid(value: Date | string | undefined): Date | undefined {
        if (value instanceof Date) {
            return value; // Date型の場合はそのまま返す
        } else if (typeof value === 'string' && !isNaN(Date.parse(value))) {
            return new Date(value); // Date型に変換可能な文字列の場合は変換して返す
        } else {
            return undefined; // それ以外はnullを返す
        }
    }

    /**
     * 配列を指定されたサイズごとに分割する関数
     * 
     * @param arr 分割する配列
     * @param chunkSize 一つの配列のサイズ
     * @returns 分割された配列
     */
    static toChunkArray(arr: any[], chunkSize: number): any[][] {
        return arr.reduce((acc, _, i) => {
            if (i % chunkSize === 0) acc.push(arr.slice(i, i + chunkSize));
            return acc;
        }, []);
    }

    /**
     * Markdownのコードブロックを```を外したものにする。
     * @param {string} text - Markdown形式のテキスト
     * @returns {string} コメント形式に変換されたテキスト
     */
    static convertCodeBlocks(text: string): string {
        let split = text.split(/```.*\n|```$/, -1);
        return split.map((code, index) => {
            if (code.length === 0) {
                return code;
            } else {
                if (index % 2 === 1) {
                    return code;
                } else {
                    return code.split('\n').map(line => `// ${line}`).join('\n');
                }
            }
        }).join('');
    }

    /**
     * JSONを安全にstringifyする関数を生成する
     */
    static genJsonSafer(): any {
        const cache = new WeakSet();
        return (key: string, value: any) => {
            if (typeof value === "object" && value !== null) {
                if (cache.has(value)) {
                    return null;
                } else {
                    // 
                }
                cache.add(value);
            } else {
                // 
            }
            return value;
        }
    }

    /**
     * JSONを安全にstringifyする関数。
     * 循環参照がある場合はオブジェクトをidに置換する。
     * idが無い場合はundefinedになると思う。。。
     * @param obj 
     * @returns 
     */
    static safeJsonStringify(obj: any) {
        const cache = new WeakSet();
        const jsonString = JSON.stringify(obj, (key, value) => {
            if (typeof value === 'object' && !(value === null || value === undefined)) {
                if (cache.has(value)) {
                    // 既に見たオブジェクトは再帰参照なのでidに置換する
                    // idが無い場合はundefinedになると思う。。。
                    if (Array.isArray(value)) {
                        console.log(key, value);
                        return value;
                    } else {
                        return { id: value.id };
                    }
                } else { }
                cache.add(value);
            } else { }
            return value;
        });
        console.log(jsonString);
        return jsonString;
    }

    /**
     * インデントを削除する
     * @param {string} str 
     * @returns {string}
     */
    static trimLines(str: string): string {
        const list = str.split('\n');
        const line = list.find((line, index) => line.trim().length > 0);
        if (line) { } else { return str; }
        const indent = line.length - line.trimStart().length;
        const regex = new RegExp(`^ {${indent}}`, 'g');
        return list.map(line => line.replace(regex, '')).join('\n').trim();
    }

    /**
     * JSONが1行ずつに分割されていても読めるようにする
     * @param {*} str 
     * @returns 
     */
    static jsonParse<T>(str: string, isSilent: boolean = false): T {
        let str0 = Utils.mdTrim(str).replace(/{"":"[^"]*"[,]{0,1}}/g, 'null').replace(/,}/g, '}');
        try {
            return Utils.jsonParse0(str0, true);
        } catch (e0) {
            // 末尾の括弧を外す（よくあるエラーなので）
            const str1 = str0.substring(0, str0.length - 1);
            try {
                return Utils.jsonParse0(str1, true);
            } catch (e1) {
                // 先頭に括弧補充
                const str2 = `{${str0}`;
                try {
                    return Utils.jsonParse0(str2, true);
                } catch (e2) {
                    // 先頭に括弧補充2
                    const str3 = Utils.mdTrim(`\`\`\`json\n{${str}`).replace(/{"":"[^"]*"[,]{0,1}}/g, 'null').replace(/,}/g, '}');
                    return Utils.jsonParse0(str3, isSilent);
                }
            }
        }
    }
    protected static jsonParse0<T>(str: string, isSilent: boolean = false): T {
        try {
            return JSON.parse(str);
        } catch (e0) {
            try {
                const mid = str.replace(/^ *{|} *$/gm, '').split('\n').filter(line => line.trim().length > 0).join(',');
                return JSON.parse(`{${mid}}`);
            } catch (e1) {
                try {
                    const mid = JSON.parse(`[${str}]`);
                    let sum = {};
                    mid.forEach((obj: any) => {
                        // console.log(sum);
                        sum = { ...sum, ...obj };
                    });
                    return sum as any;
                } catch (e2) {
                    if (isSilent) {
                        // silent
                    } else {
                        console.log(e2);
                        console.log(`[${str}]`);
                    }
                    throw e2;
                }
            }
        }
    }


    /**
     * Markdownのコードブロックを```を外したものにする。
     * @param {*} str 
     * @returns 
     */
    static mdTrim(str0: string): string {
        if (str0.indexOf('```') < 0) { return str0; }
        else {
            let flg = false;
            return str0.split('\n').filter(line => {
                if (line.trim().startsWith('```')) {
                    flg = !flg;
                    return false;
                } else {
                }
                return flg;
            }).join('\n');
        }
    }

    static fillTemplate(data: { [key: string]: string }, template: string): string {
        return template.replace(/{{(\w+)}}/g, (match, key) => data[key] || "");
    }

    /**
     * ファイル名に使えない文字を置換する
     * @param fileName
     * @returns 
     */
    static safeFileName(fileName: string) {
        return fileName.replace(/[\\/:*?"<>|]/g, '_');
    }

    /**
     * path.basename相当。いちいちpathをインポートするのだるいから作った。
     * @param filepath 
     * @returns 
     */
    static basename(filepath: string): string {
        const parts = filepath.split(/\/|\\/);
        return parts[parts.length - 1];
    }

    /**
     * path.dirname相当。いちいちpathをインポートするのだるいから作った。
     * @param filepath 
     * @returns 
     */
    static dirname(filepath: string): string {
        if (filepath.endsWith('/') || filepath.endsWith('\\')) {
            // TODO ディレクトリの場合はそのまま返すべきかどうか結構悩む
        } else { }
        const fileChain = filepath.split(/\/|\\/);
        return fileChain.slice(0, fileChain.length - 1).join('/');
    }

    /**
     * UUIDを生成する
     * @returns {string}
     */
    static generateUUID(): string {
        let dt = new Date().getTime();
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (dt + Math.random() * 16) % 16 | 0;
            dt = Math.floor(dt / 16);
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid;
    }

    /**
     * Pythonのrangeのようなもの
     * @param start 
     * @param end 
     * @param step 
     */
    static *range(start: number, end?: number, step: number = 1): Generator<number> {
        // stepが0の場合は無限ループになるのでエラー
        if (step === 0) throw new Error('step cannot be 0');
        // endが指定されない場合はstartをendとして扱う
        if (end === undefined) [start, end] = [0, start];
        // stepが負の場合はstartとendを入れ替える
        if (step < 0) [start, end] = [end, start];
        // stepが正の場合はstartからendまでstepずつ増やしながらyieldする
        for (let i = start; i < end; i += step)  yield i;
    }

    /**
     * 配列をどんな次元のものでもフラットにする。
     * @param arr 
     * @returns 
     */
    static flatten(arr: any[]): any[] {
        return arr.reduce((acc, val) => Array.isArray(val) ? [...acc, ...Utils.flatten(val)] : [...acc, val], []);
    }

    /**
     * テンプレート文字列中の ${varName} を変数で置換する。
     * @param template 
     * @param variables 
     * @returns 
     */
    static replaceTemplateString(template: string, variables: { [key: string]: any }): string {
        return template.replace(/\$\{([^}]+)\}/g, (_, name) => {
            // console.log(name, variables);
            // ヒットしなかったら置換しない
            return variables[name] === null || variables[name] === undefined ? `\${${name}}` : variables[name];
        });
    }

    /**
     * テンプレート文字列中の ${varName} を変数で置換する。
     * ※変数がオブジェクトの場合はドットで区切って再帰的に置換する。
     * @param template 
     * @param variables 
     * @returns 
     */
    static replaceTemplateStringDeep(template: string, variables: { [key: string]: any }): string {
        return template.replace(/\$\{([^}]+)\}/g, (_, name) => {
            const replace = name.split('.').reduce((acc: { [key: string]: any }, key: string) => {
                if (acc === null || acc === undefined) { return acc; }
                return acc[key];
            }, variables);
            // ヒットしなかったら置換しない
            return replace === null || replace === undefined ? `\${${name}}` : replace;
        });
    }

    /**
     * jsonを適当に整形してmarkdownに変換する。
     * あんまりうまく行ってないのでライブラリ持ってきた方がいいかもしれない。
     * @param json 
     * @returns 
     */
    static jsonToMarkdown(json: any): string {
        const obj = Utils.jsonToMarkdown0(json, 0);
        // console.log(obj.list);
        let beforeLayer = 0;
        let arrayLayer = 0;
        const md = obj.list.map(obj => {
            let md = '';
            // 7階層以上のオブジェクトは配列に変換する
            // バグるので一旦やめる。けど7階層以上できてしまうので悩ましい。
            // if (obj.type === 'object' && obj.layer >= 6) { obj.type = 'array'; }

            if (obj.type === 'object') {
                md = `${'#'.repeat(obj.layer + 1)} ${obj.md}`;
                arrayLayer = 0;
            } else if (obj.type === 'array') {
                md = `${'  '.repeat(arrayLayer)}- ${obj.md}`;
                arrayLayer++;
            } else if (obj.type === 'literal') {
                if (beforeLayer > obj.layer) {
                    // ここに来ること自体が失敗。7階層以上をarrayにしようとするとやっぱり変になる。
                    arrayLayer = 0;
                } else { }
                md = `${'  '.repeat(arrayLayer)}- ${obj.md}`;
            } else {
                md = '';
            }
            beforeLayer = obj.layer;
            return md;
        }).join('\n');
        // console.log(md);
        return md;
    }
    protected static jsonToMarkdown0(json: any, layer: number): { md: string, hasBlock: boolean, list: { layer: number, type: 'object' | 'array' | 'literal', md: string }[] } {
        // console.log(JSON.stringify(json));
        const list: { layer: number, type: 'object' | 'array' | 'literal', md: string }[] = [];
        if (json === undefined || json === null) {
            return { md: '', hasBlock: false, list };
        } else if (Array.isArray(json)) {
            // オブジェクト型の場合
            // 途中にオブジェクト型が混ざるとリストの途中にブロックが入ってしまうので、一旦オブジェクトとリテラルを選り分けて、リテラルから先に処理する。
            const nullFilterd = json.filter(value => !(value === null || value === undefined));
            // console.log(nullFilterd);
            const objectKeyList = nullFilterd.filter(value => !Array.isArray(value) && typeof value === 'object');
            const arrayKeyList = nullFilterd.filter(value => Array.isArray(value));
            const literalKeyList = nullFilterd.filter(value => !(Array.isArray(value) || typeof value === 'object'));
            let hasBlock = false;
            [...literalKeyList, ...arrayKeyList, ...objectKeyList].forEach((value, index) => {
                if (value === null || value === undefined) {
                    // nullやundefinedは出力しない（keyごと削除）
                } else if (Array.isArray(value)) {
                    const obj = Utils.jsonToMarkdown0(value, layer + 1);
                    if (obj.hasBlock) {
                        hasBlock = true;
                        list.push({ layer, type: 'object', md: `${index}` });
                    } else {
                        list.push({ layer, type: 'array', md: `${index}` });
                    }
                    obj.list.forEach(obj => list.push(obj));
                } else if (typeof value === 'object') {
                    // オブジェクト型かつ子要素もオブジェクト型の場合はブロックとして表示する
                    const obj = Utils.jsonToMarkdown0(value, layer + 1);
                    if (obj.hasBlock) {
                        hasBlock = true;
                        list.push({ layer, type: 'object', md: `${index}` });
                    } else {
                        list.push({ layer, type: 'array', md: `${index}` });
                    }
                    obj.list.forEach(obj => list.push(obj));
                } else {
                    list.push({ layer, type: 'literal', md: `${index}: ${value}` });
                }
            });
            return { md: '', hasBlock, list };
        } else if (typeof json === 'object') {
            // オブジェクト型の場合
            // 途中にオブジェクト型が混ざるとリストの途中にブロックが入ってしまうので、一旦オブジェクトとリテラルを選り分けて、リテラルから先に処理する。
            const nullFilterd = Object.entries(json).filter(([key, value]) => !(value === null || value === undefined));
            const objectKeyList = nullFilterd.filter(([key, value]) => !Array.isArray(value) && typeof value === 'object').map(([key, value]) => key);
            const arrayKeyList = nullFilterd.filter(([key, value]) => Array.isArray(value)).map(([key, value]) => key);
            const literalKeyList = nullFilterd.filter(([key, value]) => !(Array.isArray(value) || typeof value === 'object')).map(([key, value]) => key);
            let hasBlock = false;
            [...literalKeyList, ...arrayKeyList, ...objectKeyList].forEach(key => {
                const value = json[key];
                if (value === null || value === undefined) {
                    // nullやundefinedは出力しない（keyごと削除）
                } else if (Array.isArray(value)) {
                    const obj = Utils.jsonToMarkdown0(value, layer + 1);
                    if (obj.hasBlock) {
                        hasBlock = true;
                        console.log(`array: ${key} ${list.length}`);
                        list.push({ layer, type: 'object', md: `${key}` });
                    } else {
                        list.push({ layer, type: 'array', md: `${key}` });
                    }
                    obj.list.forEach(obj => list.push(obj));
                } else if (typeof value === 'object') {
                    // オブジェクト型かつ子要素もオブジェクト型の場合はブロックとして表示する
                    const obj = Utils.jsonToMarkdown0(value, layer + 1);
                    hasBlock = true;
                    list.push({ layer, type: 'object', md: `${key}` });
                    obj.list.forEach(obj => list.push(obj));
                } else {
                    list.push({ layer, type: 'literal', md: `${key}: ${value}` });
                }
            });
            return { md: '', hasBlock, list };
        } else {
            list.push({ layer, type: 'literal', md: `${json}` });
            return { md: ``, hasBlock: false, list };
        }
    }

    static splitCodeBlock(text: string): string[] {
        let split = text.split(/```/, -1);
        // if (text.startsWith('```')) {
        //     split.unshift('');
        // } else { }
        return split;
    }

    static replaceExtension(path: string, extension: string): string {
        const splitPath = path.split('/');
        const splitName = splitPath[splitPath.length - 1].split('.');
        // ファイル名が拡張子付きの場合と拡張子無しの場合で分ける。
        if (splitName.length > 1) {
            splitName[splitName.length - 1] = extension;
            splitPath[splitPath.length - 1] = splitName.join('.');
            path = splitPath.join('/');
        } else {
            path = `${path}.${extension}`;
        }
        return path;
    }


    /**
     * json形式だったら```json```で囲む。
     */
    static setJsonMarkdownBlock(text: string): string {
        if (text && (
            (text.startsWith('{') && text.endsWith('}'))
            || (text.startsWith('[') && text.endsWith(']'))
        )) {
            try {
                JSON.stringify(JSON.parse(text));
                return `\`\`\`json\n${text}\n\`\`\``;
            } catch (e) { /** json変換できないものはjson扱いにしない。 */ }
        } else { /** 最初と最後の文字で仮判定。 */ }
        return text;
    }

    static clone<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj)) as T;
    }
}

/**
 * TypeScriptの型を部分的にオプショナルにするユーティリティ型
 * @template T - オブジェクトの型
 * @template K - オプショナルにするプロパティのキーの型
 * @returns - オプショナルにしたオブジェクトの型
 */
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
