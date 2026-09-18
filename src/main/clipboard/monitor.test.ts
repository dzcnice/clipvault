/**
 * ClipboardMonitor：自写抑制、排除应用、文件入库、世代号
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let fakeClipText = ''
let formats: string[] = []
let fileNameW = Buffer.alloc(0)
let currentApp = ''

vi.mock('electron', () => ({
  app: {
    getPath: (): string => '/tmp/clipvault-test',
    isPackaged: false
  },
  clipboard: {
    readText: (): string => fakeClipText,
    writeText: (s: string): void => {
      fakeClipText = s
    },
    write: (payload: { text?: string }): void => {
      if (payload.text !== undefined) fakeClipText = payload.text
    },
    writeImage: (): void => {},
    readImage: () => ({
      isEmpty: () => true,
      toDataURL: () => '',
      toJPEG: () => Buffer.alloc(0),
      getSize: () => ({ width: 0, height: 0 }),
      toBitmap: () => Buffer.alloc(0)
    }),
    readHTML: () => '',
    readBuffer: (): Buffer => fileNameW,
    availableFormats: (): string[] =>
      formats.length > 0 ? formats : fakeClipText ? ['text/plain'] : []
  },
  nativeImage: {
    createFromDataURL: () => ({ isEmpty: () => true })
  }
}))

vi.mock('./source-app', () => ({
  getForegroundAppName: (): string => currentApp,
  refreshForegroundAppName: async (): Promise<string> => currentApp,
  isAppExcluded: (name: string | undefined, list: string[]): boolean => {
    if (!name || !list.length) return false
    const n = name.toLowerCase()
    return list.some((e) => e.trim().toLowerCase() === n)
  }
}))

import { ClipboardMonitor } from './monitor'
import { ClipboardContentType } from '../../types'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe('ClipboardMonitor', () => {
  let monitor: ClipboardMonitor

  beforeEach(() => {
    fakeClipText = ''
    formats = []
    fileNameW = Buffer.alloc(0)
    currentApp = ''
    monitor = new ClipboardMonitor({ pollInterval: 40, excludedApps: [] })
  })

  afterEach(() => {
    monitor.stop()
  })

  it('writeText 同步 lastHash，轮询不再把凭证复制当新历史', async () => {
    const changes: unknown[] = []
    monitor.on('change', (e) => changes.push(e))
    monitor.start()
    monitor.writeText('super-secret-password')
    await sleep(120)
    expect(changes).toHaveLength(0)
    expect(fakeClipText).toBe('super-secret-password')
  })

  it('排除应用跳过后，同一内容从其它应用仍会入库', async () => {
    monitor.updateSettings({ excludedApps: ['chrome'] })
    currentApp = 'chrome'
    const changes: Array<{ content?: string }> = []
    monitor.on('change', (e: { content?: string }) => changes.push(e))
    monitor.start()
    fakeClipText = 'same-payload'
    await sleep(120)
    expect(changes).toHaveLength(0)

    currentApp = 'notepad'
    await sleep(1700)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes[0]?.content).toBe('same-payload')
  })

  it('资源管理器文件复制发出 type=file 的 change', async () => {
    const changes: Array<{ type: string; filePath?: string }> = []
    monitor.on('change', (e: { type: string; filePath?: string }) => changes.push(e))
    monitor.start()
    formats = ['FileNameW']
    fileNameW = Buffer.from('C:\\Users\\test\\a.txt\u0000', 'utf16le')
    await sleep(120)
    expect(changes.length).toBeGreaterThan(0)
    expect(changes[0]?.type).toBe(ClipboardContentType.FILE)
    expect(changes[0]?.filePath).toContain('a.txt')
  })

  it('新内容会增加 generation，供截图写回竞态检测', async () => {
    monitor.start()
    const g0 = monitor.getGeneration()
    fakeClipText = 'next-clip'
    await sleep(120)
    expect(monitor.getGeneration()).toBeGreaterThan(g0)
  })
})
