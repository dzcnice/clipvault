import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../prefs', () => ({ getPrefs: () => ({ maxHistorySize: 5000, historyRetentionDays: 0, imageRetentionDays: 30, historyMaxSizeMb: 0 }) }))
vi.mock('../storage/image-store', () => ({ deleteImageFile: vi.fn(), loadImageAsDataUrl: vi.fn() }))
import * as vault from '../crypto/vault'
import * as clips from '../../db/clipboard-store'
import { ClipboardContentType } from '../../types'
import { verifyRuntime } from '../workbench/runtime'

beforeEach(() => { createIntegrationDb(); vault.createVault('Offline-fixture-2026!') })
afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb(); vi.restoreAllMocks() })
it('keeps local capture, history, filters, snapshots and snippets usable with no Harness runtime or model', async () => {
  await expect(verifyRuntime(join(tmpdir(), 'missing-harness-' + randomUUID()))).rejects.toThrow()
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
  const first = (await clips.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'offline fixture note', sourceApp: 'Editor' }))!
  const again = await clips.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'offline fixture note', sourceApp: 'Terminal' })
  const html = await clips.addClipboardItem({ type: ClipboardContentType.HTML, content: '<div>offline content</div>' })
  expect(again).toMatchObject({ id: first.id, copyCount: 2 })
  expect(clips.getClipboardOccurrences(first.id)).toHaveLength(2)
  expect((await clips.searchClipboardHistory({ keyword: 'fixture', sourceApp: 'Editor' })).total).toBe(1)
  expect(clips.getClipboardItemById(html!.id)?.content).toBe('<div>offline content</div>')
  const saved = clips.saveClipboardSnapshot(first.id), snippet = clips.createSnippet({ name: 'offline phrase', content: 'Hello {clip}' })
  clips.toggleClipboardPin(first.id); expect(clips.cleanupOldHistory(0)).toBe(1)
  expect(clips.getClipboardItemById(first.id)?.content).toBe('offline fixture note')
  expect(clips.getClipboardItemById(saved.id)?.isSaved).toBe(true)
  expect(clips.getClipboardItemById(snippet.id)?.isSnippet).toBe(true)
  expect(getActiveIntegrationDb().prepare('SELECT content FROM clipboard_history WHERE id=?').get(first.id)).toEqual({ content: null })
  expect(network).not.toHaveBeenCalled()
})
