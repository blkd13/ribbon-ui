/**
 * プロジェクト関連の共通ユーティリティ関数
 */

// Date.nowだけだと同じミリ秒で生成されることがあるので、カウンターを使ってユニークなIDを生成する。
let counter = 0;

/**
 * ダミーIDを生成する
 * @param dummyIdPrefix プレフィックス
 * @returns ユニークなダミーID
 */
export function genDummyId(dummyIdPrefix: string = ''): string {
    return `dummy-${dummyIdPrefix}-${counter++}-${Date.now()}`;
}

/**
 * 基底エンティティの初期値を生成する
 * @param dummyIdPrefix プレフィックス
 * @returns 基底エンティティ
 */
export function genInitialBaseEntity(dummyIdPrefix: string = '') {
    return {
        id: genDummyId(dummyIdPrefix),
        createdAt: new Date(), 
        updatedAt: new Date(),
        createdBy: '', 
        updatedBy: '',
        createdIp: '', 
        updatedIp: '',
    };
}

/**
 * カウンターをリセットする（テスト用）
 */
export function resetCounter(): void {
    counter = 0;
}

/**
 * エンティティの更新情報を生成
 * @param userId ユーザーID
 * @param ip IPアドレス
 */
export function genUpdateInfo(userId: string = '', ip: string = '') {
    return {
        updatedAt: new Date(),
        updatedBy: userId,
        updatedIp: ip
    };
}

/**
 * エンティティの作成情報を生成
 * @param userId ユーザーID
 * @param ip IPアドレス
 */
export function genCreateInfo(userId: string = '', ip: string = '') {
    return {
        createdAt: new Date(),
        createdBy: userId,
        createdIp: ip,
        ...genUpdateInfo(userId, ip)
    };
}