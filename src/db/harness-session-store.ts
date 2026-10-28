import { getDatabase, transaction } from './connection'
import { readSessionArchive } from './workbench-store'
import { encryptWithDEK, decryptWithDEK, isUnlocked } from '../main/crypto/vault'

export type StoredEvent = { seq: number; type: string; [key: string]: unknown }
export interface SessionDocument { header: { id: string; version: number; isSeeded?: boolean }; events: StoredEvent[] }
type Row = { id: string; project_id: string | null; header: string; data: string; event_count: number; created_at: number; updated_at: number }
const encrypt = (value: unknown): string => encryptWithDEK(JSON.stringify(value))
const decrypt = <T>(value: string): T => JSON.parse(decryptWithDEK(value)) as T
const row = (id: string): Row | undefined => {
  if (!isUnlocked()) throw new Error('请先解锁本地资料库')
  return getDatabase().prepare('SELECT * FROM wb_sessions WHERE id=?').get(id) as Row | undefined
}
function validateHeader(id: string, header: SessionDocument['header']): void {
  if (!header || header.id !== id || header.version !== 4 || header.isSeeded) throw new Error('会话头无效')
}
function validateEvents(events: StoredEvent[], cursor: number): void {
  if (cursor + events.length > 50_000) throw new Error('会话事件达到上限，请新建会话')
  for (const [index, event] of events.entries()) {
    if (!event || event.seq !== cursor + index || typeof event.type !== 'string') throw new Error('会话事件无效')
    if (Buffer.byteLength(JSON.stringify(event)) > 1_000_000) throw new Error('单个会话事件超过 1 MB')
  }
}
function append(id: string, cursor: number, events: StoredEvent[]): void {
  validateEvents(events, cursor)
  const insert = getDatabase().prepare('INSERT INTO wb_session_events (session_id,seq,event) VALUES (?,?,?)')
  for (const event of events) insert.run(id, event.seq, encrypt(event))
  getDatabase().prepare('UPDATE wb_sessions SET event_count=?,updated_at=? WHERE id=?').run(cursor + events.length, Date.now(), id)
}
function migrateLegacy(id: string): void {
  if (row(id)) return
  const archive = readSessionArchive(id)
  if (!archive) return
  let document: SessionDocument | undefined
  if (archive['workbench-session.jsonl']) document = JSON.parse(Buffer.from(archive['workbench-session.jsonl'], 'base64').toString('utf8')) as SessionDocument
  else for (const [name, encoded] of Object.entries(archive)) {
    if (!name.endsWith('.v4.jsonl')) continue
    const lines = Buffer.from(encoded, 'base64').toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line))
    const physical = lines.shift()
    if (physical?.type !== 'session' || physical.id !== id || physical.version !== 4 || physical.isSeeded) continue
    const { type: _type, ...header } = physical
    document = { header, events: lines }
    break
  }
  if (!document || !Array.isArray(document.events)) throw new Error('旧会话格式无法安全转换，原归档已保留')
  const saved = document
  validateHeader(id, saved.header); validateEvents(saved.events, 0)
  transaction(() => {
    if (row(id)) return
    const now = Date.now()
    getDatabase().prepare('INSERT INTO wb_sessions (id,header,data,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run(id, encrypt(saved.header), encrypt({ legacy: true }), now, now)
    append(id, 0, saved.events)
  })
}
export function readEncryptedSession(id: string): SessionDocument | null {
  migrateLegacy(id)
  const saved = row(id)
  if (!saved) return null
  const header = decrypt<SessionDocument['header'] | null>(saved.header)
  if (!header) return null
  const events = (getDatabase().prepare('SELECT event FROM wb_session_events WHERE session_id=? ORDER BY seq').all(id) as Array<{ event: string }>).map(item => decrypt<StoredEvent>(item.event))
  if (events.length !== saved.event_count) throw new Error('会话事件数量不一致')
  validateHeader(id, header); validateEvents(events, 0)
  return { header, events }
}
export function sessionOperation(id: string, input: Record<string, unknown>): unknown {
  if (input.id !== id) throw new Error('会话访问越界')
  migrateLegacy(id)
  if (input.operation === 'read') return readEncryptedSession(id)
  if (input.operation === 'count') return { count: row(id)?.event_count ?? 0 }
  return transaction(() => {
    const saved = row(id)
    if (input.operation === 'create') {
      if (saved && decrypt(saved.header) !== null) throw new Error('会话已存在')
      const header = input.header as SessionDocument['header']; validateHeader(id, header)
      const now = Date.now()
      if (saved) getDatabase().prepare('UPDATE wb_sessions SET header=?,updated_at=? WHERE id=?').run(encrypt(header), now, id)
      else getDatabase().prepare('INSERT INTO wb_sessions (id,header,data,created_at,updated_at) VALUES (?,?,?,?,?)').run(id, encrypt(header), encrypt({ legacy: true }), now, now)
      return { persisted: true, count: 0 }
    }
    if (input.operation !== 'append') throw new Error('未知会话操作')
    if (!saved || decrypt(saved.header) === null || !Number.isSafeInteger(input.cursor) || input.cursor !== saved.event_count || !Array.isArray(input.events)) throw new Error('会话写入版本冲突')
    if (input.events.length > 1000) throw new Error('单次会话事件过多')
    append(id, saved.event_count, input.events as StoredEvent[])
    return { persisted: true, count: saved.event_count + input.events.length }
  })
}
/** A Host owns its root and only direct spawned children. No arbitrary session id grants access. */
export function sessionFamilyOperation(rootId: string, input: Record<string, unknown>): unknown {
  const children = sessionReceipts(rootId).filter(item => item.operation === 'child_session')
  if (input.operation === 'list') {
    if (input.id !== rootId) throw new Error('会话目录访问越界')
    return [rootId, ...children.map(item => item.id)]
  }
  const id = input.id
  if (id === rootId) return sessionOperation(rootId, input)
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('子会话 ID 无效')
  if (!children.some(item => item.id === id)) {
    const header = input.header as { parentSession?: string; origin?: string; delegationDepth?: number; cwd?: string } | undefined
    const root = readEncryptedSession(rootId)?.header as { cwd?: string } | undefined
    if (input.operation !== 'create' || !root || !header || header.parentSession !== rootId || header.origin !== 'subagent' || header.delegationDepth !== 1 || header.cwd !== root.cwd || children.length >= 20 || row(id)) throw new Error('子会话访问越界')
    return transaction(() => {
      const result = sessionOperation(id, input)
      saveSessionReceipt(rootId, id, 'child_session', 'created', { parentId: rootId })
      return result
    })
  }
  return sessionOperation(id, input)
}
export function createSessionRecord(id: string, projectId: string, data: unknown): void {
  const now = Date.now()
  getDatabase().prepare('INSERT INTO wb_sessions (id,project_id,header,data,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(id, projectId, encrypt(null), encrypt(data), now, now)
}
export function sessionRecords<T>(): Array<T & { id: string; projectId: string; createdAt: number; updatedAt: number }> {
  if (!isUnlocked()) throw new Error('请先解锁本地资料库')
  return (getDatabase().prepare('SELECT * FROM wb_sessions WHERE project_id IS NOT NULL ORDER BY updated_at DESC').all() as Row[]).map(item => ({ ...decrypt<T>(item.data), id: item.id, projectId: item.project_id!, createdAt: item.created_at, updatedAt: item.updated_at }))
}
export function updateSessionRecord(id: string, data: unknown): void {
  if (!row(id)) throw new Error('会话不存在')
  getDatabase().prepare('UPDATE wb_sessions SET data=?,updated_at=? WHERE id=?').run(encrypt(data), Date.now(), id)
}
export function saveSessionReceipt(sessionId: string, id: string, operation: string, state: string, data: unknown): void {
  getDatabase().prepare('INSERT INTO wb_session_receipts (id,session_id,operation,state,data,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data,updated_at=excluded.updated_at')
    .run(id, sessionId, operation, state, encrypt(data), Date.now())
}
export function sessionReceipts(sessionId: string): Array<{ id: string; operation: string; state: string; data: Record<string, unknown> }> {
  return (getDatabase().prepare('SELECT * FROM wb_session_receipts WHERE session_id=? ORDER BY updated_at').all(sessionId) as Array<{ id: string; operation: string; state: string; data: string }>).map(item => ({ ...item, data: decrypt<Record<string, unknown>>(item.data) }))
}
/** 按 ID 读取单条会话回执（例如识图图片），不解密其他回执。 */
export function sessionReceipt(sessionId: string, id: string): { id: string; operation: string; state: string; data: Record<string, unknown> } | undefined {
  const row = getDatabase().prepare('SELECT * FROM wb_session_receipts WHERE session_id=? AND id=?').get(sessionId, id) as { id: string; operation: string; state: string; data: string } | undefined
  return row ? { ...row, data: decrypt<Record<string, unknown>>(row.data) } : undefined
}

/** 彻底删除一个会话及其子会话：事件、回执、提醒、剪贴板引用一起删，在同一事务里完成。 */
export function deleteSessionFamily(rootId: string): string[] {
  const children = sessionReceipts(rootId).filter(item => item.operation === 'child_session').map(item => item.id)
  const ids = [...children, rootId]
  transaction(() => {
    const db = getDatabase()
    for (const id of ids) {
      for (const table of ['wb_schedules', 'wb_session_clipboard_refs', 'wb_session_receipts', 'wb_session_events']) db.prepare(`DELETE FROM ${table} WHERE session_id=?`).run(id)
      db.prepare('DELETE FROM wb_sessions WHERE id=?').run(id)
    }
  })
  return ids
}
