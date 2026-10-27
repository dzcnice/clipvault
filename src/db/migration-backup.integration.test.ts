import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { MIGRATIONS, getCurrentVersion, runMigrations } from './migrations'
import { backupBeforeMigration } from './migration-backup'
import { isSqliteAvailable } from '../../test-setup/integration'

let directory = ''
let db: Database.Database | undefined
afterEach(() => {
  db?.close()
  db = undefined
  if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('clipvault-migration-test-')) rmSync(directory, { recursive: true, force: true })
  directory = ''
})

describe.skipIf(!isSqliteAvailable())('M1 upgrade backup and migration', () => {
  it('backs up committed WAL data before upgrading v23, retaining old timestamps and credentials', () => {
    directory = mkdtempSync(join(tmpdir(), 'clipvault-migration-test-'))
    db = new Database(join(directory, 'fixture.db'))
    db.pragma('journal_mode = WAL')
    runMigrations(db, MIGRATIONS.slice(0, 23))
    db.prepare("INSERT INTO clipboard_history (id, type, content, preview, hash, size, created_at, source_app) VALUES ('legacy', 'text', 'fixture-old', 'fixture-old', 'old', 11, 1234, 'Editor')").run()
    // Opaque fixture payload; verify migration does not rewrite the credential table.
    db.prepare("INSERT INTO credentials (id, name, type, value, created_at, updated_at) VALUES ('credential-fixture', 'Fixture', 'custom', 'fake-encrypted-payload', 1, 1)").run()
    const before = db.prepare('SELECT * FROM credentials').all()
    const originalImage = join(directory, 'original.png')
    writeFileSync(originalImage, 'fixture-image-bytes')
    db.prepare('UPDATE clipboard_history SET image_path = ?').run(originalImage)
    const backup = backupBeforeMigration(db)
    expect(backup).not.toBeNull()
    const attachmentManifest = JSON.parse(readFileSync(join(`${backup}.attachments`, 'manifest.json'), 'utf8')) as { attachments: Array<{ source: string; file: string }> }
    expect(attachmentManifest.attachments[0]?.source).toBe(originalImage)
    expect(readFileSync(join(`${backup}.attachments`, attachmentManifest.attachments[0]!.file), 'utf8')).toBe('fixture-image-bytes')
    const snapshot = new Database(backup!, { readonly: true })
    try {
      expect(getCurrentVersion(snapshot)).toBe(23)
      expect(snapshot.prepare('SELECT content FROM clipboard_history').get()).toEqual({ content: 'fixture-old' })
      expect(snapshot.prepare('SELECT * FROM credentials').all()).toEqual(before)
    } finally { snapshot.close() }
    runMigrations(db)
    expect(getCurrentVersion(db)).toBe(MIGRATIONS.at(-1)!.version)
    expect(db.prepare('SELECT created_at, last_copied_at, copy_count, first_seen_known FROM clipboard_history').get()).toEqual({ created_at: 1234, last_copied_at: 1234, copy_count: 1, first_seen_known: 0 })
    expect(db.prepare('SELECT copied_at, is_migration FROM clipboard_occurrences').get()).toEqual({ copied_at: 1234, is_migration: 1 })
    expect(db.prepare('SELECT * FROM credentials').all()).toEqual(before)
    expect(runMigrations(db).applied).toEqual([])
    expect(backupBeforeMigration(db)).toBeNull()
  })

  it('backup failure leaves schema and history unchanged', () => {
    directory = mkdtempSync(join(tmpdir(), 'clipvault-migration-test-'))
    db = new Database(join(directory, 'fixture.db'))
    runMigrations(db, MIGRATIONS.slice(0, 23))
    writeFileSync(join(directory, 'migration-backups'), 'fixture blocks destination')
    expect(() => backupBeforeMigration(db!)).toThrow()
    expect(getCurrentVersion(db)).toBe(23)
    const columns = db.prepare('PRAGMA table_info(clipboard_history)').all() as Array<{ name: string }>
    expect(columns.some(c => c.name === 'is_saved')).toBe(false)
  })

  it('rejects a future schema instead of silently opening an incompatible database', () => {
    db = new Database(':memory:')
    db.pragma('user_version = 999')
    expect(() => backupBeforeMigration(db!)).toThrow('高于当前应用支持')
  })
})
