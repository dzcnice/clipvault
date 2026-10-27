import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { isSqliteAvailable } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.root }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('../workbench/service', () => ({ workbenchBusy: () => false }))
vi.mock('../notification', () => ({ showBackupNotification: () => {} }))
vi.mock('../utils/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }))
vi.mock('../../db/clipboard-store', () => ({ backfillClipboardEncryption: async () => ({ scanned: 0 }) }))
import { initDatabase, closeDatabase, getDatabase } from '../../db/connection'
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { performBackup, restoreFromBackup } from '../backup'
import { readImageBytes } from '../storage/image-store'

describe.skipIf(!isSqliteAvailable())('workbench consistent backup and restore', () => {
  beforeEach(() => { fixture.root = mkdtempSync(join(tmpdir(), 'cv-backup-')); initDatabase(); vault.createVault('Fixture-Password-2026!') })
  afterEach(() => { vault.__resetVaultForTests(); closeDatabase(); rmSync(fixture.root, { recursive: true, force: true }) })
  it('includes WAL-only resources, tasks and encrypted sessions, and restores the original versions', () => {
    getDatabase().pragma('wal_autocheckpoint=0')
    const resource = store.saveResource({ name: 'Fixture', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: 'BACKUP-CANARY-2026', secret: true }] })
    store.saveSessionArchive('fixture-session', { 'sessions/fixture.jsonl': Buffer.from('durable-session-fixture').toString('base64') })
    const backup = performBackup()
    expect(backup.success, backup.message).toBe(true)
    const copied = new Database(backup.filePath!, { readonly: true })
    expect(copied.prepare('SELECT version FROM wb_resources WHERE id=?').get(resource.id)).toEqual({ version: 1 })
    expect(copied.pragma('integrity_check', { simple: true })).toBe('ok')
    copied.close()
    expect(readFileSync(backup.filePath!).includes(Buffer.from('BACKUP-CANARY-2026'))).toBe(false)
    expect(readFileSync(backup.filePath!).includes(Buffer.from('durable-session-fixture'))).toBe(false)
    store.saveResource({ id: resource.id, expectedVersion: 1, name: resource.name, kind: resource.kind, environment: resource.environment, fields: [{ name: 'password', value: 'new-version', secret: true }] })
    expect(restoreFromBackup(backup.filePath!).success).toBe(true)
    expect(vault.unlockVault('Fixture-Password-2026!')).toBe(true)
    expect(store.readResourceField(resource.id, 'password', 1)).toBe('BACKUP-CANARY-2026')
    expect(store.readSessionArchive('fixture-session')).not.toBeNull()
  })
  it('restores encrypted image bytes after the original file is gone', () => {
    const source = join(fixture.root, 'original.png'), image = Buffer.from('IMAGE-BACKUP-CANARY-2026')
    writeFileSync(source, image)
    getDatabase().prepare('INSERT INTO clipboard_history (id,type,preview,hash,size,created_at,image_path) VALUES (?,?,?,?,?,?,?)').run('image-fixture', 'image', 'image', 'fixture-hash', image.length, Date.now(), source)
    const backup = performBackup()
    expect(backup.success, backup.message).toBe(true)
    expect(readFileSync(backup.filePath!).includes(image)).toBe(false)
    unlinkSync(source)
    expect(restoreFromBackup(backup.filePath!).success).toBe(true)
    expect(vault.unlockVault('Fixture-Password-2026!')).toBe(true)
    const row = getDatabase().prepare('SELECT image_path FROM clipboard_history WHERE id=?').get('image-fixture') as { image_path: string }
    expect(row.image_path).not.toBe(source)
    expect(readImageBytes(row.image_path).bytes).toEqual(image)
    expect(readFileSync(row.image_path).includes(image)).toBe(false)
  })
  it('exports an independent password without changing the live vault and rejects a wrong restore password before replacing data', () => {
    const original = store.saveResource({ name: 'original', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: 'PORTABLE-CANARY', secret: true }] })
    const portable = performBackup('Independent-Backup-Password!')
    expect(portable.success, portable.message).toBe(true)
    vault.lockVault(); expect(vault.unlockVault('Fixture-Password-2026!')).toBe(true)
    store.saveResource({ name: 'new-after-export', kind: 'account', environment: 'dev', fields: [] })
    expect(restoreFromBackup(portable.filePath!, 'wrong-password').success).toBe(false)
    expect(store.listResources()).toHaveLength(2)
    expect(restoreFromBackup(portable.filePath!, 'Independent-Backup-Password!').success).toBe(true)
    expect(vault.unlockVault('Independent-Backup-Password!')).toBe(true)
    expect(store.readResourceField(original.id, 'password')).toBe('PORTABLE-CANARY')
    expect(store.listResources()).toHaveLength(1)
  })
  it('rejects a corrupt backup while retaining the active database', () => {
    store.saveResource({ name: 'keep-me', kind: 'note', environment: 'dev', fields: [] })
    const backup = performBackup(), corrupt = join(fixture.root, 'corrupt.cvbackup')
    copyFileSync(backup.filePath!, corrupt)
    writeFileSync(corrupt, 'not a SQLite database')
    expect(restoreFromBackup(corrupt, undefined, true).success).toBe(false)
    expect(store.listResources().map(resource => resource.name)).toEqual(['keep-me'])
  })
})
