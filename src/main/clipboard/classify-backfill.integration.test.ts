import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../prefs', () => ({ getPrefs: () => ({ maxHistorySize: 5000, historyRetentionDays: 0, imageRetentionDays: 30, historyMaxSizeMb: 0 }) }))
vi.mock('../storage/image-store', () => ({ loadImageAsDataUrl: vi.fn(), deleteImageFile: vi.fn() }))
import * as vault from '../crypto/vault'
import * as clips from '../../db/clipboard-store'
import { backfillClipCategories } from './classify-backfill'
import { ClipboardContentType } from '../../types'
import { saveProject } from '../../db/workbench-store'

describe('offline classification and encrypted backfill', () => {
  beforeEach(() => { createIntegrationDb(); vault.createVault('Synthetic-Password-2026!') })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb(); vi.restoreAllMocks() })
  it('classifies 205 old encrypted records in bounded batches without changing ciphertext or invoking a model', async () => {
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Host offline'))
    const db = getActiveIntegrationDb()
    for (let i = 0; i < 205; i++) await clips.addClipboardItem({ type: ClipboardContentType.TEXT, content: `https://fixture.invalid/page/${i}` })
    db.prepare('UPDATE clipboard_history SET category=NULL').run()
    const old = db.prepare('SELECT id, content_encrypted, content_nonce FROM clipboard_history ORDER BY id').all()
    expect(await backfillClipCategories()).toBe(205)
    expect(db.prepare('SELECT id, content_encrypted, content_nonce FROM clipboard_history ORDER BY id').all()).toEqual(old)
    expect(clips.clipboardGroups().categories.link).toBe(205)
    expect((await clips.searchClipboardHistory({ category: 'link', keyword: '/page/204' })).total).toBe(1)
    const item = clips.listClipboardHistory(undefined, 1).items[0]!
    clips.toggleClipboardPin(item.id)
    const saved = clips.saveClipboardSnapshot(item.id)
    expect(clips.clipboardGroups()).toMatchObject({ total: 205, pinned: 1, saved: 1 })
    expect(clips.getClipboardItemById(saved.id)?.content).toBe(item.content)
    expect(network).not.toHaveBeenCalled()
  })
  it('matches a project without a Host and does not classify while locked', async () => {
    const project = saveProject({ name: 'Fixture', directory: 'C:/fixture-code', description: '', environment: 'dev' })
    const item = await clips.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'Error: C:/fixture-code/src/main.ts failed' })
    expect(item).toMatchObject({ category: 'error', projectId: project.id })
    expect(clips.listClipboardHistory({ projectId: project.id }).total).toBe(1)
    vault.lockVault(); expect(await backfillClipCategories()).toBe(0)
    expect(() => clips.clipboardGroups()).toThrow('E_VAULT_LOCKED')
  })
})
