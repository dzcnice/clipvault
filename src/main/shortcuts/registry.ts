/**
 * 默认快捷键定义
 *
 * handler 引用 Manager 暴露的 dispatcher；在 Manager 初始化时注入。
 */

import type { BrowserWindow } from 'electron'
import type { ShortcutCommand } from './types'

/** 构建默认命令清单；handler 里访问 mainWindow 完成实际行为。 */
export function buildDefaultCommands(
  getWindow: () => BrowserWindow | null
): ShortcutCommand[] {
  return [
    {
      id: 'window.toggle',
      defaultAccelerator: 'CommandOrControl+Space',
      label: '显示/隐藏主窗口',
      handler: () => {
        const win = getWindow()
        if (!win) return
        if (win.isVisible()) {
          if (win.isFocused()) win.hide()
          else win.focus()
        } else {
          win.show()
          win.focus()
        }
      }
    },
    {
      id: 'search.focus',
      defaultAccelerator: 'CommandOrControl+Shift+F',
      label: '聚焦搜索框',
      handler: () => {
        const win = getWindow()
        if (!win) return
        win.show()
        win.focus()
        win.webContents.send('shortcut:focus-search')
      }
    },
    {
      id: 'credential.new',
      defaultAccelerator: 'CommandOrControl+Shift+N',
      label: '新建凭证',
      handler: () => {
        const win = getWindow()
        if (!win) return
        win.show()
        win.focus()
        win.webContents.send('shortcut:action', 'new-credential')
      }
    },
    {
      id: 'clipboard.pasteRecent',
      defaultAccelerator: 'CommandOrControl+Shift+P',
      label: '粘贴最近一项',
      handler: () => {
        const win = getWindow()
        if (!win) return
        win.webContents.send('shortcut:paste-recent')
      }
    },
    // HUD 全局召唤（Alt+Space）由 src/main/hud/manager.ts 实际注册；
    // 此处占位便于设置页展示，避免 Manager 二次注册冲突。
    {
      id: 'hud.toggle',
      defaultAccelerator: 'Alt+Space',
      label: '召唤 / 收起命令 HUD',
      handler: () => {
        /* no-op：由 hud/manager 接管 */
      }
    }
  ]
}
