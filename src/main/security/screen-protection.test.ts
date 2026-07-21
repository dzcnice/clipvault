/**
 * TASK-069 反截屏保护单测
 * 用 mock BrowserWindow 验证 setContentProtection 调用与 Manager 行为。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import {
  enableScreenProtection,
  disableScreenProtection,
  isScreenProtectionSupported,
  ScreenProtectionManager
} from './screen-protection'

interface MockWin {
  setContentProtection: ReturnType<typeof vi.fn>
  isDestroyed: ReturnType<typeof vi.fn>
  once: ReturnType<typeof vi.fn>
  _closedHandlers: Array<() => void>
}

function createMockWindow(destroyed = false): MockWin {
  const handlers: Array<() => void> = []
  return {
    setContentProtection: vi.fn(),
    isDestroyed: vi.fn(() => destroyed),
    once: vi.fn((evt: string, cb: () => void) => {
      if (evt === 'closed') handlers.push(cb)
    }),
    _closedHandlers: handlers
  }
}

describe('screen-protection', () => {
  describe('enable / disable', () => {
    it('enable 调用 setContentProtection(true)', () => {
      const win = createMockWindow()
      enableScreenProtection(win as unknown as BrowserWindow)
      expect(win.setContentProtection).toHaveBeenCalledWith(true)
    })

    it('disable 调用 setContentProtection(false)', () => {
      const win = createMockWindow()
      disableScreenProtection(win as unknown as BrowserWindow)
      expect(win.setContentProtection).toHaveBeenCalledWith(false)
    })

    it('对已销毁窗口跳过调用，不抛错', () => {
      const win = createMockWindow(true)
      enableScreenProtection(win as unknown as BrowserWindow)
      disableScreenProtection(win as unknown as BrowserWindow)
      expect(win.setContentProtection).not.toHaveBeenCalled()
    })

    it('对 null 窗口安全', () => {
      expect(() =>
        enableScreenProtection(null as unknown as BrowserWindow)
      ).not.toThrow()
      expect(() =>
        disableScreenProtection(null as unknown as BrowserWindow)
      ).not.toThrow()
    })

    it('setContentProtection 抛错时静默吞掉', () => {
      const win = createMockWindow()
      win.setContentProtection.mockImplementation(() => {
        throw new Error('not supported')
      })
      expect(() =>
        enableScreenProtection(win as unknown as BrowserWindow)
      ).not.toThrow()
    })
  })

  describe('isScreenProtectionSupported', () => {
    it('返回布尔（实际值依赖运行平台，但调用本身不能抛）', () => {
      const r = isScreenProtectionSupported()
      expect(typeof r).toBe('boolean')
      // win32 / darwin 应为 true，Linux 为 false；这里只断言与平台一致
      const expected =
        process.platform === 'win32' || process.platform === 'darwin'
      expect(r).toBe(expected)
    })
  })

  describe('ScreenProtectionManager', () => {
    let mgr: ScreenProtectionManager
    beforeEach(() => {
      mgr = new ScreenProtectionManager()
    })

    it('protect 启用保护并跟踪窗口', () => {
      const win = createMockWindow()
      const unprotect = mgr.protect(win as unknown as BrowserWindow)
      expect(win.setContentProtection).toHaveBeenCalledWith(true)
      expect(mgr.isProtected(win as unknown as BrowserWindow)).toBe(true)
      expect(mgr.size()).toBe(1)
      unprotect()
      expect(win.setContentProtection).toHaveBeenLastCalledWith(false)
      expect(mgr.size()).toBe(0)
    })

    it('Manager 跟踪多个窗口', () => {
      const w1 = createMockWindow()
      const w2 = createMockWindow()
      const w3 = createMockWindow()
      mgr.protect(w1 as unknown as BrowserWindow)
      mgr.protect(w2 as unknown as BrowserWindow)
      mgr.protect(w3 as unknown as BrowserWindow)
      expect(mgr.size()).toBe(3)
      mgr.unprotectAll()
      expect(mgr.size()).toBe(0)
      expect(w1.setContentProtection).toHaveBeenLastCalledWith(false)
      expect(w2.setContentProtection).toHaveBeenLastCalledWith(false)
      expect(w3.setContentProtection).toHaveBeenLastCalledWith(false)
    })

    it('窗口 closed 事件触发后自动从注册表移除', () => {
      const win = createMockWindow()
      mgr.protect(win as unknown as BrowserWindow)
      expect(mgr.size()).toBe(1)
      // 模拟窗口关闭
      win._closedHandlers.forEach((cb) => cb())
      expect(mgr.size()).toBe(0)
    })

    it('对已销毁窗口 protect 返回 no-op', () => {
      const win = createMockWindow(true)
      const unprotect = mgr.protect(win as unknown as BrowserWindow)
      expect(mgr.size()).toBe(0)
      expect(() => unprotect()).not.toThrow()
    })

    it('protectAll 对当前注册表批量重新启用', () => {
      const w1 = createMockWindow()
      const w2 = createMockWindow()
      mgr.protect(w1 as unknown as BrowserWindow)
      mgr.protect(w2 as unknown as BrowserWindow)
      w1.setContentProtection.mockClear()
      w2.setContentProtection.mockClear()
      mgr.protectAll()
      expect(w1.setContentProtection).toHaveBeenCalledWith(true)
      expect(w2.setContentProtection).toHaveBeenCalledWith(true)
    })
  })
})
