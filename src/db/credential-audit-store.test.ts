/**
 * credential-audit-store 单元测试（fake DB）
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

interface Row {
  id: string
  credential_id: string
  credential_name: string | null
  actor: string
  action: string
  timestamp: number
  metadata: string | null
}

let rows: Row[] = []

function filterRows(sql: string, args: unknown[]): Row[] {
  const argsArr = [...args]
  let out = rows.slice()
  if (/credential_id = \?/.test(sql)) {
    const v = argsArr.shift()
    out = out.filter((r) => r.credential_id === v)
  }
  if (/action = \?/.test(sql)) {
    const v = argsArr.shift()
    out = out.filter((r) => r.action === v)
  }
  if (/timestamp >= \?/.test(sql)) {
    const v = Number(argsArr.shift())
    out = out.filter((r) => r.timestamp >= v)
  }
  if (/timestamp <= \?/.test(sql)) {
    const v = Number(argsArr.shift())
    out = out.filter((r) => r.timestamp <= v)
  }
  return out
}

function fakeDb() {
  return {
    prepare(sql: string) {
      const s = sql.trim()
      if (s.startsWith('SELECT COUNT')) {
        return {
          get: (...args: unknown[]) => ({ cnt: filterRows(s, args).length })
        }
      }
      if (s.startsWith('SELECT *')) {
        return {
          all: (...args: unknown[]) => {
            const limit = Number(args[args.length - 2]) || 100
            const offset = Number(args[args.length - 1]) || 0
            const filterArgs = args.slice(0, args.length - 2)
            return filterRows(s, filterArgs)
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(offset, offset + limit)
          }
        }
      }
      if (s.startsWith('INSERT')) {
        return {
          run: (...args: unknown[]) => {
            rows.push({
              id: String(args[0]),
              credential_id: String(args[1]),
              credential_name: (args[2] as string | null) ?? null,
              actor: String(args[3]),
              action: String(args[4]),
              timestamp: Number(args[5]),
              metadata: (args[6] as string | null) ?? null
            })
            return { changes: 1 }
          }
        }
      }
      if (s.startsWith('DELETE')) {
        return {
          run: (...args: unknown[]) => {
            if (/credential_id = \?/.test(s)) {
              const v = args[0]
              const before = rows.length
              rows = rows.filter((r) => r.credential_id !== v)
              return { changes: before - rows.length }
            }
            const n = rows.length
            rows = []
            return { changes: n }
          }
        }
      }
      throw new Error('unsupported sql: ' + sql)
    },
    transaction<T extends (...a: unknown[]) => unknown>(fn: T): T {
      return ((...a: unknown[]) => fn(...a)) as T
    }
  }
}

vi.mock('./connection', () => ({
  getDatabase: () => fakeDb(),
  transaction: <T>(fn: () => T) => fn()
}))

import {
  batchInsertAuditRecords,
  clearAuditRecords,
  insertAuditRecord,
  listAuditRecords
} from './credential-audit-store'

describe('credential-audit-store', () => {
  beforeEach(() => {
    rows = []
  })

  it('insert + list 往返', () => {
    insertAuditRecord({ credentialId: 'c1', action: 'copy', timestamp: 100 })
    insertAuditRecord({ credentialId: 'c2', action: 'view', timestamp: 200 })
    const r = listAuditRecords()
    expect(r.total).toBe(2)
    expect(r.items[0]?.timestamp).toBe(200) // 倒序
  })

  it('按 credentialId + action 过滤', () => {
    insertAuditRecord({ credentialId: 'a', action: 'copy', timestamp: 1 })
    insertAuditRecord({ credentialId: 'a', action: 'view', timestamp: 2 })
    insertAuditRecord({ credentialId: 'b', action: 'copy', timestamp: 3 })
    const r = listAuditRecords({ credentialId: 'a', action: 'copy' })
    expect(r.total).toBe(1)
    expect(r.items[0]?.credentialId).toBe('a')
  })

  it('时间窗过滤', () => {
    insertAuditRecord({ credentialId: 'a', action: 'copy', timestamp: 10 })
    insertAuditRecord({ credentialId: 'a', action: 'copy', timestamp: 20 })
    insertAuditRecord({ credentialId: 'a', action: 'copy', timestamp: 30 })
    const r = listAuditRecords({ fromTs: 15, toTs: 25 })
    expect(r.total).toBe(1)
  })

  it('batchInsert 一次入多条', () => {
    const n = batchInsertAuditRecords([
      { credentialId: 'x', action: 'view' },
      { credentialId: 'y', action: 'copy' }
    ])
    expect(n).toBe(2)
    expect(listAuditRecords().total).toBe(2)
  })

  it('clear 按凭证 / 全部', () => {
    insertAuditRecord({ credentialId: 'a', action: 'copy' })
    insertAuditRecord({ credentialId: 'b', action: 'copy' })
    expect(clearAuditRecords('a')).toBe(1)
    expect(listAuditRecords().total).toBe(1)
    expect(clearAuditRecords()).toBe(1)
    expect(listAuditRecords().total).toBe(0)
  })

  it('metadata 序列化为 JSON 字符串', () => {
    insertAuditRecord({
      credentialId: 'a',
      action: 'copy',
      metadata: { source: 'cli' }
    })
    const r = listAuditRecords()
    expect(r.items[0]?.metadata).toBe('{"source":"cli"}')
  })
})
