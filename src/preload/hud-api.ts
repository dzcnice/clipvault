/**
 * HUD 命令面板 preload API → window.api.hud
 */

import { ipcRenderer } from 'electron'
import { HUD_CHANNELS } from '../types/hud'

export const hudAPI = {
  hide: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(HUD_CHANNELS.HUD_HIDE),
  toggle: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(HUD_CHANNELS.HUD_TOGGLE),
  navigate: (path: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(HUD_CHANNELS.HUD_NAVIGATE, path),
  /** 切换浮窗尺寸：搜索 / 问 Jarvis。 */
  mode: (mode: 'search' | 'jarvis'): Promise<{ success: boolean }> => ipcRenderer.invoke('hud:mode', mode),
  /** 把 Jarvis 的回答粘贴到原来的前台应用（会先收起浮窗）。 */
  pasteAnswer: (text: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('jarvis:paste', text),
  /** 按下 Alt+Space 时的前台窗口（本机匹配账号用）。 */
  foreground: (): Promise<{ success: boolean; data?: { process: string; title: string; at: number } }> => ipcRenderer.invoke('hud:foreground'),
  /** 主进程把截图或剪贴板记录交给 Jarvis 浮窗。 */
  onJarvisOpen: (cb: (input: { clipboardId?: string; text?: string; autoSend?: boolean }) => void): (() => void) => {
    const handler = (_event: unknown, input: { clipboardId?: string; text?: string; autoSend?: boolean }): void => cb(input)
    ipcRenderer.on('jarvis:open', handler)
    return () => ipcRenderer.removeListener('jarvis:open', handler)
  },
  /** 监听 HUD 显示事件（渲染侧聚焦输入框用） */
  onShown: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(HUD_CHANNELS.HUD_SHOWN, handler)
    return () => ipcRenderer.removeListener(HUD_CHANNELS.HUD_SHOWN, handler)
  },
  onHidden: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on(HUD_CHANNELS.HUD_HIDDEN, handler)
    return () => ipcRenderer.removeListener(HUD_CHANNELS.HUD_HIDDEN, handler)
  }
}

export type HudAPI = typeof hudAPI
