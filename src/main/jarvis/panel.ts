import { getHUDWindow, showHUD } from '../hud/window'

/**
 * 把一次截图或剪贴板记录交给 Jarvis 浮窗（Alt+Space 的「问 Jarvis」模式）。
 * 浮窗不可用时返回 false，由调用方回退到主窗口。
 */
export function openJarvisWith(input: { clipboardId?: string; text?: string; autoSend?: boolean }): boolean {
  const hud = getHUDWindow()
  if (!hud || hud.isDestroyed()) return false
  showHUD()
  const send = (): void => { if (!hud.isDestroyed()) hud.webContents.send('jarvis:open', input) }
  if (hud.webContents.isLoading()) hud.webContents.once('did-finish-load', send); else send()
  return true
}
