/**
 * ClipboardMonitor：自写抑制、排除应用、文件入库、世代号
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

let fakeClipText = ''
let formats: string[] = []
let fileNameW = Buffer.alloc(0)
let currentApp = ''
let imageBytes = Buffer.alloc(0)
let refreshSource: (() => Promise<string>) | undefined

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
      isEmpty: () => imageBytes.length === 0,
      toDataURL: () => `data:image/png;base64,${imageBytes.toString('base64')}`,
      toJPEG: () => Buffer.alloc(0),
      getSize: () => ({ width: 40, height: 20 }),
      toBitmap: () => imageBytes
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
  refreshForegroundAppName: async (): Promise<string> => refreshSource ? refreshSource() : currentApp,
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
    imageBytes = Buffer.alloc(0)
    refreshSource = undefined
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

  it.each(['pause', 'self-write'])('来源查询尚未返回时 %s 不会捕获过期内容', async (action) => {
    let finish!: (app: string) => void
    let started!: () => void
    const querying = new Promise<void>(resolve => { started = resolve })
    refreshSource = () => { started(); return new Promise(resolve => { finish = resolve }) }
    monitor.updateSettings({ excludedApps: ['excluded'] })
    const change = vi.fn()
    monitor.on('change', change)
    monitor.start()
    fakeClipText = 'candidate'
    await querying
    if (action === 'pause') monitor.stop()
    else monitor.writeText('copied-by-app')
    finish('Editor')
    await sleep(20)
    expect(change).not.toHaveBeenCalled()
  })

  it('识别图片中间区域变化，不能只比较头尾像素', async () => {
    const change = vi.fn()
    monitor.on('change', change)
    formats = ['image/png']
    imageBytes = Buffer.alloc(3200)
    monitor.start()
    imageBytes[1600] = 255
    await sleep(100)
    expect(change).toHaveBeenCalledTimes(1)
  })

  it('图片大小限制按保存的原始字节执行', async () => {
    const change = vi.fn()
    monitor.on('change', change)
    monitor.updateSettings({ maxImageSize: 1 })
    monitor.start()
    formats = ['image/png']
    imageBytes = Buffer.alloc(2048)
    await sleep(100)
    expect(change).not.toHaveBeenCalled()
  })

  it('无效图片明确报错，不能报告已复制', () => {
    expect(() => monitor.writeImage('invalid')).toThrow('图片数据不可用')
    expect(() => monitor.writeImagePaste('invalid', 'C:\\fixture.png', 'both')).toThrow('图片数据不可用')
    expect(() => monitor.writeImagePaste('invalid', 'C:\\fixture path.png', 'path')).not.toThrow()
    expect(fakeClipText).toBe('"C:\\fixture path.png"')
  })
})
