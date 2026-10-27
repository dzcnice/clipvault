// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMixedDataCommands } from './mixed-data'

const history = vi.fn()
const copy = vi.fn()
const snippets = vi.fn()
beforeEach(() => {
  history.mockReset().mockResolvedValue({ success: true, data: { items: [{ id: 'old-record', preview: 'short preview', type: 'text', isSnippet: false }], total: 1 } })
  copy.mockReset().mockResolvedValue({ success: true })
  snippets.mockReset().mockResolvedValue({ success: true, data: [{ id: 'snippet', snippetName: 'template', content: '{clip}', tags: [] }] })
  Object.defineProperty(window, 'api', { configurable: true, value: {
    credential: { list: vi.fn().mockResolvedValue({ success: true, data: { items: [] } }) },
    clipboard: { getHistory: history, copyItem: copy, getSnippets: snippets }
  } })
})
describe('M1 unified HUD data source', () => {
  it('queries the full database and preserves matches outside the visible preview', async () => {
    const commands = await buildMixedDataCommands('needle-outside-preview')
    expect(history).toHaveBeenCalledWith({ limit: 40, filter: { keyword: 'needle-outside-preview', fuzzyPreview: true }, requestKey: 'hud' })
    expect(commands.find(c => c.id === 'clip:old-record')?.keywords).toContain('needle-outside-preview')
  })
  it('copies snippets via main IPC so {clip} and self-write suppression use the same implementation', async () => {
    const commands = await buildMixedDataCommands()
    await commands.find(c => c.id === 'snip:snippet')!.perform()
    expect(copy).toHaveBeenCalledWith('snippet', { paste: true })
    copy.mockResolvedValue({ success: false, error: 'locked' })
    await expect(commands.find(c => c.id === 'snip:snippet')!.perform()).rejects.toThrow('locked')
  })
  it('reports an IPC failure instead of pretending the result is empty', async () => {
    history.mockResolvedValue({ success: false, error: '读取失败' })
    await expect(buildMixedDataCommands('x')).rejects.toThrow('读取失败')
  })
  it('retains pinyin initial matching for snippets', async () => {
    snippets.mockResolvedValue({ success: true, data: [{ id: 'chinese', snippetName: '剪贴板', content: 'fixture', tags: [] }] })
    expect((await buildMixedDataCommands('jtb')).some(c => c.id === 'snip:chinese')).toBe(true)
  })
})
