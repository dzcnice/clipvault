/**
 * 通用 CSV 导入：列映射 → ImportedCredential
 */

import { csvToObjects } from './types'
import type { GenericCsvMapping, ImportedCredential } from '../../types/import'

export interface GenericCsvParseResult {
  items: ImportedCredential[]
  skipped: number
  headers: string[]
  totalRows: number
}

function pick(row: Record<string, string>, key?: string): string {
  if (!key) return ''
  const v = row[key]
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * 用用户指定的列名映射解析 CSV 文本
 */
export function parseGenericCsv(
  text: string,
  mapping: GenericCsvMapping
): GenericCsvParseResult {
  const rows = csvToObjects(text)
  const headers = rows.length > 0 ? Object.keys(rows[0]!) : []
  const items: ImportedCredential[] = []
  let skipped = 0

  for (const row of rows) {
    const name =
      pick(row, mapping.name) ||
      pick(row, mapping.username) ||
      pick(row, mapping.url) ||
      '导入条目'
    const password = pick(row, mapping.password)
    const username = pick(row, mapping.username)
    const url = pick(row, mapping.url)
    const notes = pick(row, mapping.notes)
    const tagsRaw = pick(row, mapping.tags)

    if (!password && !username && !url) {
      skipped++
      continue
    }

    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined

    items.push({
      name,
      type: 'password',
      value: password || username || '',
      description: notes || undefined,
      tags,
      metadata: {
        username: username || undefined,
        custom: url ? { url } : undefined
      }
    })
  }

  return { items, skipped, headers, totalRows: rows.length }
}

/** 猜测常见列名 */
export function guessMapping(headers: string[]): GenericCsvMapping {
  const lower = headers.map((h) => h.toLowerCase())
  const find = (...cands: string[]): string | undefined => {
    for (const c of cands) {
      const i = lower.findIndex((h) => h === c || h.includes(c))
      if (i >= 0) return headers[i]
    }
    return undefined
  }
  return {
    name: find('name', 'title', '名称', '标题'),
    username: find('username', 'user', 'login', 'email', '用户', '账号'),
    password: find('password', 'pass', 'secret', '密码'),
    url: find('url', 'uri', 'website', 'site', '网址', '链接'),
    notes: find('notes', 'note', 'comment', '备注', '说明'),
    tags: find('tags', 'tag', 'labels', '标签')
  }
}
