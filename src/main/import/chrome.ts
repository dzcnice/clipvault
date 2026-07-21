/**
 * Sprint 14 · TASK-075 Chrome 密码 CSV 导入
 *
 * Chrome export 格式（截至 2024+）：
 *   name,url,username,password,note
 */

import type { ImportParseResult } from '../../types/import'
import { csvToObjects, makeCredential, makeCtx } from './types'

export function parseChromeCsv(text: string): ImportParseResult {
  const ctx = makeCtx()
  const rows = csvToObjects(text)
  const items = []

  for (const row of rows) {
    const name = row['name'] || row['Name'] || row['title'] || ''
    const url = row['url'] || row['URL'] || ''
    const username = row['username'] || row['Username'] || ''
    const password = row['password'] || row['Password'] || ''
    const note = row['note'] || row['Note'] || ''

    if (!password && !username) {
      ctx.skipped++
      continue
    }

    const meta: Record<string, unknown> = {}
    if (url) meta.url = url
    if (username) meta.username = username
    if (note) meta.note = note

    items.push(
      makeCredential('password', name || url || '(未命名)', password, {
        description: url,
        metadata: meta,
        tags: ['chrome']
      })
    )
  }

  return {
    source: 'chrome',
    items,
    skipped: ctx.skipped,
    warnings: ctx.warnings
  }
}
