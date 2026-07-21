/**
 * TOTP 类型定义（Sprint 11 · TASK-057）
 */

export type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

/** TOTP 秘钥参数 */
export interface TOTPConfig {
  /** Base32 编码的 secret */
  secret: string
  /** 关联的凭证 id */
  credentialId: string
  /** 发行方（可选） */
  issuer?: string
  /** 账户名（可选） */
  account?: string
  /** 散列算法 */
  algorithm: TOTPAlgorithm
  /** 动态码位数（6 或 8） */
  digits: 6 | 8
  /** 周期秒数（常见 30） */
  period: number
  /** 创建时间戳（ms） */
  createdAt: number
  /** 更新时间戳（ms） */
  updatedAt: number
}

/** TOTP 存储行（加密后的 secret 字段 + 其他明文参数） */
export interface TOTPStoreRow {
  credentialId: string
  secretEncrypted: string
  issuer: string | null
  account: string | null
  algorithm: TOTPAlgorithm
  digits: 6 | 8
  period: number
  createdAt: number
  updatedAt: number
}

/** 运行时的 TOTP 生成结果 */
export interface TOTPCode {
  /** 6~8 位数字码 */
  code: string
  /** 剩余有效毫秒 */
  remainingMs: number
  /** 周期毫秒 */
  periodMs: number
}

/** TOTP 新增/更新输入 */
export interface TOTPUpsertInput {
  credentialId: string
  secret: string
  issuer?: string
  account?: string
  algorithm?: TOTPAlgorithm
  digits?: 6 | 8
  period?: number
}

/** otpauth URI 解析结果 */
export interface OtpauthParseResult {
  secret: string
  issuer?: string
  account?: string
  algorithm: TOTPAlgorithm
  digits: 6 | 8
  period: number
}

/** Sprint 11 IPC 通道 */
export const SPRINT11_CHANNELS = {
  // TOTP
  TOTP_UPSERT: 'sprint11:totp-upsert',
  TOTP_DELETE: 'sprint11:totp-delete',
  TOTP_GET: 'sprint11:totp-get',
  TOTP_GENERATE: 'sprint11:totp-generate',
  TOTP_PARSE_URI: 'sprint11:totp-parse-uri',

  // Password generator
  PASSWORD_GENERATE_STRONG: 'sprint11:password-generate-strong',
  PASSWORD_GENERATE_PASSPHRASE: 'sprint11:password-generate-passphrase',
  PASSWORD_GENERATE_PIN: 'sprint11:password-generate-pin',
  PASSWORD_EVALUATE_STRENGTH: 'sprint11:password-evaluate-strength',

  // Health
  HEALTH_REPORT: 'sprint11:health-report',
  HEALTH_CHECK_HIBP: 'sprint11:health-check-hibp',

  // Preview
  PREVIEW_FETCH_URL_META: 'sprint11:preview-fetch-url-meta'
} as const

export type Sprint11Channel =
  (typeof SPRINT11_CHANNELS)[keyof typeof SPRINT11_CHANNELS]
