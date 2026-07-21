/**
 * HUD 独立 BrowserWindow 管理（v2.0 Sprint 6 · TASK-031）
 *
 * 策略：
 *   - app 启动后预热：创建窗口但 `hide()`，首次召唤延迟 < 100ms
 *   - 无边框、透明、置顶 screen-saver
 *   - 失焦自动隐藏（blur 事件）
 *   - 单例
 */

import { BrowserWindow, screen, app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { logger } from '../utils/logger'
import {
  registerTrustedWebContents,
  unregisterTrustedWebContents
} from '../ipc/utils'

let hudWindow: BrowserWindow | null = null

/** 返回当前 HUD 窗口（可能为 null） */
export function getHUDWindow(): BrowserWindow | null {
  return hudWindow
}

/** 创建 HUD 窗口（预热用；首次调用后保持单例） */
export function createHUDWindow(): BrowserWindow {
  if (hudWindow && !hudWindow.isDestroyed()) {
    return hudWindow
  }

  const { width: screenW } = screen.getPrimaryDisplay().workAreaSize
  const width = 640
  const height = 480

  hudWindow = new BrowserWindow({
    width,
    height,
    x: Math.floor((screenW - width) / 2),
    // y 在 showHUD 时按 workArea 重新算，避免多屏幕偏差
    y: 160,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  hudWindow.setAlwaysOnTop(true, 'screen-saver')
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 失焦自动隐藏
  hudWindow.on('blur', () => {
    if (hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
      hudWindow.hide()
    }
  })

  // v2.1 G3-3：HUD webContents 加入 IPC 白名单
  registerTrustedWebContents(hudWindow.webContents.id)
  const hudWcId = hudWindow.webContents.id

  hudWindow.on('closed', () => {
    unregisterTrustedWebContents(hudWcId)
    hudWindow = null
  })

  // 加载 HUD 页面（复用 renderer 构建，用 hash 区分入口）
  // renderer 内用 location.hash === '#hud' 挂 HUDRoot
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#hud`)
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'hud' })
  }

  logger.info('[HUD] Window created (preheat)')
  return hudWindow
}

/** 显示 HUD（若未创建则先创建） */
export function showHUD(): void {
  const win = hudWindow && !hudWindow.isDestroyed() ? hudWindow : createHUDWindow()

  // 每次弹出都居中上 1/4 屏
  try {
    const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize
    const size = win.getSize()
    const w = size[0] ?? 640
    win.setPosition(
      Math.floor((screenW - w) / 2),
      Math.floor(screenH * 0.2),
      false
    )
  } catch {
    /* ignore */
  }

  win.show()
  win.focus()
  win.webContents.send('hud:shown')
}

/** 隐藏 HUD */
export function hideHUD(): void {
  if (hudWindow && !hudWindow.isDestroyed() && hudWindow.isVisible()) {
    hudWindow.hide()
    hudWindow.webContents.send('hud:hidden')
  }
}

/** 切换 HUD 可见性（快捷键调用） */
export function toggleHUD(): void {
  const win = hudWindow && !hudWindow.isDestroyed() ? hudWindow : createHUDWindow()
  if (win.isVisible()) {
    hideHUD()
  } else {
    showHUD()
  }
}

/** 销毁 HUD 窗口（app 退出时） */
export function destroyHUDWindow(): void {
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.destroy()
  }
  hudWindow = null
}

// app 退出时兜底清理
app.on('before-quit', () => {
  destroyHUDWindow()
})
