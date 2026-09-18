/**
 * HUD IPC handlers（v2.0 Sprint 6）
 */

import { ipcMain, BrowserWindow } from 'electron'
import { HUD_CHANNELS } from '../../types/hud'
import { hideHUD, toggleHUD, getMainWindow } from './manager'
import { logger } from '../utils/logger'

export function registerHUDIPC(): void {
  ipcMain.handle(HUD_CHANNELS.HUD_HIDE, () => {
    hideHUD()
    return { success: true }
  })

  ipcMain.handle(HUD_CHANNELS.HUD_TOGGLE, () => {
    toggleHUD()
    return { success: true }
  })

  ipcMain.handle(HUD_CHANNELS.HUD_NAVIGATE, (_evt, path: string) => {
    if (typeof path !== 'string' || !path) {
      return { success: false, error: 'invalid path' }
    }
    const main = getMainWindow()
    if (!main || main.isDestroyed()) {
      return { success: false, error: 'main window unavailable' }
    }
    try {
      if (!main.isVisible()) main.show()
      main.focus()
      main.webContents.send('navigate', path)
      hideHUD()
      return { success: true }
    } catch (err) {
      logger.error('[HUD] navigate failed:', err)
      return { success: false, error: String(err) }
    }
  })
}

export { HUD_CHANNELS }
// 仅用于 hud-registry 避免 tree-shake 警告
export const __touch = (): BrowserWindow | null => null
