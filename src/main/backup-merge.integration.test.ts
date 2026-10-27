import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSqliteAvailable } from '../../test-setup/integration'
const fixture = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.root }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./workbench/service', () => ({ workbenchBusy: () => false }))
vi.mock('./notification', () => ({ showBackupNotification: () => {} }))
vi.mock('./utils/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }))
import { initDatabase, closeDatabase, getDatabase } from '../db/connection'
import * as vault from './crypto/vault'
import { createCredential, getCredentialById } from '../db/credential-store'
import { addClipboardItem, getClipboardItemById } from '../db/clipboard-store'
import { CredentialType } from '../types/credential'
import { ClipboardContentType } from '../types/clipboard'
import { upsertTOTP, getTOTP } from '../db/credential-totp-store'
import { saveResource, readResourceField, listResources } from '../db/workbench-store'
import { performBackup } from './backup'
import { openMergeBackup } from './backup-merge'
import { readImageBytes } from './storage/image-store'

const syntheticImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')

describe.skipIf(!isSqliteAvailable())('non-destructive backup merge', () => {
  let root = '', backup = '', sourceBytes: Buffer
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cv-merge-')); fixture.root = join(root, 'old'); mkdirSync(fixture.root)
    initDatabase(); vault.createVault('Old-Vault-Password!')
    const credential = createCredential({ name: 'Old account', type: CredentialType.PASSWORD, value: 'OLD-PASSWORD-CANARY', tags: ['old'] })
    upsertTOTP({ credentialId: credential.id, secret: 'JBSWY3DPEHPK3PXP' })
    await addClipboardItem({ type: ClipboardContentType.TEXT, content: 'old clipboard protected content' })
    await addClipboardItem({ type: ClipboardContentType.IMAGE, imageData: `data:image/png;base64,${syntheticImage.toString('base64')}` })
    saveResource({ name: 'Old API', kind: 'api', environment: 'dev', endpoint: 'https://fixture.test/api', fields: [{ name: 'key', value: 'OLD-API-CANARY', secret: true }] })
    const exported = performBackup('Portable-Merge-Password!'); expect(exported.success, exported.message).toBe(true); backup = exported.filePath!; sourceBytes = readFileSync(backup)
    vault.__resetVaultForTests(); closeDatabase()
    fixture.root = join(root, 'new'); mkdirSync(fixture.root); initDatabase(); vault.createVault('New-Different-Vault-Password!')
    createCredential({ name: 'Keep current', type: CredentialType.PASSWORD, value: 'CURRENT-PASSWORD-CANARY' })
  })
  afterEach(() => { vault.__resetVaultForTests(); closeDatabase(); rmSync(root, { recursive: true, force: true }) })
  it('rekeys imported values and TOTP, keeps current rows and source bytes, and deduplicates repeated imports', () => {
    const opened = openMergeBackup(backup, 'Portable-Merge-Password!')
    expect(opened.preview).toMatchObject({ clipboard: 2, credentials: 1, resources: 1, missingImages: 0 })
    expect(opened.merge()).toMatchObject({ clipboard: 2, credentials: 1, resources: 1 })
    const credentials = getDatabase().prepare('SELECT id,name FROM credentials').all() as Array<{ id: string; name: string }>
    expect(credentials).toHaveLength(2)
    const imported = credentials.find(row => row.name === 'Old account')!
    expect(getCredentialById(imported.id)?.value).toBe('OLD-PASSWORD-CANARY')
    expect(getTOTP(imported.id)?.secret).toBe('JBSWY3DPEHPK3PXP')
    const clip = getDatabase().prepare("SELECT id FROM clipboard_history WHERE type='text'").get() as { id: string }
    expect(getClipboardItemById(clip.id)?.content).toBe('old clipboard protected content')
    const occurrences = getDatabase().prepare('SELECT copied_at,is_migration FROM clipboard_occurrences WHERE clipboard_id=?').all(clip.id)
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0]).toMatchObject({ is_migration: 0 })
    expect(readResourceField(listResources()[0]!.id, 'key')).toBe('OLD-API-CANARY')
    const image = getDatabase().prepare("SELECT image_path FROM clipboard_history WHERE type='image'").get() as { image_path: string }
    expect(image.image_path).toContain(fixture.root)
    expect(readImageBytes(image.image_path).bytes).toEqual(syntheticImage)
    expect(readFileSync(image.image_path).includes(syntheticImage)).toBe(false)
    expect(openMergeBackup(backup, 'Portable-Merge-Password!').merge()).toMatchObject({ clipboard: 0, credentials: 0, resources: 0 })
    expect(getDatabase().prepare('SELECT copied_at,is_migration FROM clipboard_occurrences WHERE clipboard_id=?').all(clip.id)).toEqual(occurrences)
    expect(readFileSync(backup)).toEqual(sourceBytes)
  })
  it('rejects the wrong password before changing any destination records', () => {
    expect(() => openMergeBackup(backup, 'wrong')).toThrow()
    expect((getDatabase().prepare('SELECT count(*) AS n FROM credentials').get() as { n: number }).n).toBe(1)
    expect(readFileSync(backup)).toEqual(sourceBytes)
  })
})
