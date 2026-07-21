/**
 * HUD Manager：召唤/隐藏/快捷键集成（v2.0 Sprint 6 · TASK-032）
 */

import { BrowserWindow, globalShortcut } from 'electron'
import { createHUDWindow, toggleHUD, hideHUD, showHUD, destroyHUDWindow } from './window'
import { logger } from '../utils/logger'

const HUD_TOGGLE_ACCELERATOR = 'Alt+Space'

let mainWindowRef: BrowserWindow | null = null
let initialized = false

/** 初始化 HUD：预热窗口 + 注册全局快捷键 */
export function initHUD(mainWindow: BrowserWindow): void {
  if (initialized) return
  mainWindowRef = mainWindow

  // 预热：app 启动后立即创建但 hide
  createHUDWindow()

  // 注册全局快捷键 Alt+Space
  try {
    const ok = globalShortcut.register(HUD_TOGGLE_ACCELERATOR, () => {
      toggleHUD()
    })
    if (!ok) {
      logger.warn('[HUD] Failed to register Alt+Space (may be occupied by another app)')
    } else {
      logger.info('[HUD] Alt+Space registered')
    }
  } catch (err) {
    logger.error('[HUD] register hotkey error:', err)
  }

  initialized = true
}

/** 获取主窗口（供 HUD IPC 用于跳转） */
export function getMainWindow(): BrowserWindow | null {
  return mainWindowRef
}

/** 清理（退出时） */
export function disposeHUD(): void {
  try {
    globalShortcut.unregister(HUD_TOGGLE_ACCELERATOR)
  } catch {
    /* ignore */
  }
  destroyHUDWindow()
  initialized = false
}

export { hideHUD, showHUD, toggleHUD }
