/**
 * 集成测试 · 场景 4 + 5（剪贴板监听 + auto-clear + 密钥识别/拦截）
 *
 * 用一个共享的 electron mock，让 clipboard.readText / writeText 走一个内存变量，
 * monitor 和 auto-clear 共用它，以此观察它们的联动。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- 可变内存剪贴板，主/测都引用它 ---
let fakeClipText = ''
let fakeClipImage = { isEmpty: true as boolean, data: '' }

vi.mock('electron', () => {
  return {
    app: { getPath: (): string => '/tmp/clipvault-test' },
    ipcMain: { on: vi.fn(), handle: vi.fn(), removeAllListeners: vi.fn() },
    BrowserWindow: class {
      isDestroyed(): boolean {
        return false
      }
      webContents = { send: vi.fn() }
    },
    clipboard: {
      readText: () => fakeClipText,
      writeText: (s: string) => {
        fakeClipText = s
      },
      readImage: () => ({
        isEmpty: () => fakeClipImage.isEmpty,
        toDataURL: () => fakeClipImage.data,
        toJPEG: () => Buffer.alloc(0),
        getSize: () => ({ width: 0, height: 0 }),
        toBitmap: () => Buffer.alloc(0)
      }),
      readHTML: () => '',
      availableFormats: () => (fakeClipText ? ['text/plain'] : [])
    },
    nativeImage: {
      createFromDataURL: () => ({})
    }
  }
})

import { ClipboardAutoClear } from '../clipboard/auto-clear'
import { ClipboardMonitor } from '../clipboard/monitor'
import { detectKey } from '../../../src/utils/key-detector'

describe('集成 · τ2.4 auto-clear + monitor 联动', () => {
  beforeEach(() => {
    fakeClipText = ''
    fakeClipImage = { isEmpty: true, data: '' }
  })

  it('schedule → 等待 TTL → 内容未变 → 自动清空', async () => {
    const clearer = new ClipboardAutoClear()
    const events: string[] = []
    clearer.on('scheduled', () => events.push('scheduled'))
    clearer.on('cleared', () => events.push('cleared'))
    clearer.on('skipped', () => events.push('skipped'))

    fakeClipText = 'my-super-secret'
    clearer.schedule('my-super-secret', 100)

    // 等待 auto clear 触发
    await new Promise((r) => setTimeout(r, 160))

    expect(events).toContain('scheduled')
    expect(events).toContain('cleared')
    expect(fakeClipText).toBe('') // 被清空了
  })

  it('schedule 后用户复制其他内容 → flush 跳过不清空', async () => {
    const clearer = new ClipboardAutoClear()
    const events: string[] = []
    clearer.on('cleared', () => events.push('cleared'))
    clearer.on('skipped', () => events.push('skipped'))

    fakeClipText = 'secret-1'
    clearer.schedule('secret-1', 80)
    // 中途用户自己粘了新东西
    fakeClipText = 'user-changed'
    await new Promise((r) => setTimeout(r, 130))

    expect(events).toContain('skipped')
    expect(events).not.toContain('cleared')
    expect(fakeClipText).toBe('user-changed')
  })

  it('cancel 后计时器被清，flush 不触发', async () => {
    const clearer = new ClipboardAutoClear()
    let flushed = false
    clearer.on('cleared', () => {
      flushed = true
    })

    fakeClipText = 's1'
    clearer.schedule('s1', 80)
    clearer.cancel()
    await new Promise((r) => setTimeout(r, 120))
    expect(flushed).toBe(false)
    expect(fakeClipText).toBe('s1') // 未被清空
  })

  it('flushNow 立即清空，不等 TTL', () => {
    const clearer = new ClipboardAutoClear()
    let cleared = false
    clearer.on('cleared', () => {
      cleared = true
    })
    fakeClipText = 'now-secret'
    clearer.schedule('now-secret', 5000)
    clearer.flushNow()
    expect(cleared).toBe(true)
    expect(fakeClipText).toBe('')
  })

  it('空 secret 不调度', () => {
    const clearer = new ClipboardAutoClear()
    let scheduled = false
    clearer.on('scheduled', () => {
      scheduled = true
    })
    clearer.schedule('', 100)
    expect(scheduled).toBe(false)
  })
})

describe('集成 · τ2.5 密钥识别 + monitor 广播', () => {
  beforeEach(() => {
    fakeClipText = ''
  })

  it('复制 OpenAI key 时 emit key-detected 事件', async () => {
    const monitor = new ClipboardMonitor({ pollInterval: 50 })
    // 伪造一个足够长（≥48 字符）的 openai key
    const openaiKey = 'sk-' + 'A'.repeat(50)
    const detected: Array<{ detectedKeyType: string; content: string }> = []
    monitor.on('key-detected', (e) => detected.push(e))

    // 起始 empty
    monitor.start()
    // 首次初始化 lastHash 已是 empty；接着写入剪贴板
    fakeClipText = openaiKey
    await new Promise((r) => setTimeout(r, 150)) // 等 monitor 轮询
    monitor.stop()

    expect(detected.length).toBeGreaterThan(0)
    expect(detected[0]?.detectedKeyType).toBe('openai_api_key')
  })

  it('【FIXED BUG-FP-1】36 字符 "sk-XXXX" 串正确识别为 openai_api_key（不再误报 vercel）', () => {
    const short = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' // sk- + 36 位 = 39 char
    const r = detectKey(short)
    expect(r.detected).toBe(true)
    // 修复后：vercel 正则锚定 vercel_pat_ / vercel_auth_ 前缀，不会再抢识 OpenAI key
    expect(r.pattern?.name).toBe('openai_api_key')
  })

  it('剪贴板变更后 monitor 会取消旧的 auto-clear 计时', async () => {
    const monitor = new ClipboardMonitor({ pollInterval: 50 })
    const autoClear = await import('../clipboard/auto-clear').then(
      (m) => m.clipboardAutoClear
    )
    // 用 spy 监测 cancel 方法
    const cancelSpy = vi.spyOn(autoClear, 'cancel')
    monitor.start()
    fakeClipText = 'new-content-123'
    await new Promise((r) => setTimeout(r, 120))
    monitor.stop()
    expect(cancelSpy).toHaveBeenCalled()
    cancelSpy.mockRestore()
  })
})
