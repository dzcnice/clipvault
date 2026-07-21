/**
 * TASK-069 反截屏保护（Sprint 13）
 *
 * 调用 BrowserWindow.setContentProtection()：
 *   - Windows: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)
 *     → 截屏 / OBS / Teams 共享中窗口呈现黑屏
 *   - macOS: NSWindowSharingNone（NSWindow.sharingType）
 *   - Linux: Electron 静默 no-op（X11/Wayland 无统一接口）
 *
 * 使用：在凭证详情 / Vera HUD / AuditLog 等敏感面板打开时调用
 * `screenProtection.protect(win)`，关闭时调用返回的 unprotect。
 */

import type { BrowserWindow } from 'electron'

/** 当前平台是否真正支持反截屏（Linux 视为不支持） */
export function isScreenProtectionSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

/** 启用反截屏保护（Linux no-op，不抛错） */
export function enableScreenProtection(win: BrowserWindow): void {
  if (!win || win.isDestroyed?.()) return
  try {
    win.setContentProtection(true)
  } catch {
    // setContentProtection 在某些 Electron 平台/版本可能不可用，静默忽略
  }
}

/** 禁用反截屏保护 */
export function disableScreenProtection(win: BrowserWindow): void {
  if (!win || win.isDestroyed?.()) return
  try {
    win.setContentProtection(false)
  } catch {
    // ignore
  }
}

/**
 * 多窗口管理器：跟踪当前处于保护状态的窗口集合，
 * 提供批量启用 / 关闭，window closed 时自动清理。
 */
export class ScreenProtectionManager {
  private protectedWindows = new Set<BrowserWindow>()

  /** 启用并返回 unprotect 函数（建议绑定到面板 unmount） */
  protect(win: BrowserWindow): () => void {
    if (!win || win.isDestroyed?.()) {
      return () => undefined
    }
    enableScreenProtection(win)
    this.protectedWindows.add(win)

    const cleanup = (): void => {
      this.protectedWindows.delete(win)
    }
    // 窗口关闭时自动清理引用
    try {
      win.once?.('closed', cleanup)
    } catch {
      // ignore
    }

    return () => {
      if (!this.protectedWindows.has(win)) return
      disableScreenProtection(win)
      this.protectedWindows.delete(win)
    }
  }

  /** 是否正在保护该窗口 */
  isProtected(win: BrowserWindow): boolean {
    return this.protectedWindows.has(win)
  }

  /** 当前保护的窗口数 */
  size(): number {
    return this.protectedWindows.size
  }

  /** 对所有已注册窗口启用保护（对掉线状态做修复） */
  protectAll(): void {
    for (const win of this.protectedWindows) {
      if (!win.isDestroyed?.()) enableScreenProtection(win)
    }
  }

  /** 关闭所有窗口的反截屏，并清空注册表 */
  unprotectAll(): void {
    for (const win of this.protectedWindows) {
      if (!win.isDestroyed?.()) disableScreenProtection(win)
    }
    this.protectedWindows.clear()
  }

  /** 测试钩子 */
  _resetForTests(): void {
    this.protectedWindows.clear()
  }
}

/** 全局单例 */
export const screenProtection = new ScreenProtectionManager()
