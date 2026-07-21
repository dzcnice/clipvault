/**
 * 数据导入工具
 */

import type {
  Credential,
  ClipboardItem,
  CredentialType,
  ClipboardContentType
} from '../types'
import type { ExportData } from './export'
import { decryptExport } from './export'

export interface ImportResult {
  success: boolean
  message: string
  stats?: {
    credentials?: { total: number; imported: number; skipped: number }
    clipboardItems?: { total: number; imported: number; skipped: number }
    categories?: { total: number; imported: number; skipped: number }
  }
}

export interface ImportOptions {
  overwriteExisting?: boolean
  skipDuplicates?: boolean
}

/**
 * 解析 JSON 导入数据
 */
export function parseJsonImport(jsonString: string): ExportData | null {
  try {
    const data = JSON.parse(jsonString) as ExportData

    // 验证数据结构
    if (!data.version || !data.exportedAt) {
      return null
    }

    return data
  } catch {
    return null
  }
}

/**
 * 检查 JSON 导入是否为加密模式
 */
export function isEncryptedExport(data: ExportData): boolean {
  return Boolean(
    data._encrypted && data._encrypted.format === 'clipvault-encrypted-v1'
  )
}

/**
 * 解密加密导出：返回补齐 credentials 字段后的 ExportData
 * 密码错误会抛错
 */
export function decryptImportedData(data: ExportData, password: string): ExportData {
  if (!isEncryptedExport(data) || !data._encrypted) {
    throw new Error('数据不是加密格式')
  }
  const { credentials, clipboardItems } = decryptExport(data._encrypted, password)
  return {
    ...data,
    credentials,
    // C1 · 解密后剪贴板也还原到外层字段，交由上层写入 clipboard_store
    clipboardItems: clipboardItems.length > 0 ? clipboardItems : data.clipboardItems,
    _encrypted: undefined
  }
}

/**
 * 解析 CSV 导入凭证数据
 */
export function parseCredentialsCsv(csvString: string): Partial<Credential>[] {
  const lines = csvString.trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0] ?? '')
  const credentials: Partial<Credential>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i] ?? '')
    if (values.length !== headers.length) continue

    const credential: Partial<Credential> = {}

    headers.forEach((header, index) => {
      const value = values[index]
      switch (header.toLowerCase()) {
        case 'name':
          credential.name = value
          break
        case 'type':
          credential.type = value as CredentialType
          break
        case 'value':
          credential.value = value
          break
        case 'description':
          credential.description = value || undefined
          break
        case 'tags':
          credential.tags = value ? value.split(';').filter(Boolean) : undefined
          break
        case 'categoryid':
          credential.categoryId = value || undefined
          break
      }
    })

    // 验证必填字段
    if (credential.name && credential.type && credential.value) {
      credentials.push(credential)
    }
  }

  return credentials
}

/**
 * 解析 CSV 导入剪贴板数据
 */
export function parseClipboardCsv(csvString: string): Partial<ClipboardItem>[] {
  const lines = csvString.trim().split('\n')
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0] ?? '')
  const items: Partial<ClipboardItem>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i] ?? '')
    if (values.length !== headers.length) continue

    const item: Partial<ClipboardItem> = {}

    headers.forEach((header, index) => {
      const value = values[index]
      switch (header.toLowerCase()) {
        case 'type':
          item.type = value as ClipboardContentType
          break
        case 'content':
          item.content = value
          break
        case 'preview':
          item.preview = value || undefined
          break
        case 'ispinned':
          item.isPinned = (value ?? '').toLowerCase() === 'true'
          break
        case 'issnippet':
          item.isSnippet = (value ?? '').toLowerCase() === 'true'
          break
        case 'title':
          // 兼容旧格式：将 title 作为 snippetName 读入
          item.snippetName = value || undefined
          break
      }
    })

    // 验证必填字段
    if (item.type && item.content) {
      items.push(item)
    }
  }

  return items
}

/**
 * 解析 CSV 行
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }

  result.push(current)
  return result
}

/**
 * 验证导入的凭证数据
 */
export function validateCredentials(credentials: Partial<Credential>[]): {
  valid: Partial<Credential>[]
  invalid: Array<{ data: Partial<Credential>; reason: string }>
} {
  const valid: Partial<Credential>[] = []
  const invalid: Array<{ data: Partial<Credential>; reason: string }> = []

  // 保留所有已定义的凭证类型
  const validTypes: CredentialType[] = [
    'api_key',
    'database',
    'ssh_key',
    'certificate',
    'token',
    'password',
    'other'
  ] as CredentialType[]

  for (const cred of credentials) {
    if (!cred.name || cred.name.trim().length === 0) {
      invalid.push({ data: cred, reason: '名称不能为空' })
      continue
    }

    if (!cred.type || !validTypes.includes(cred.type)) {
      invalid.push({ data: cred, reason: '无效的凭证类型' })
      continue
    }

    if (!cred.value || cred.value.trim().length === 0) {
      invalid.push({ data: cred, reason: '值不能为空' })
      continue
    }

    valid.push(cred)
  }

  return { valid, invalid }
}

/**
 * 验证导入的剪贴板数据
 */
export function validateClipboardItems(items: Partial<ClipboardItem>[]): {
  valid: Partial<ClipboardItem>[]
  invalid: Array<{ data: Partial<ClipboardItem>; reason: string }>
} {
  const valid: Partial<ClipboardItem>[] = []
  const invalid: Array<{ data: Partial<ClipboardItem>; reason: string }> = []

  const validTypes: ClipboardContentType[] = [
    'text' as ClipboardContentType,
    'image' as ClipboardContentType,
    'file' as ClipboardContentType,
    'html' as ClipboardContentType
  ]

  for (const item of items) {
    if (!item.type || !validTypes.includes(item.type)) {
      invalid.push({ data: item, reason: '无效的项目类型' })
      continue
    }

    if (!item.content || item.content.trim().length === 0) {
      invalid.push({ data: item, reason: '内容不能为空' })
      continue
    }

    valid.push(item)
  }

  return { valid, invalid }
}

/**
 * 检测导入文件格式
 */
export function detectImportFormat(content: string): 'json' | 'csv' | 'unknown' {
  const trimmed = content.trim()

  // 检测 JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch {
      // Not valid JSON
    }
  }

  // 检测 CSV (检查是否有逗号分隔的头部)
  const firstLine = trimmed.split('\n')[0]
  if (firstLine && firstLine.includes(',')) {
    const headers = firstLine.toLowerCase()
    if (
      headers.includes('name') ||
      headers.includes('type') ||
      headers.includes('content') ||
      headers.includes('value')
    ) {
      return 'csv'
    }
  }

  return 'unknown'
}
