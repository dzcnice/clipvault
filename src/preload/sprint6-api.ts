/**
 * Sprint 6 preload API（HUD 命令面板）
 *
 * 由整合人在 src/preload/index.ts 中合并到 window.api：
 *   sprint6: sprint6API
 */

import { ipcRenderer } from 'electron'
import { HUD_CHANNELS } from '../types/hud'

export const sprint6API = {
  hud: {
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
}

export type Sprint6API = typeof sprint6API
