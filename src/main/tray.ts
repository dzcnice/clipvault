/**
 * 系统托盘管理
 */

import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

/**
 * 创建系统托盘
 */
export function createTray(window: BrowserWindow): Tray {
  mainWindow = window

  // 创建托盘图标
  const iconPath = join(__dirname, '../../resources/icon-v3.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    // 如果图标加载失败，创建一个空的16x16图标
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty()
    }
  } catch {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('ClipVault · 个人剪贴板与凭证（关窗驻托盘）')

  // 创建托盘菜单
  updateTrayMenu()

  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    toggleMainWindow()
  })

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    showMainWindow()
  })

  return tray
}

/**
 * 更新托盘菜单
 */
export function updateTrayMenu(): void {
  if (!tray) return

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showMainWindow()
    },
    {
      label: '快速搜索',
      accelerator: 'CommandOrControl+Shift+F',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('shortcut:focus-search')
      }
    },
    {
      label: '命令面板 (Alt+Space)',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('shortcut:action', 'open-palette')
      }
    },
    { type: 'separator' },
    {
      label: '剪贴板历史',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('navigate', '/clipboard')
      }
    },
    {
      label: '凭证',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('navigate', '/credentials')
      }
    },
    {
      label: 'TOTP 验证码',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('navigate', '/totp')
      }
    },
    {
      label: '片段',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('navigate', '/snippets')
      }
    },
    { type: 'separator' },
    {
      label: '重新打开保险库',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('shortcut:action', 'ensure-open')
      }
    },
    {
      label: '暂停剪贴板监听',
      type: 'checkbox',
      checked: false,
      click: (menuItem) => {
        mainWindow?.webContents.send('clipboard:toggle-monitor', !menuItem.checked)
      }
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        showMainWindow()
        mainWindow?.webContents.send('navigate', '/settings')
      }
    },
    {
      label: '退出 ClipVault',
      click: () => {
        // 真退出；关窗默认只隐藏到托盘（见 main/index close 处理）
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

/**
 * 切换主窗口显示/隐藏
 */
function toggleMainWindow(): void {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide()
    } else {
      mainWindow.focus()
    }
  } else {
    showMainWindow()
  }
}

/**
 * 显示主窗口
 */
function showMainWindow(): void {
  if (!mainWindow) return

  mainWindow.show()
  mainWindow.focus()

  // 如果窗口被最小化，恢复它
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
}

/**
 * 销毁托盘
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

/**
 * 获取托盘实例
 */
export function getTray(): Tray | null {
  return tray
}
