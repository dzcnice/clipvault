import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../test-setup/integration'
import { ClipboardContentType } from '../types'

const prefs = vi.hoisted(() => ({ maxHistorySize: 5000, historyRetentionDays: 0, imageRetentionDays: 30, historyMaxSizeMb: 0 }))
vi.mock('./connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../main/prefs', () => ({ getPrefs: () => prefs }))
vi.mock('../main/storage/image-store', () => ({
  saveImageDataUrl: vi.fn(async () => '/fixture/original.png'),
  copyImageFile: vi.fn(() => '/fixture/snapshot.png'),
  loadImageAsDataUrl: vi.fn(() => 'data:image/png;base64,AA=='),
  deleteImageFile: vi.fn()
}))
import * as vault from '../main/crypto/vault'
import * as images from '../main/storage/image-store'
import * as store from './clipboard-store'

describe.skipIf(!isSqliteAvailable())('M1 clipboard history (real SQLite and vault)', () => {
  beforeEach(() => {
    createIntegrationDb()
    vault.createVault('FixturePassword-2026!')
    Object.assign(prefs, { maxHistorySize: 5000, historyRetentionDays: 0, imageRetentionDays: 30, historyMaxSizeMb: 0 })
    vi.clearAllMocks()
  })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb(); vi.restoreAllMocks() })

  it('repeated captures preserve first time, update recency/source, and do not inflate usage', async () => {
    const time = vi.spyOn(Date, 'now').mockReturnValue(10000)
    const first = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'reusable', sourceApp: 'Editor' }))!
    time.mockReturnValue(20000)
    const second = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'reusable', sourceApp: 'Browser' }))!
    expect(second).toMatchObject({ id: first.id, createdAt: 10000, lastCopiedAt: 20000, firstSeenKnown: true, copyCount: 2, useCount: 0, sourceApp: 'Browser' })
    expect(store.getClipboardOccurrences(first.id).map(r => r.sourceApp)).toEqual(['Browser', 'Editor'])
    expect(store.listClipboardHistory({ sourceApp: 'Editor' }).total).toBe(1)
    store.recordClipboardUsage(first.id)
    expect(store.getClipboardItemById(first.id)).toMatchObject({ copyCount: 2, useCount: 1 })
    expect(store.listClipboardHistory().total).toBe(1)
  })

  it('does not merge different content types or a saved copy', async () => {
    const first = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'same' }))!
    const html = (await store.addClipboardItem({ type: ClipboardContentType.HTML, content: 'same' }))!
    const saved = store.saveClipboardSnapshot(first.id)
    expect(html.id).not.toBe(first.id)
    expect(saved.id).not.toBe(first.id)
    expect(store.saveClipboardSnapshot(first.id).id).toBe(saved.id)
    expect((await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'same' }))?.id).toBe(first.id)
    expect(store.getClipboardItemById(saved.id)?.copyCount).toBe(1)
  })

  it('snapshot retains ciphertext, tags and occurrence records when original is deleted', async () => {
    const original = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'snapshot-value' }))!
    const db = getActiveIntegrationDb()
    db.prepare('INSERT INTO clipboard_tags VALUES (?, ?)').run(original.id, 'project-a')
    const saved = store.saveClipboardSnapshot(original.id)
    expect(saved).toMatchObject({ isSaved: true, content: 'snapshot-value', tags: ['project-a'], savedFromId: original.id })
    expect(db.prepare('SELECT content, preview FROM clipboard_history WHERE id = ?').get(saved.id)).toEqual({ content: null, preview: '' })
    expect(store.clearClipboardHistory()).toBe(1)
    expect(store.getClipboardOccurrences(original.id)).toHaveLength(0)
    expect(store.getClipboardItemById(saved.id)?.content).toBe('snapshot-value')
    expect(store.getClipboardOccurrences(saved.id)).toHaveLength(1)
    expect(store.listClipboardHistory({ savedOnly: false }).total).toBe(0)
    expect(store.listClipboardHistory({ savedOnly: true }).total).toBe(1)
  })

  it('saved image owns a file independently of its original', async () => {
    const original = (await store.addClipboardItem({ type: ClipboardContentType.IMAGE, imageData: 'data:image/png;base64,AA==' }))!
    const saved = store.saveClipboardSnapshot(original.id)
    expect(saved.imagePath).toBe('/fixture/snapshot.png')
    store.deleteClipboardItem(original.id)
    expect(images.deleteImageFile).toHaveBeenCalledWith('/fixture/original.png')
    expect(images.deleteImageFile).not.toHaveBeenCalledWith('/fixture/snapshot.png')
    expect(store.getClipboardItemById(saved.id)).not.toBeNull()
  })

  it('deduplicates concurrent image saves and retains the earliest observed capture', async () => {
    const time = vi.spyOn(Date, 'now').mockReturnValue(10000)
    let finishFirst!: (path: string) => void
    vi.mocked(images.saveImageDataUrl).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
      .mockResolvedValueOnce('/fixture/second.png')
    const input = { type: ClipboardContentType.IMAGE, imageData: 'data:image/png;base64,AA==' }
    const first = store.addClipboardItem(input)
    time.mockReturnValue(20000)
    const second = (await store.addClipboardItem(input))!
    finishFirst('/fixture/first.png')
    const combined = await first
    expect(combined).toMatchObject({ id: second.id, createdAt: 10000, lastCopiedAt: 20000, copyCount: 2 })
    expect(store.listClipboardHistory().total).toBe(1)
    expect(images.deleteImageFile).toHaveBeenCalledWith('/fixture/first.png')
    expect(images.deleteImageFile).not.toHaveBeenCalledWith('/fixture/second.png')
  })

  it('cleans a just-written image if the vault locks during its asynchronous save', async () => {
    vi.mocked(images.saveImageDataUrl).mockImplementationOnce(async () => { vault.lockVault(); return '/fixture/rejected.png' })
    await expect(store.addClipboardItem({ type: ClipboardContentType.IMAGE, imageData: 'data:image/png;base64,AA==' })).rejects.toThrow()
    expect(images.deleteImageFile).toHaveBeenCalledWith('/fixture/rejected.png')
    expect(getActiveIntegrationDb().prepare('SELECT COUNT(*) AS n FROM clipboard_history').get()).toEqual({ n: 0 })
  })

  it('cleanup protects every pinned row, saved row and snippet without a hidden pin cap', async () => {
    const db = getActiveIntegrationDb()
    const insert = db.prepare("INSERT INTO clipboard_history (id, type, content, preview, hash, size, created_at, is_pinned) VALUES (?, 'text', 'fixture', 'fixture', ?, 7, 1, 1)")
    db.transaction(() => { for (let i = 0; i < 205; i++) insert.run(`pin-${i}`, `pin-${i}`) })()
    const original = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'saved' }))!
    const saved = store.saveClipboardSnapshot(original.id)
    const snippet = store.createSnippet({ name: 'snippet', content: 'template' })
    expect(store.cleanupOldHistory(0)).toBe(1)
    expect(store.listClipboardHistory({ pinnedOnly: true }, 500).total).toBe(205)
    expect(store.getClipboardItemById(saved.id)).not.toBeNull()
    expect(store.getClipboardItemById(snippet.id)).not.toBeNull()
    expect(store.deleteClipboardOlderThan(Date.now() + 1)).toBe(0)
  })

  it('retention uses recency, image age and content byte budget', async () => {
    const db = getActiveIntegrationDb()
    const original = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'recent' }))!
    const image = (await store.addClipboardItem({ type: ClipboardContentType.IMAGE, imageData: 'data:image/png;base64,AA==' }))!
    const old = Date.now() - 40 * 86400000
    db.prepare('UPDATE clipboard_history SET created_at = ?, last_copied_at = ? WHERE id = ?').run(old, old, image.id)
    db.prepare('UPDATE clipboard_history SET created_at = ? WHERE id = ?').run(old, original.id)
    prefs.historyRetentionDays = 7
    expect(store.cleanupOldHistory()).toBe(1)
    expect(store.getClipboardItemById(original.id)).not.toBeNull()
    db.prepare('UPDATE clipboard_history SET size = ? WHERE id = ?').run(2 * 1024 * 1024, original.id)
    prefs.historyMaxSizeMb = 1
    expect(store.cleanupOldHistory()).toBe(1)
  })

  it('finds full content beyond first page and returns consistent totals, ordering and offsets', async () => {
    const time = vi.spyOn(Date, 'now').mockReturnValue(10000)
    const needle = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'x'.repeat(150) + 'deep-needle' }))!
    for (let i = 0; i < 140; i++) {
      time.mockReturnValue(20000 + i)
      await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: `item-${i}` })
    }
    expect(store.listClipboardHistory(undefined, 40).items.some(i => i.id === needle.id)).toBe(false)
    const result = await store.searchClipboardHistory({ keyword: 'deep-needle' }, 40)
    expect(result.total).toBe(1)
    expect(result.items[0]?.id).toBe(needle.id)
    const page = await store.searchClipboardHistory({ keyword: 'item-' }, 5, 40)
    expect(page.total).toBe(140)
    expect(page.items.map(i => i.content)).toEqual(['item-99', 'item-98', 'item-97', 'item-96', 'item-95'])
    expect((await store.searchClipboardHistory({ keyword: 'absent' })).total).toBe(0)
  })

  it('yields between query batches and cancels obsolete searches', async () => {
    const db = getActiveIntegrationDb()
    const insert = db.prepare("INSERT INTO clipboard_history (id, type, content, preview, hash, size, created_at) VALUES (?, 'text', 'needle', 'needle', ?, 6, 1)")
    db.transaction(() => { for (let i = 0; i < 150; i++) insert.run(String(i), String(i)) })()
    const controller = new AbortController()
    const pending = store.searchClipboardHistory({ keyword: 'needle' }, 10, 0, controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('查询已取消')
    vault.lockVault()
    await expect(store.addClipboardItem({ type: ClipboardContentType.TEXT, content: 'locked' })).rejects.toThrow('E_VAULT_LOCKED')
  })

  it('preserves HUD pinyin matching without widening literal history searches', async () => {
    const item = (await store.addClipboardItem({ type: ClipboardContentType.TEXT, content: '剪贴板' }))!
    expect((await store.searchClipboardHistory({ keyword: 'jtb' })).total).toBe(0)
    expect((await store.searchClipboardHistory({ keyword: 'jtb', fuzzyPreview: true })).items[0]?.id).toBe(item.id)
  })
})
