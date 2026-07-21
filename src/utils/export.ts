/**
 * 数据导出工具
 *
 * 支持三种 JSON 导出模式：
 * - plain：凭证 value 被脱敏为空串 + 顶层 _warning 标记
 * - encrypted：AES-256-GCM 整包加密 credentials 数组
 *              密钥由独立的"导出密码" scrypt 派生（独立于 vault 主密码）
 */

import type { Credential, ClipboardItem, Category } from '../types'

export interface ExportData {
  version: string
  exportedAt: string
  credentials?: Credential[]
  clipboardItems?: ClipboardItem[]
  categories?: Category[]
  /** 不加密模式下的警告提示 */
  _warning?: string
  /** 加密模式时 credentials 被加密到 _encrypted 块，credentials 留 undefined 占位 */
  _encrypted?: EncryptedBlob
}

export type ExportMode = 'plain' | 'encrypted'

export interface EncryptedBlob {
  /** 魔术字段：标识为 ClipVault 加密导出 */
  format: 'clipvault-encrypted-v1'
  /** scrypt 派生盐 base64 */
  salt: string
  /** AES-GCM IV base64 */
  iv: string
  /** AES-GCM auth tag base64 */
  authTag: string
  /** 密文 base64（JSON.stringify(credentials) 的 AES-256-GCM 结果） */
  ciphertext: string
  /** scrypt 参数记录 */
  kdf: {
    N: number
    r: number
    p: number
    keyLen: number
  }
}

export interface ExportOptions {
  includeCredentials?: boolean
  includeClipboard?: boolean
  includeCategories?: boolean
  format?: 'json' | 'csv'
  /** JSON 模式下的子模式 */
  jsonMode?: ExportMode
  /** jsonMode==='encrypted' 时需要的导出密码 */
  exportPassword?: string
}

/** 导出为 JSON 字符串（调用方先通过 prepareExportData 拿到结构） */
export function exportToJson(data: ExportData): string {
  return JSON.stringify(data, null, 2)
}

/**
 * 导出凭证为 CSV 格式
 */
