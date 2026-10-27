import { getDatabase } from '../../db/connection'
import { addInbox, listInbox, settleInbox } from '../../db/inbox-store'
import { createSnippet, deleteClipboardItems, getClipboardItemById } from '../../db/clipboard-store'

export function computeSuggestions(now = Date.now()): void {
  const db = getDatabase()
  const stale = db.prepare("SELECT id,project_id FROM clipboard_history WHERE category='secret' AND is_saved=0 AND is_snippet=0 AND COALESCE(last_copied_at,created_at)<? LIMIT 100").all(now - 7 * 86400000) as Array<{ id: string; project_id: string | null }>
  for (const item of stale) addInbox({ type: 'organize', sourceId: `stale:${item.id}`, projectId: item.project_id, data: { title: '临时密钥已保留超过 7 天', reason: '可先存为资源，再清除临时副本', preview: '敏感资料 · ••••••••', ids: [item.id], action: 'delete' } })
  const duplicates = db.prepare('SELECT hash, GROUP_CONCAT(id) AS ids FROM clipboard_history WHERE is_saved=1 GROUP BY hash HAVING COUNT(*)>1 LIMIT 100').all() as Array<{ hash: string; ids: string }>
  for (const group of duplicates) addInbox({ type: 'organize', sourceId: `duplicate:${group.hash}`, projectId: null, data: { title: '长期保存中有内容相同的副本', reason: '按内容指纹匹配；确认后保留一份', ids: group.ids.split(','), action: 'delete' } })
  const protectedRows = db.prepare('SELECT DISTINCT c.id,c.project_id FROM clipboard_history c JOIN wb_session_clipboard_refs r ON r.clipboard_id=c.id WHERE c.is_saved=0 AND c.is_pinned=0 LIMIT 100').all() as Array<{ id: string; project_id: string | null }>
  for (const item of protectedRows) addInbox({ type: 'organize', sourceId: `protected:${item.id}`, projectId: item.project_id, data: { title: '会话引用资料受保护', reason: '此记录被会话引用，自动保留策略不会清理', ids: [item.id], action: 'protected' } })
  const occurrences = db.prepare(`SELECT o.clipboard_id,o.copied_at,c.project_id FROM clipboard_occurrences o JOIN clipboard_history c ON c.id=o.clipboard_id
    WHERE o.copied_at>? AND c.project_id IS NOT NULL AND c.category NOT IN ('secret','credential','image') ORDER BY o.copied_at LIMIT 2000`).all(now - 86400000) as Array<{ clipboard_id: string; copied_at: number; project_id: string }>
  const buckets = new Map<string, Set<string>>(), repeats = new Map<string, { project: string; ids: string[]; count: number }>()
  for (const row of occurrences) { const key = `${row.project_id}:${Math.floor(row.copied_at / 300000)}`; const ids = buckets.get(key) ?? new Set<string>(); ids.add(row.clipboard_id); buckets.set(key, ids) }
  for (const [bucket, values] of buckets) {
    const ids = [...values].sort(); if (ids.length < 2 || ids.length > 5) continue
    const project = bucket.slice(0, bucket.lastIndexOf(':')), key = `${project}:${ids.join(',')}`, previous = repeats.get(key)
    repeats.set(key, { project, ids, count: (previous?.count || 0) + 1 })
  }
  for (const group of repeats.values()) if (group.count >= 2) addInbox({ type: 'organize', sourceId: `together:${group.project}:${group.ids.join(',')}`, projectId: group.project, data: { title: `${group.ids.length} 段资料经常一起复制`, reason: '24 小时内至少两个 5 分钟窗口中共同出现，可保存为片段', ids: group.ids, action: 'snippet' } })
}

/** Called only by the explicit Inbox action. Never executes model suggestions automatically. */
export function applySuggestion(id: string): void {
  const suggestion = listInbox().find(item => item.id === id)
  if (!suggestion || suggestion.type !== 'organize') throw new Error('建议已失效')
  const items = suggestion.data.ids.map(id => getClipboardItemById(id, false))
  if (items.some(item => !item || item.decryptError)) throw new Error('部分资料已改变，请刷新后重试')
  if (suggestion.data.action === 'snippet') {
    if (items.length < 2 || items.length > 5 || items.some(item => ['secret', 'credential', 'image'].includes(item!.category || ''))) throw new Error('这组资料不适合直接合并片段，请先保存敏感资源')
    const content = items.map(item => item!.content || '').join('\n\n')
    if (content.length > 100000) throw new Error('资料过长，请分批保存')
    createSnippet({ name: suggestion.data.title.slice(0, 80), content })
  } else if (suggestion.data.action === 'delete') {
    if (suggestion.sourceId?.startsWith('ai:') && items.length < 2) throw new Error('重复清理至少需要两份相同内容，建议未执行')
    const duplicates = suggestion.sourceId?.startsWith('duplicate:') || items.length > 1
    if (duplicates && items.some(item => item!.hash !== items[0]!.hash)) throw new Error('内容并非完全相同，无法按重复副本清理')
    deleteClipboardItems(duplicates ? items.slice(1).map(item => item!.id) : items.map(item => item!.id))
  } else throw new Error('此建议不包含可执行的整理操作')
  settleInbox(id, 'done')
}
