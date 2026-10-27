import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<{ success: boolean; error?: string }>>(),
  item: undefined as Record<string, unknown> | undefined,
  writeText: vi.fn(), writeImage: vi.fn(), writeImagePaste: vi.fn(), usage: vi.fn(),
  mode: 'both' as 'both' | 'image' | 'path', hide: vi.fn(), paste: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: never) => state.handlers.set(name, handler) },
  BrowserWindow: class {}, clipboard: { readText: () => 'CURRENT_CLIP_FIXTURE' }
}))
vi.mock('../crypto/vault', () => ({ isUnlocked: () => true, onVaultLocked: vi.fn() }))
vi.mock('../hud/manager', () => ({ hideHUD: state.hide }))
vi.mock('../clipboard/paste-active', () => ({ pasteToActiveApp: state.paste }))
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../prefs', () => ({ getPrefs: () => ({}), setPrefs: vi.fn(), getImagePasteMode: () => state.mode }))
vi.mock('../storage/image-store', () => ({ cleanupImageExports: vi.fn(), exportImagePath: (path: string) => path }))
vi.mock('../../db/clipboard-store', () => ({
  getClipboardItemById: () => state.item,
  getClipboardImagePath: () => state.item?.imagePath ?? null,
  recordClipboardUsage: state.usage
}))
vi.mock('../clipboard/monitor', async () => {
  const { EventEmitter } = await import('node:events')
  return { getClipboardMonitor: () => Object.assign(new EventEmitter(), {
    updateSettings: vi.fn(), writeText: state.writeText, writeImage: state.writeImage,
    writeImagePaste: state.writeImagePaste,
    formatPathText: (path: string) => path.includes(' ') ? `"${path}"` : path
  }) }
})
import { registerClipboardHandlers } from './clipboard-handlers'
const event = { senderFrame: { url: 'file:///fixture' }, sender: Object.assign(new EventEmitter(), { id: 1 }) }
beforeEach(() => {
  vi.clearAllMocks()
  state.mode = 'both'
  state.item = { id: 'fixture', type: 'text', content: 'value' }
  state.paste.mockResolvedValue({ ok: true })
  registerClipboardHandlers({ hide: state.hide, show: vi.fn(), isDestroyed: () => false, webContents: { send: vi.fn() } } as never)
})

describe('M1 shared clipboard copy IPC', () => {
  it('pastes after main-process copy and hiding both workbench surfaces, without a Host', async () => {
    expect((await state.handlers.get('clipboard:copyItem')!(event, 'fixture', { paste: true })).success).toBe(true)
    expect(state.hide).toHaveBeenCalledTimes(2)
    expect(state.writeText.mock.invocationCallOrder[0]).toBeLessThan(state.paste.mock.invocationCallOrder[0]!)
    expect(state.hide.mock.invocationCallOrder[1]).toBeLessThan(state.paste.mock.invocationCallOrder[0]!)
  })
  it('expands {clip} against the current system clipboard and records one use', async () => {
    state.item = { ...state.item, isSnippet: true, content: 'before {clip} after' }
    expect(await state.handlers.get('clipboard:copyItem')!(event, 'fixture')).toEqual({ success: true, data: true })
    expect(state.writeText).toHaveBeenCalledWith('before CURRENT_CLIP_FIXTURE after')
    expect(state.usage).toHaveBeenCalledTimes(1)
  })
  it.each(['both', 'image', 'path'] as const)('copies images using %s mode', async (mode) => {
    state.item = { id: 'fixture', type: 'image', imagePath: 'C:\\fixture image.png', imageData: 'fixture-image' }
    const response = await state.handlers.get('clipboard:copyItem')!(event, 'fixture', { mode })
    expect(response.success).toBe(true)
    if (mode === 'both') expect(state.writeImagePaste).toHaveBeenCalledWith('fixture-image', 'C:\\fixture image.png', 'both')
    if (mode === 'image') expect(state.writeImage).toHaveBeenCalledWith('fixture-image')
    if (mode === 'path') {
      expect(state.writeText).toHaveBeenCalledWith('"C:\\fixture image.png"')
      await state.handlers.get('clipboard:copyPath')!(event, 'fixture')
      expect(state.writeText).toHaveBeenLastCalledWith('"C:\\fixture image.png"')
    }
  })
  it('returns a copy failure without counting a successful use', async () => {
    state.writeText.mockImplementationOnce(() => { throw new Error('fixture write failure') })
    expect((await state.handlers.get('clipboard:copyItem')!(event, 'fixture')).success).toBe(false)
    expect(state.usage).not.toHaveBeenCalled()
  })
  it('refuses a corrupt encrypted record without replacing the system clipboard', async () => {
    state.item = { ...state.item, decryptError: true }
    expect((await state.handlers.get('clipboard:copyItem')!(event, 'fixture')).success).toBe(false)
    expect(state.writeText).not.toHaveBeenCalled()
    expect(state.usage).not.toHaveBeenCalled()
  })
})
