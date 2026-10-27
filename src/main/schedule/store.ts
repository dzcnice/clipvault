import { isDeepStrictEqual } from 'node:util'
import { getDatabase } from '../../db/connection'
import { encryptWithDEK, decryptWithDEK, isUnlocked } from '../crypto/vault'

/** The official ScheduleRecord shape, kept opaque here; it is built and validated in the Harness runtime. */
export type ScheduleRecord = { id: string; kind: string; title: string; prompt: string; scheduledAt: string; [key: string]: unknown }
export interface ScheduleDelivery { scheduledAt: string; deliveredAt: string; messageId: string; prompt?: string }
interface Stored { record: ScheduleRecord; lastDelivery?: ScheduleDelivery; history: ScheduleDelivery[]; earlierRecordsPruned?: boolean }
type Row = { id: string; session_id: string; status: 'active' | 'inactive'; next_at: number | null; data: string; created_at: number; updated_at: number }
export interface ScheduleEntry extends Stored { id: string; sessionId: string; status: 'active' | 'inactive'; nextAt: number | null; createdAt: number }

const KINDS = new Set(['after', 'at', 'every', 'daily', 'weekly', 'cron'])
const HISTORY_DAYS = 30, HISTORY_RECORDS = 200, MAX_PER_SESSION = 50
function open(): void { if (!isUnlocked()) throw new Error('请先解锁本地资料库') }
function entry(row: Row): ScheduleEntry { return { ...JSON.parse(decryptWithDEK(row.data)) as Stored, id: row.id, sessionId: row.session_id, status: row.status, nextAt: row.next_at, createdAt: row.created_at } }
function write(id: string, stored: Stored, status: 'active' | 'inactive', nextAt: number | null): void {
  getDatabase().prepare('UPDATE wb_schedules SET data=?,status=?,next_at=?,updated_at=? WHERE id=?').run(encryptWithDEK(JSON.stringify(stored)), status, nextAt, Date.now(), id)
}
function target(record: ScheduleRecord): number {
  const at = Date.parse(record.scheduledAt)
  if (!Number.isFinite(at)) throw new Error('提醒时间无效')
  return at
}
/** Minimal structural check; the full rule validation already happened through the official builders. */
export function checkRecord(value: unknown): ScheduleRecord {
  const record = value as ScheduleRecord
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !/^schedule-[0-9a-f-]{36}$/.test(record.id) || !KINDS.has(record.kind)
    || typeof record.title !== 'string' || !record.title.trim() || record.title.length > 120 || typeof record.prompt !== 'string' || !record.prompt.trim() || record.prompt.length > 20_000) throw new Error('提醒记录无效')
  target(record)
  if (JSON.stringify(record).length > 40_000) throw new Error('提醒记录过大')
  return record
}

