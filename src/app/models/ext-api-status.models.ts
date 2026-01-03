/**
 * 外部API接続状態確認API レスポンスモデル
 */

/** GET /api/user/ext-api/status - 全プロバイダーの接続状態一覧 */
export interface ExtApiProviderStatusResponse {
  providers: ExtApiProviderStatusItem[];
}

export interface ExtApiProviderStatusItem {
  /** プロバイダー識別子（{type}-{name}形式） */
  provider: string;
  /** 表示用ラベル */
  label: string;
  /** プロバイダータイプ（box, gitlab, mattermost等） */
  type: string;
  /** 認証タイプ（OAuth2, APIKey） */
  authType: string;
  /** OAuth認証済みかどうか */
  connected: boolean;
  /** OAuthアカウントのステータス（ACTIVE, EXPIRED, REVOKED等） */
  status: string | null;
  /** プロバイダー側のメールアドレス */
  providerEmail: string | null;
}

/** GET /api/user/ext-api/status/:provider/check - 個別プロバイダーの接続テスト */
export interface ExtApiConnectionCheckResult {
  /** プロバイダー識別子 */
  provider: string;
  /** 表示用ラベル（未登録時は省略） */
  label?: string;
  /** OAuth認証済みかどうか */
  connected: boolean;
  /** 実際の接続テストが成功したか */
  verified: boolean;
  /** 結果メッセージ */
  message: string;
  /** プロバイダー側のメールアドレス（認証済みの場合） */
  providerEmail?: string;
}
