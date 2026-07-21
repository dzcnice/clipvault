/**
 * Sprint 13 / TASK-070 凭证使用审计 Store
 *
 * 对应 migration 011 (credential_audit)。
 * 写入路径由 `main/audit/logger.ts` 的异步队列调用。
 */

import * as crypto from 'crypto'
import { getDatabase } from './connection'
import type {
  CredentialAuditAction,
  CredentialAuditEntry,
  CredentialAuditListParams,
  CredentialAuditListResult,
  RecordAuditInput
} from '../types/audit'

interface AuditRow {
  id: string
  credential_id: string
  credential_name: string | null
  actor: string
  action: string
  timestamp: number
  metadata: string | null
}

function rowToEntry(row: AuditRow): CredentialAuditEntry {
  return {
    id: row.id,
    credentialId: row.credential_id,
    credentialName: row.credential_name,
    actor: row.actor,
    action: row.action as CredentialAuditAction,
    timestamp: row.timestamp,
    metadata: row.metadata
  }
}

export function insertAuditRecord(input: RecordAuditInput): string {
  const db = getDatabase()
  const id = crypto.randomBytes(8).toString('hex')
  const ts = input.timestamp ?? Date.now()
  db.prepare(
    `INSERT INTO credential_audit
      (id, credential_id, credential_name, actor, action, timestamp, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.credentialId,
    input.credentialName ?? null,
    input.actor ?? 'local-user',
    input.action,
    ts,
    input.metadata ? JSON.stringify(input.metadata) : null
  )
  return id
}

export function listAuditRecords(
  params: CredentialAuditListParams = {}
): CredentialAuditListResult {
  const db = getDatabase()
  const where: string[] = []
  const args: unknown[] = []
  if (params.credentialId) {
    where.push('credential_id = ?')
    args.push(params.credentialId)
  }
  if (params.action) {
    where.push('action = ?')
    args.push(params.action)
  }
  if (params.fromTs !== undefined) {
    where.push('timestamp >= ?')
    args.push(params.fromTs)
  }
  if (params.toTs !== undefined) {
    where.push('timestamp <= ?')
    args.push(params.toTs)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (
    db.prepare(`SELECT COUNT(*) AS cnt FROM credential_audit ${whereSql}`).get(...args) as
      | { cnt: number }
      | undefined
  )?.cnt ?? 0

  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000)
  const offset = Math.max(params.offset ?? 0, 0)

  const rows = db
    .prepare(
      `SELECT * FROM credential_audit ${whereSql}
       ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as AuditRow[]

  return { items: rows.map(rowToEntry), total }
}

export function clearAuditRecords(credentialId?: string): number {
  const db = getDatabase()
  if (credentialId) {
    return db
      .prepare('DELETE FROM credential_audit WHERE credential_id = ?')
      .run(credentialId).changes
  }
  return db.prepare('DELETE FROM credential_audit').run().changes
}

/** 批量导入（测试/队列 flush 用） */
export function batchInsertAuditRecords(items: RecordAuditInput[]): number {
  if (items.length === 0) return 0
  const db = getDatabase()
  const stmt = db.prepare(
    `INSERT INTO credential_audit
      (id, credential_id, credential_name, actor, action, timestamp, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  const tx = db.transaction((rows: RecordAuditInput[]) => {
    for (const it of rows) {
      stmt.run(
        crypto.randomBytes(8).toString('hex'),
        it.credentialId,
        it.credentialName ?? null,
        it.actor ?? 'local-user',
        it.action,
        it.timestamp ?? Date.now(),
        it.metadata ? JSON.stringify(it.metadata) : null
      )
    }
  })
  tx(items)
  return items.length
}
