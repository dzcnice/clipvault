/**
 * Sprint 6 IPC 注册入口（v2.0 · HUD 窗口 + 命令面板）
 *
 * 由整合人在 src/main/ipc/index.ts 中调用 registerSprint6IPC(mainWindow)。
 * 本模块负责：
 *   1) 初始化 HUD 独立 BrowserWindow（预热）
 *   2) 注册 Alt+Space 全局快捷键
 *   3) 注册 HUD 相关 IPC（hide/toggle/navigate）
 */

import type { BrowserWindow } from 'electron'
import { initHUD, disposeHUD } from '../hud/manager'
import { registerHUDIPC } from '../hud/ipc'
import { logger } from '../utils/logger'

export function registerSprint6IPC(mainWindow: BrowserWindow): void {
  initHUD(mainWindow)
  registerHUDIPC()
  logger.info('[IPC] Sprint 6 registry ready (HUD window + command palette)')
}

export { disposeHUD }
