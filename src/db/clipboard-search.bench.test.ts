import { describe, expect, it, vi } from 'vitest'
import { cpus, totalmem } from 'node:os'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../test-setup/integration'

vi.mock('./connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../main/prefs', () => ({ getPrefs: () => ({ maxHistorySize: 5000 }), resolveImagesDir: () => '', getDefaultImagesDir: () => '' }))
import * as vault from '../main/crypto/vault'
import { searchClipboardHistory } from './clipboard-store'

describe.skipIf(!isSqliteAvailable())('M1 search baseline', () => {
  it('measures 10,000 encrypted text records with a responsive event loop', async () => {
    const db = createIntegrationDb()
    vault.createVault('BenchmarkFixture-2026!')
    try {
      const insert = db.prepare(`INSERT INTO clipboard_history
        (id, type, preview, hash, size, created_at, content_encrypted, content_nonce, preview_encrypted, preview_nonce, content_plaintext_legacy)
        VALUES (?, 'text', '', ?, ?, ?, ?, ?, ?, ?, 0)`)
      db.transaction(() => {
        for (let i = 0; i < 10000; i++) {
          const content = `Project fixture ${i}: ${'context '.repeat(32)}${i % 100 === 0 ? 'target-needle' : 'ordinary'}`
          const c = vault.encryptBytesWithDEK(content)
          const p = vault.encryptBytesWithDEK(content.slice(0, 100))
          insert.run(`fixture-${i}`, `hash-${i}`, Buffer.byteLength(content), i, c.cipher, c.nonce, p.cipher, p.nonce)
        }
      })()
      const memoryBefore = process.memoryUsage().heapUsed
      const start = performance.now()
      const cold = await searchClipboardHistory({ keyword: 'target-needle' }, 40)
      const coldMs = performance.now() - start
      expect(cold.total).toBe(100)
      const samples: number[] = []
      let ticks = 0
      let previousTick = performance.now()
      let longestGapMs = 0
      const heartbeat = setInterval(() => {
        const now = performance.now()
        longestGapMs = Math.max(longestGapMs, now - previousTick)
        previousTick = now
        ticks++
      }, 5)
      try {
        for (let i = 0; i < 10; i++) {
          const before = performance.now()
          const result = await searchClipboardHistory({ keyword: 'target-needle' }, 40)
          samples.push(performance.now() - before)
          expect(result.items).toHaveLength(40)
        }
      } finally { clearInterval(heartbeat) }
      expect(ticks).toBeGreaterThan(0)
      samples.sort((a, b) => a - b)
      console.log('M1_SEARCH_BASELINE', JSON.stringify({
        cpu: cpus()[0]?.model, memoryGiB: Math.round(totalmem() / 1024 ** 3), node: process.version,
        sqlite: db.prepare('SELECT sqlite_version() AS version').get(), records: 10000, storage: 'in-memory encrypted SQLite fixture',
        coldQueryMs: Math.round(coldMs), warmSamples: samples.map(Math.round), warmP95Ms: Math.round(samples[9]!),
        longestHeartbeatGapMs: Math.round(longestGapMs), heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - memoryBefore) / 1024 ** 2),
        scope: 'store query only; excludes IPC, disk and UI rendering'
      }))
    } finally { vault.__resetVaultForTests(); closeIntegrationDb() }
  })
})
