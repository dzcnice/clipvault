/**
 * Sprint 14 · TASK-074/075 导入模块共用工具
 */

import type { ImportedCredential } from '../../types/import'

export interface ImporterContext {
  /** 额外警告行 */
  warnings: string[]
  /** 被跳过的条目计数 */
  skipped: number
}

export function makeCtx(): ImporterContext {
  return { warnings: [], skipped: 0 }
}

/**
 * RFC 4180 简化 CSV 解析（支持引号内逗号 / 双引号转义 / CRLF）
 * 不处理极端 edge case，不支持自定义分隔符。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let i = 0
  let inQuote = false
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  while (i < src.length) {
    const ch = src[i]!
    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuote = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuote = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  // 末尾未换行
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // 去掉完全空白的尾行
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}

/**
 * 把 CSV 行数组转对象数组（首行为 header）
 */
export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const headers = rows[0]!.map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]!] = r[i] ?? ''
    }
    return obj
  })
}

/** 把任意字符串归一化为合法的 credential tag */
export function normalizeTag(raw: string | undefined | null): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t || t === '(none)' || t.toLowerCase() === 'none') return null
  return t.slice(0, 64)
}

/** 构造一个空的 ImportedCredential 骨架 */
export function makeCredential(
  type: string,
  name: string,
  value: string,
  extra: Partial<ImportedCredential> = {}
): ImportedCredential {
  return {
    type,
    name: name.trim() || '(未命名)',
    value,
    description: extra.description,
    metadata: extra.metadata,
    tags: extra.tags
  }
}
