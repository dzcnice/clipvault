/**
 * Sprint 14 · TASK-074 / 075 第三方导入类型
 */

export type ImportSource =
  | 'onepassword'
  | 'bitwarden'
  | 'chrome'
  | 'lastpass'
  | 'keepass'
  | 'generic-csv'

/** 通用 CSV 列映射 */
export interface GenericCsvMapping {
  name?: string
  username?: string
  password?: string
  url?: string
  notes?: string
  tags?: string
}

export interface ImportedCredential {
  /** 目标 type：映射到 CredentialType 的字符串 */
  type: string
  name: string
  value: string
  description?: string
  metadata?: Record<string, unknown>
  tags?: string[]
}

export interface ImportParseResult {
  source: ImportSource
  items: ImportedCredential[]
  skipped: number
  warnings: string[]
}

export interface ImportRequest {
  source: ImportSource
  /** 原始文件内容（UTF-8 字符串，或 base64 用于二进制 .1pux） */
  content: string
  /** 是否 base64 编码；.1pux 必 true */
  base64?: boolean
  /** 解密密码（仅 bitwarden 加密导出 / 1pux 可能用到） */
  password?: string
  /** KeePass 密钥文件（可选） */
  keyFile?: string
  /** 通用 CSV 列映射 */
  mapping?: GenericCsvMapping
}

export const IMPORT_CHANNELS = {
  PARSE: 'import:parse',
  COMMIT: 'import:commit'
} as const

/** 未实现占位错误码 */
export const E_NOT_IMPLEMENTED = 'E_NOT_IMPLEMENTED'
