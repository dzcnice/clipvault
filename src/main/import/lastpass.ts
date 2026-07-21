/**
 * Sprint 14 · TASK-075 LastPass CSV 导入
 *
 * LastPass export 字段：
 *   url,username,password,totp,extra,name,grouping,fav
 *
 * grouping 会被映射为 tag（按 / 分层拆分）。
 */

import type { ImportParseResult } from '../../types/import'
import { csvToObjects, makeCredential, makeCtx, normalizeTag } from './types'

export function parseLastpassCsv(text: string): ImportParseResult {
  const ctx = makeCtx()
  const rows = csvToObjects(text)
  const items = []

  for (const row of rows) {
    const name = row['name'] || ''
    const url = row['url'] || ''
    const username = row['username'] || ''
    const password = row['password'] || ''
    const totp = row['totp'] || ''
    const extra = row['extra'] || ''
    const grouping = row['grouping'] || ''
    const fav = row['fav'] || ''

    if (!password && !username && !extra && !totp) {
      ctx.skipped++
      continue
    }

    const tags: string[] = ['lastpass']
    if (grouping) {
      for (const piece of grouping.split('/')) {
        const t = normalizeTag(piece)
        if (t) tags.push(t)
      }
    }
    if (fav && fav !== '0') tags.push('favorite')

    const meta: Record<string, unknown> = {}
    if (url) meta.url = url
    if (username) meta.username = username
    if (extra) meta.note = extra
    if (totp) meta.totp = totp

    items.push(
      makeCredential('password', name || url || '(未命名)', password, {
        description: url || extra || undefined,
        metadata: meta,
        tags
      })
    )
  }

  return {
    source: 'lastpass',
    items,
    skipped: ctx.skipped,
    warnings: ctx.warnings
  }
}