export function exportCredentialsToCsv(credentials: Credential[]): string {
  const headers = ['id', 'name', 'type', 'value', 'description', 'tags', 'createdAt', 'updatedAt']
  const rows = credentials.map((cred) => [
    escapeCSV(cred.id),
    escapeCSV(cred.name),
    escapeCSV(cred.type),
    escapeCSV(cred.value),
    escapeCSV(cred.description || ''),
    escapeCSV(cred.tags?.join(';') || ''),
    escapeCSV(cred.createdAt),
    escapeCSV(cred.updatedAt)
  ] as string[])

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

/**
 * 导出剪贴板项目为 CSV 格式
 */
export function exportClipboardToCsv(items: ClipboardItem[]): string {
  const headers = ['id', 'type', 'content', 'preview', 'isPinned', 'isSnippet', 'title', 'createdAt']
  const rows = items.map((item) => [
    escapeCSV(item.id),
    escapeCSV(item.type),
    escapeCSV(item.content ?? ''),
    escapeCSV(item.preview || ''),
    item.isPinned ? 'true' : 'false',
    item.isSnippet ? 'true' : 'false',
    escapeCSV(item.snippetName || ''),
    escapeCSV(item.createdAt)
  ] as string[])

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

/**
 * CSV 字段转义
 */
function escapeCSV(value: string | number): string {
  const str = typeof value === 'string' ? value : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * 创建（未加密的）基础导出对象
 */
export function createExportData(
  credentials?: Credential[],
  clipboardItems?: ClipboardItem[],
  categories?: Category[]
): ExportData {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    credentials,
    clipboardItems,
    categories
  }
}

/**
 * 生成导出文件名
 */
export function generateExportFileName(format: 'json' | 'csv', type?: string): string {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]
  const typeStr = type ? `-${type}` : ''
  return `clipvault-export${typeStr}-${dateStr}.${format}`
}

/**
 * 对凭证 value 进行脱敏：返回 credentials 的副本，value 清空
 */
export function redactCredentials(credentials: Credential[] | undefined): Credential[] | undefined {
  if (!credentials) return credentials
  return credentials.map((c) => ({ ...c, value: '' }))
}

/**
 * 将 ExportData 转换为"纯 JSON"模式（脱敏凭证 + _warning）
 */
export function toPlainExport(data: ExportData): ExportData {
  return {
    ...data,
    credentials: redactCredentials(data.credentials),
    _warning: '凭证 value 已移除；如需完整导出请选择加密模式'
  }
}

/** A-1 加密导出默认 scrypt 参数 */
const EXPORT_SCRYPT_N = 16384
const EXPORT_SCRYPT_R = 8
const EXPORT_SCRYPT_P = 1
const EXPORT_KEY_LEN = 32
const EXPORT_SALT_LEN = 16
const EXPORT_IV_LEN = 12

/**
 * 用独立的导出密码加密 credentials 数组
 *
 * 注意：此函数仅在 Node 环境（主进程）调用，依赖 `crypto` 模块
 */
export async function toEncryptedExport(
  data: ExportData,
  exportPassword: string
): Promise<ExportData> {
  if (!exportPassword || exportPassword.length < 4) {
    throw new Error('导出密码至少 4 个字符')
  }
  // 动态 require 避免渲染端 bundle 报错
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto: typeof import('crypto') = require('crypto')

  // C1 · 加密块现在同时包住 credentials + clipboardItems，
  // 导出文件里不再保留任何剪贴板明文。
  const payload = {
    credentials: data.credentials ?? [],
    clipboardItems: data.clipboardItems ?? []
  }
  const payloadJson = JSON.stringify(payload)
  const salt = crypto.randomBytes(EXPORT_SALT_LEN)
  const iv = crypto.randomBytes(EXPORT_IV_LEN)
  const key = crypto.scryptSync(exportPassword, salt, EXPORT_KEY_LEN, {
    N: EXPORT_SCRYPT_N,
    r: EXPORT_SCRYPT_R,
    p: EXPORT_SCRYPT_P
  })
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(payloadJson, 'utf8'),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  const encrypted: EncryptedBlob = {
    format: 'clipvault-encrypted-v1',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    kdf: {
      N: EXPORT_SCRYPT_N,
      r: EXPORT_SCRYPT_R,
      p: EXPORT_SCRYPT_P,
      keyLen: EXPORT_KEY_LEN
    }
  }

  // 加密模式：credentials + clipboardItems 都被塞进 _encrypted，明文字段置空
  return {
    ...data,
    credentials: undefined,
    clipboardItems: undefined,
    _encrypted: encrypted
  }
}

/**
 * 解密加密导出
 *
 * 兼容两种 payload：
 *   - v2.1 之前：Credential[] 数组（老格式）
 *   - v2.1 起：{ credentials: Credential[], clipboardItems: ClipboardItem[] }
 *
 * 为保持向后兼容，返回结构始终是 { credentials, clipboardItems }；
 * 老格式时 clipboardItems 为 []。
 */
export function decryptExport(
  blob: EncryptedBlob,
  password: string
): { credentials: Credential[]; clipboardItems: ClipboardItem[] } {
  if (blob.format !== 'clipvault-encrypted-v1') {
    throw new Error('不支持的加密导出格式')
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto: typeof import('crypto') = require('crypto')

  const salt = Buffer.from(blob.salt, 'base64')
  const iv = Buffer.from(blob.iv, 'base64')
  const authTag = Buffer.from(blob.authTag, 'base64')
  const ciphertext = Buffer.from(blob.ciphertext, 'base64')
  const key = crypto.scryptSync(password, salt, blob.kdf.keyLen, {
    N: blob.kdf.N,
    r: blob.kdf.r,
    p: blob.kdf.p
  })
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  try {
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const parsed = JSON.parse(plain.toString('utf8'))
    if (Array.isArray(parsed)) {
      // 老格式
      return { credentials: parsed as Credential[], clipboardItems: [] }
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as {
        credentials?: Credential[]
        clipboardItems?: ClipboardItem[]
      }
      return {
        credentials: Array.isArray(obj.credentials) ? obj.credentials : [],
        clipboardItems: Array.isArray(obj.clipboardItems) ? obj.clipboardItems : []
      }
    }
    throw new Error('解密后数据结构不可识别')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error('解密失败（密码错误或数据损坏）：' + msg)
  }
}
