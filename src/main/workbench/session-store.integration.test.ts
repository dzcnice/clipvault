import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import { readSessionArchive, saveSessionArchive } from '../../db/workbench-store'
import { sessionOperation, readEncryptedSession } from './session-store'

describe.skipIf(!isSqliteAvailable())('live encrypted session persistence', () => {
  beforeEach(() => { createIntegrationDb(); vault.createVault('Session-Test-Password!') })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb() })
  it('persists each accepted append encrypted, rejects cross-session access and stale cursors', () => {
    const id = 'fixture-session'
    sessionOperation(id, { id, operation: 'create', header: { id, version: 4, isSeeded: false } })
    sessionOperation(id, { id, operation: 'append', cursor: 0, events: [{ seq: 0, type: 'fixture', data: 'LIVE-SESSION-CANARY' }] })
    const raw = getActiveIntegrationDb().prepare('SELECT data FROM wb_settings').all()
    expect(JSON.stringify(raw)).not.toContain('LIVE-SESSION-CANARY')
    expect(readEncryptedSession(id)?.events).toHaveLength(1)
    expect(() => sessionOperation(id, { id: 'other', operation: 'read' })).toThrow('越界')
    expect(() => sessionOperation(id, { id, operation: 'append', cursor: 0, events: [] })).toThrow('版本冲突')
    vault.lockVault(); expect(() => readEncryptedSession(id)).toThrow()
    vault.unlockVault('Session-Test-Password!')
    expect(readEncryptedSession(id)?.events[0]?.data).toBe('LIVE-SESSION-CANARY')
  })
  it('converts an old official v4 archive in memory and retains its original bytes', () => {
    const id = 'legacy-session', encoded = Buffer.from(JSON.stringify({ type: 'session', id, version: 4, isSeeded: false, createdAt: 1, delegationDepth: 0 }) + '\n' + JSON.stringify({ seq: 0, type: 'legacy-fixture' }) + '\n').toString('base64')
    saveSessionArchive(id, { 'sessions/project/id/session.v4.jsonl': encoded })
    expect(readEncryptedSession(id)?.events).toHaveLength(1)
    sessionOperation(id, { id, operation: 'append', cursor: 1, events: [{ seq: 1, type: 'continued-fixture' }] })
    expect(readSessionArchive(id)?.['sessions/project/id/session.v4.jsonl']).toBe(encoded)
    expect(readEncryptedSession(id)?.events).toHaveLength(2)
  })
  it('appends 1,000 encrypted events with stable per-event cost and no history decryption', () => {
    const id = 'append-benchmark'
    sessionOperation(id, { id, operation: 'create', header: { id, version: 4 } })
    const decrypt = vi.spyOn(vault, 'decryptWithDEK')
    const timings: number[] = []
    for (let seq = 0; seq < 1000; seq++) {
      const before = performance.now()
      sessionOperation(id, { id, operation: 'append', cursor: seq, events: [{ seq, type: 'benchmark', data: 'synthetic'.repeat(200) }] })
      timings.push(performance.now() - before)
    }
    expect(decrypt.mock.calls.length).toBe(1000)
    decrypt.mockRestore()
    const median = (values: number[]): number => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!
    const first = median(timings.slice(0, 100)), last = median(timings.slice(900))
    const report = { benchmark: 'encrypted-session-1000', first100MedianMs: first, last100MedianMs: last, totalMs: timings.reduce((a, b) => a + b, 0) }
    mkdirSync(resolve('out/validation'), { recursive: true })
    writeFileSync(resolve('out/validation/session-append.json'), JSON.stringify(report, null, 2))
    expect(last).toBeLessThan(first * 4 + 0.2)
    expect(sessionOperation(id, { id, operation: 'count' })).toEqual({ count: 1000 })
    expect(readEncryptedSession(id)?.events).toHaveLength(1000)
  })
  it('rolls back an entire invalid batch and refuses oversized events without changing the cursor', () => {
    const id = 'atomic-batch'
    sessionOperation(id, { id, operation: 'create', header: { id, version: 4 } })
    expect(() => sessionOperation(id, { id, operation: 'append', cursor: 0, events: [{ seq: 0, type: 'valid' }, { seq: 2, type: 'bad' }] })).toThrow('事件无效')
    expect(() => sessionOperation(id, { id, operation: 'append', cursor: 0, events: [{ seq: 0, type: 'large', data: 'x'.repeat(1_000_001) }] })).toThrow('1 MB')
    expect(sessionOperation(id, { id, operation: 'count' })).toEqual({ count: 0 })
  })
})
