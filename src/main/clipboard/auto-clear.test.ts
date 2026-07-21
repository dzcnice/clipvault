/**
 * TASK-068 auto-clear 单测
 *
 * 用 vi.useFakeTimers + 内存版 clipboard mock，避免真实 Electron 环境依赖。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// mock electron clipboard：内存字符串
const clipboardState = { text: '' }
vi.mock('electron', () => ({
  clipboard: {
    readText: (): string => clipboardState.text,
    writeText: (s: string): void => {
      clipboardState.text = s
    }
  }
}))

import { ClipboardAutoClear, clipboardAutoClear, DEFAULT_AUTO_CLEAR_TTL_MS } from './auto-clear'

describe('ClipboardAutoClear', () => {
  let ac: ClipboardAutoClear

  beforeEach(() => {
    vi.useFakeTimers()
    clipboardState.text = ''
    ac = new ClipboardAutoClear()
  })

  afterEach(() => {
    ac._resetForTests()
    vi.useRealTimers()
  })

  it('schedule 启动计时器并发出 scheduled 事件', () => {
    const onScheduled = vi.fn()
    ac.on('scheduled', onScheduled)
    clipboardState.text = 'secret-pw'
    ac.schedule('secret-pw', 5_000)
    expect(onScheduled).toHaveBeenCalledTimes(1)
    expect(onScheduled.mock.calls[0]?.[0]?.ttlMs).toBe(5_000)
    expect(ac.getStatus().active).toBe(true)
  })

  it('cancel 取消挂起的计时器并发出 cancelled', () => {
    const onCancelled = vi.fn()
    const onCleared = vi.fn()
    ac.on('cancelled', onCancelled)
    ac.on('cleared', onCleared)
    clipboardState.text = 'pw'
    ac.schedule('pw', 5_000)
    ac.cancel()
    expect(onCancelled).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(10_000)
    expect(onCleared).not.toHaveBeenCalled()
    expect(ac.getStatus().active).toBe(false)
  })

  it('到期但 hash 变了 → skipped，剪贴板不被清', () => {
    const onCleared = vi.fn()
    const onSkipped = vi.fn()
    ac.on('cleared', onCleared)
    ac.on('skipped', onSkipped)
    clipboardState.text = 'pw-original'
    ac.schedule('pw-original', 1_000)
    // 用户手动复制了别的内容
    clipboardState.text = 'something-else'
    vi.advanceTimersByTime(1_000)
    expect(onCleared).not.toHaveBeenCalled()
    expect(onSkipped).toHaveBeenCalledTimes(1)
    expect(onSkipped.mock.calls[0]?.[0]?.reason).toBe('content-changed')
    expect(clipboardState.text).toBe('something-else')
  })

  it('到期且 hash 一致 → 剪贴板被清空并发出 cleared', () => {
    const onCleared = vi.fn()
    clipboardState.text = 'pw-keep'
    ac.on('cleared', onCleared)
    ac.schedule('pw-keep', 1_000)
    vi.advanceTimersByTime(1_000)
    expect(onCleared).toHaveBeenCalledTimes(1)
    expect(clipboardState.text).toBe('')
  })

  it('多次 schedule 只有最后一次生效', () => {
    const onCleared = vi.fn()
    ac.on('cleared', onCleared)
    clipboardState.text = 'first'
    ac.schedule('first', 1_000)
    clipboardState.text = 'second'
    ac.schedule('second', 2_000)
    // 1s 时不应该清（旧任务已被覆盖）
    vi.advanceTimersByTime(1_000)
    expect(onCleared).not.toHaveBeenCalled()
    // 再过 1s，刚好到 second 的 2s
    vi.advanceTimersByTime(1_000)
    expect(onCleared).toHaveBeenCalledTimes(1)
    expect(clipboardState.text).toBe('')
  })

  it('外部 cancel 模拟"复制了新内容"场景', () => {
    clipboardState.text = 'pw'
    ac.schedule('pw', 5_000)
    expect(ac.getStatus().active).toBe(true)
    // 模拟 monitor 检测到新内容
    ac.cancel()
    expect(ac.getStatus().active).toBe(false)
  })

  it('getRemainingMs 在调度期间正确递减', () => {
    clipboardState.text = 'pw'
    ac.schedule('pw', 10_000)
    expect(ac.getRemainingMs()).toBe(10_000)
    vi.advanceTimersByTime(3_000)
    expect(ac.getRemainingMs()).toBe(7_000)
    ac.cancel()
    expect(ac.getRemainingMs()).toBe(0)
  })

  it('未调度时 getStatus 返回 active=false / remainingMs=0', () => {
    const s = ac.getStatus()
    expect(s.active).toBe(false)
    expect(s.remainingMs).toBe(0)
  })

  it('flushNow 立即清空', () => {
    const onCleared = vi.fn()
    ac.on('cleared', onCleared)
    clipboardState.text = 'pw'
    ac.schedule('pw', 30_000)
    ac.flushNow()
    expect(onCleared).toHaveBeenCalledTimes(1)
    expect(clipboardState.text).toBe('')
  })

  it('空字符串 schedule 不创建计时器', () => {
    ac.schedule('', 5_000)
    expect(ac.getStatus().active).toBe(false)
  })

  it('默认 TTL 为 30s', () => {
    clipboardState.text = 'x'
    ac.schedule('x')
    expect(ac.getStatus().ttlMs).toBe(DEFAULT_AUTO_CLEAR_TTL_MS)
  })

  it('单例 clipboardAutoClear 可独立工作', () => {
    clipboardAutoClear._resetForTests()
    const onCleared = vi.fn()
    clipboardAutoClear.on('cleared', onCleared)
    clipboardState.text = 'singleton'
    clipboardAutoClear.schedule('singleton', 500)
    vi.advanceTimersByTime(500)
    expect(onCleared).toHaveBeenCalledTimes(1)
    clipboardAutoClear._resetForTests()
  })
})
