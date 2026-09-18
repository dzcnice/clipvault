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
