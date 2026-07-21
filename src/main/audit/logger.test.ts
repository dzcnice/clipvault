/**
 * AuditLogger 队列行为测试（不依赖真实 DB）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const inserted: unknown[][] = []

vi.mock('../../db/credential-audit-store', () => ({
  batchInsertAuditRecords: (items: unknown[]) => {
    inserted.push(items)
    return items.length
  },
  listAuditRecords: () => ({ items: [], total: 0 }),
  clearAuditRecords: () => 0
}))

import { AuditLogger } from './logger'

describe('AuditLogger', () => {
  beforeEach(() => {
    inserted.length = 0
  })

  it('record 后 flush 将记录批量写入 store', () => {
    const log = new AuditLogger({ flushIntervalMs: 10, flushThreshold: 100 })
    log.record({ credentialId: 'a', action: 'copy' })
    log.record({ credentialId: 'b', action: 'view' })
    expect(log._queueSize()).toBe(2)
    const n = log.flush()
    expect(n).toBe(2)
    expect(log._queueSize()).toBe(0)
    expect(inserted.length).toBe(1)
    expect((inserted[0] as unknown[]).length).toBe(2)
  })

  it('达到阈值时自动 flush', () => {
    const log = new AuditLogger({ flushIntervalMs: 10_000, flushThreshold: 3 })
    log.record({ credentialId: 'a', action: 'view' })
    log.record({ credentialId: 'b', action: 'view' })
    expect(log._queueSize()).toBe(2)
    log.record({ credentialId: 'c', action: 'view' })
    // 第 3 条触发同步 flush
    expect(log._queueSize()).toBe(0)
    expect(inserted.length).toBe(1)
  })

  it('exportCsv 带 BOM 且包含 header 行', () => {
    const log = new AuditLogger({ flushIntervalMs: 10, flushThreshold: 100 })
    const csv = log.exportCsv()
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('timestamp_iso,action,credential_id')
  })

  it('空 flush 返回 0', () => {
    const log = new AuditLogger()
    expect(log.flush()).toBe(0)
  })
})
