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

/** TOTP / 密码生成 / 健康 / 预览 IPC 通道 */
export const TOOLS_CHANNELS = {
  TOTP_UPSERT: 'totp:upsert',
  TOTP_DELETE: 'totp:delete',
  TOTP_GET: 'totp:get',
  TOTP_LIST: 'totp:list',
  TOTP_GENERATE: 'totp:generate',
  TOTP_PARSE_URI: 'totp:parse-uri',

  PASSWORD_GENERATE_STRONG: 'password:generate-strong',
  PASSWORD_GENERATE_PASSPHRASE: 'password:generate-passphrase',
  PASSWORD_GENERATE_PIN: 'password:generate-pin',
  PASSWORD_EVALUATE_STRENGTH: 'password:evaluate-strength',

  HEALTH_REPORT: 'health:report',
  HEALTH_CHECK_HIBP: 'health:check-hibp',

  PREVIEW_FETCH_URL_META: 'preview:fetch-url-meta'
} as const

export type ToolsChannel = (typeof TOOLS_CHANNELS)[keyof typeof TOOLS_CHANNELS]
