/**
 * HUD window 单元测试（v2.0 Sprint 6）
 *
 * 仅在可 mock electron 的前提下测试：走公开 API 的幂等性。
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => {
  class FakeWindow {
    public destroyed = false
    public visible = false
    public focused = false
    public handlers = new Map<string, Array<(...a: unknown[]) => void>>()
    webContents = { send: vi.fn() }
    constructor(public opts: Record<string, unknown>) {}
    on(ev: string, cb: (...a: unknown[]) => void): void {
      const arr = this.handlers.get(ev) ?? []
      arr.push(cb)
      this.handlers.set(ev, arr)
    }
    show(): void {
      this.visible = true
    }
    hide(): void {
      this.visible = false
    }
    focus(): void {
      this.focused = true
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    isVisible(): boolean {
      return this.visible
    }
    setAlwaysOnTop(): void {}
    setVisibleOnAllWorkspaces(): void {}
    setPosition(): void {}
    getSize(): [number, number] {
      return [640, 480]
    }
    loadURL(): void {}
    loadFile(): void {}
    destroy(): void {
      this.destroyed = true
    }
  }
  return {
    BrowserWindow: FakeWindow,
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
    app: { on: vi.fn() }
  }
})

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

describe('hud/window', () => {
  it('createHUDWindow 是幂等单例，showHUD/hideHUD 切换可见性', async () => {
    const mod = await import('./window')
    const w1 = mod.createHUDWindow()
    const w2 = mod.createHUDWindow()
    expect(w1).toBe(w2)
    mod.showHUD()
    expect(w1.isVisible()).toBe(true)
    mod.hideHUD()
    expect(w1.isVisible()).toBe(false)
    mod.destroyHUDWindow()
    expect(mod.getHUDWindow()).toBeNull()
  })

  it('toggleHUD 切换', async () => {
    const mod = await import('./window')
    mod.destroyHUDWindow()
    mod.toggleHUD() // show
    expect(mod.getHUDWindow()?.isVisible()).toBe(true)
    mod.toggleHUD() // hide
    expect(mod.getHUDWindow()?.isVisible()).toBe(false)
    mod.destroyHUDWindow()
  })
})
