import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getDatabase } from './connection'
import { encryptWithDEK, decryptWithDEK, isUnlocked } from '../main/crypto/vault'
import { outboundRedact } from '../main/workbench/redaction'
import type { InboxItem, InboxKind } from '../types/inbox'

const changes = new EventEmitter()
export function onInboxChanged(listener: () => void): () => void { changes.on('change', listener); return () => { changes.off('change', listener) } }
function assertOpen(): void { if (!isUnlocked()) throw new Error('请先解锁本地资料库') }
export function mutedInboxRules(): InboxKind[] {
  assertOpen()
  const row = getDatabase().prepare("SELECT data FROM wb_settings WHERE key='inbox:muted'").get() as { data: string } | undefined
  return row ? JSON.parse(decryptWithDEK(row.data)) as InboxKind[] : []
}
export function muteInboxRule(kind: InboxKind, muted = true): void {
  const valid: InboxKind[] = ['error_fix', 'save_resource', 'duplicate_secret', 'organize', 'rotate', 'weak_password']
  if (!valid.includes(kind)) throw new Error('未知建议类型')
  const rules = new Set(mutedInboxRules()); if (muted) rules.add(kind); else rules.delete(kind)
  getDatabase().prepare("INSERT INTO wb_settings(key,data) VALUES('inbox:muted',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(encryptWithDEK(JSON.stringify([...rules])))
  changes.emit('change')
}
export function addInbox(input: Pick<InboxItem, 'type' | 'sourceId' | 'projectId' | 'data'>): string | null {
  assertOpen(); if (mutedInboxRules().includes(input.type)) return null
  const db = getDatabase(), now = Date.now()
  // One open suggestion per source; dismissed/done sources may reappear only after ten minutes.
  if (input.sourceId && db.prepare("SELECT id FROM wb_inbox WHERE source_id=? AND (state='open' OR created_at>?) LIMIT 1").get(input.sourceId, now - 600_000)) return null
  const id = randomUUID(), data = { ...input.data, title: outboundRedact(input.data.title).text, reason: outboundRedact(input.data.reason).text, preview: outboundRedact(input.data.preview || '').text, prompt: outboundRedact(input.data.prompt || '').text }
  db.prepare('INSERT INTO wb_inbox(id,type,source_id,project_id,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, input.type, input.sourceId, input.projectId, encryptWithDEK(JSON.stringify(data)), now, now)
  changes.emit('change'); return id
}
export function listInbox(state: InboxItem['state'] = 'open'): InboxItem[] {
  assertOpen()
  type Row = { id: string; type: InboxKind; source_id: string | null; project_id: string | null; state: InboxItem['state']; data: string; created_at: number; updated_at: number }
  return (getDatabase().prepare('SELECT * FROM wb_inbox WHERE state=? ORDER BY created_at DESC LIMIT 1000').all(state) as Row[]).map(row => ({ id: row.id, type: row.type, sourceId: row.source_id, projectId: row.project_id, state: row.state, createdAt: row.created_at, updatedAt: row.updated_at, data: safeData(JSON.parse(decryptWithDEK(row.data)) as InboxItem['data']) }))
}
function safeData(data: InboxItem['data']): InboxItem['data'] { return { ...data, title: outboundRedact(data.title).text, reason: outboundRedact(data.reason).text, preview: outboundRedact(data.preview || '').text, prompt: outboundRedact(data.prompt || '').text, ...(data.analysis ? { analysis: { ...data.analysis, text: outboundRedact(data.analysis.text || '').text } } : {}) } }
export function getInbox(id: string): InboxItem | undefined { return [...listInbox('open'), ...listInbox('done')].find(item => item.id === id) }
/** 只更新 L2 预分析结果；建议本身的状态不变。 */
export function updateInboxAnalysis(id: string, analysis: NonNullable<InboxItem['data']['analysis']>): void {
  assertOpen()
  const row = getDatabase().prepare('SELECT data FROM wb_inbox WHERE id=?').get(id) as { data: string } | undefined
  if (!row) return
  const data = JSON.parse(decryptWithDEK(row.data)) as InboxItem['data']
  data.analysis = { state: analysis.state, at: analysis.at, ...(analysis.text ? { text: outboundRedact(analysis.text).text.slice(0, 8000) } : {}) }
  getDatabase().prepare('UPDATE wb_inbox SET data=?,updated_at=? WHERE id=?').run(encryptWithDEK(JSON.stringify(data)), Date.now(), id)
  changes.emit('change')
}
export function settleInbox(id: string, state: 'done' | 'dismissed'): void {
  assertOpen(); if (state !== 'done' && state !== 'dismissed') throw new Error('建议状态无效')
  getDatabase().prepare("UPDATE wb_inbox SET state=?,updated_at=? WHERE id=? AND state='open'").run(state, Date.now(), id); changes.emit('change')
}
export function dismissInbox(): void { assertOpen(); getDatabase().prepare("UPDATE wb_inbox SET state='dismissed',updated_at=? WHERE state='open'").run(Date.now()); changes.emit('change') }