export function createSchedule(sessionId: string, value: unknown): ScheduleRecord {
  open()
  const record = checkRecord(value), now = Date.now()
  const count = (getDatabase().prepare("SELECT COUNT(*) AS n FROM wb_schedules WHERE session_id=? AND status='active'").get(sessionId) as { n: number }).n
  if (count >= MAX_PER_SESSION) throw new Error('这个会话的提醒已达到上限')
  getDatabase().prepare('INSERT INTO wb_schedules (id,session_id,status,next_at,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(record.id, sessionId, 'active', target(record), encryptWithDEK(JSON.stringify({ record, history: [] } satisfies Stored)), now, now)
  return record
}
export function sessionSchedules(sessionId: string, status?: 'active' | 'inactive'): ScheduleEntry[] {
  open()
  const rows = getDatabase().prepare(`SELECT * FROM wb_schedules WHERE session_id=?${status ? ' AND status=?' : ''} ORDER BY created_at`).all(...(status ? [sessionId, status] : [sessionId])) as Row[]
  return rows.map(entry)
}
export function getSchedule(sessionId: string, id: string): ScheduleEntry | undefined {
  open()
  const row = getDatabase().prepare('SELECT * FROM wb_schedules WHERE id=? AND session_id=?').get(id, sessionId) as Row | undefined
  return row ? entry(row) : undefined
}
/** Compare-and-set: the stored record must still equal what the tool read. */
export function replaceSchedule(sessionId: string, id: string, previous: unknown, value: unknown): { id: string; updated: boolean; record?: ScheduleRecord; code?: string } {
  const current = getSchedule(sessionId, id)
  if (!current) return { id, updated: false, code: 'schedule_not_found' }
  if (current.status === 'inactive') return { id, updated: false, code: 'schedule_ended' }
  if (!isDeepStrictEqual(current.record, previous)) return { id, updated: false, code: 'schedule_conflict' }
  const record = checkRecord(value)
  if (record.id !== id) throw new Error('提醒 ID 不能修改')
  write(id, { ...current, record }, 'active', target(record))
  return { id, updated: true, record }
}
export function deleteSchedule(sessionId: string, id: string): { id: string; deleted: boolean; code?: string } {
  open()
  const changes = getDatabase().prepare('DELETE FROM wb_schedules WHERE id=? AND session_id=?').run(id, sessionId).changes
  return changes ? { id, deleted: true } : { id, deleted: false, code: 'schedule_not_found' }
}
export function scheduleHistory(sessionId: string, id: string, limit: unknown, before?: unknown): { records: ScheduleDelivery[]; earlierRecordsUnavailable: boolean; earlierRecordsPruned: boolean; nextBefore?: string } {
  if (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100) throw new Error('invalid_rule')
  const current = getSchedule(sessionId, id)
  if (!current) throw new Error('schedule_not_found')
  const newest = [...current.history].reverse()
  const start = typeof before === 'string' ? newest.findIndex(item => item.messageId === before) + 1 : 0
  const records = newest.slice(start, start + (limit as number))
  return { records, earlierRecordsUnavailable: false, earlierRecordsPruned: current.earlierRecordsPruned === true, ...(start + records.length < newest.length && records.length ? { nextBefore: records.at(-1)!.messageId } : {}) }
}
export function dueSchedules(now: number): ScheduleEntry[] {
  open()
  return (getDatabase().prepare("SELECT * FROM wb_schedules WHERE status='active' AND next_at<=? ORDER BY next_at LIMIT 200").all(now) as Row[]).map(entry)
}
export function nextDueAt(): number | null {
  open()
  return (getDatabase().prepare("SELECT MIN(next_at) AS next FROM wb_schedules WHERE status='active'").get() as { next: number | null }).next
}
/** Delivery could not be handed to the session yet (busy, locked); keep the record, retry later. */
export function postponeSchedule(id: string, until: number): void { getDatabase().prepare('UPDATE wb_schedules SET next_at=?,updated_at=? WHERE id=?').run(until, Date.now(), id) }
export function endSchedule(id: string): void { getDatabase().prepare("UPDATE wb_schedules SET status='inactive',next_at=NULL,updated_at=? WHERE id=?").run(Date.now(), id) }
/** Record one acknowledged delivery, advance a recurring target, and prune history to 30 days / 200 records. */
export function recordDelivery(item: ScheduleEntry, delivery: ScheduleDelivery, nextScheduledAt: string | null): void {
  const cutoff = Date.now() - HISTORY_DAYS * 86_400_000
  const history = [...item.history, delivery].filter(entry => Date.parse(entry.deliveredAt) >= cutoff).slice(-HISTORY_RECORDS)
  const pruned = item.earlierRecordsPruned === true || history.length < item.history.length + 1
  const record = nextScheduledAt ? { ...item.record, scheduledAt: nextScheduledAt } : item.record
  write(item.id, { record, lastDelivery: { scheduledAt: delivery.scheduledAt, deliveredAt: delivery.deliveredAt, messageId: delivery.messageId }, history, ...(pruned ? { earlierRecordsPruned: true } : {}) },
    nextScheduledAt ? 'active' : 'inactive', nextScheduledAt ? Date.parse(nextScheduledAt) : null)
}
