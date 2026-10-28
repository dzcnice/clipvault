/**
 * HUD IPC handlers（v2.0 Sprint 6）
 */

import { ipcMain, BrowserWindow } from 'electron'
import { HUD_CHANNELS } from '../../types/hud'
import { hideHUD, toggleHUD, getMainWindow } from './manager'
import { setHUDMode } from './window'
import { logger } from '../utils/logger'
import { lastForeground } from '../jarvis/foreground'

export function registerHUDIPC(): void {
  ipcMain.handle(HUD_CHANNELS.HUD_HIDE, () => {
    hideHUD()
    return { success: true }
  })

  ipcMain.handle(HUD_CHANNELS.HUD_TOGGLE, () => {
    toggleHUD()
    return { success: true }
  })

  ipcMain.handle('hud:foreground', async () => ({ success: true, data: await lastForeground() }))
  ipcMain.handle('hud:mode', (_evt, mode: unknown) => {
    if (mode !== 'search' && mode !== 'jarvis') return { success: false, error: 'invalid mode' }
    setHUDMode(mode); return { success: true }
  })
  /** Jarvis 的回答：收起浮窗后粘贴到原来的前台应用。 */
  ipcMain.handle('jarvis:paste', async (_evt, text: unknown) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 100_000) return { success: false, error: '没有可粘贴的内容' }
    hideHUD()
    const { getClipboardMonitor } = await import('../clipboard/monitor')
    const { pasteToActiveApp } = await import('../clipboard/paste-active')
    getClipboardMonitor().writeText(text)
    const result = await pasteToActiveApp()
    return result.ok ? { success: true } : { success: false, error: '已复制，但未能自动粘贴，请手动 Ctrl+V' }
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
