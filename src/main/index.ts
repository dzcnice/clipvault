/**
 * Electron 主进程入口
 */

import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import AutoLaunch from 'auto-launch'
import { initDatabase, closeDatabase } from '../db/connection'
import { registerAllHandlers } from './ipc'
import { destroyClipboardMonitor } from './clipboard/monitor'
import { createTray, destroyTray } from './tray'
import { initGlobalShortcuts, unregisterAllShortcuts } from './shortcuts'
import { startAutoBackup, stopAutoBackup } from './backup'
import { ensureVaultOpen } from './crypto/vault'
import { IPC_CHANNELS } from '../types'
import { logger } from './utils/logger'
import { safeOpenExternal } from './security/open-external'
import {
  registerTrustedWebContents,
  unregisterTrustedWebContents
} from './ipc/utils'

let mainWindow: BrowserWindow | null = null
let isQuitting = false

// 开机自启配置
const autoLauncher = new AutoLaunch({
  name: 'ClipVault',
  isHidden: true // 启动时隐藏窗口
})

function createWindow(): void {
  // 创建浏览器窗口（v2.0 UI 精致化：更大初始尺寸 + macOS 圆角 + 阴影）
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    frame: false, // 无边框窗口
    transparent: true, // 启用透明以配合液态玻璃效果
    hasShadow: true, // macOS 窗口阴影（Windows 下 CSS 提供）
    roundedCorners: true, // macOS 原生圆角（Windows 无效，用 CSS border-radius）
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // A-3：收紧 renderer 沙箱。preload 仅用 @electron-toolkit/preload 的轻量 API，
      //      不依赖 Node 运行时，sandbox=true 兼容
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // 如果是开机自启，则隐藏窗口
    if (!app.commandLine.hasSwitch('hidden')) {
      mainWindow?.show()
    }
  })

  // 关闭窗口时最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // v2.1 G3-2：白名单网关，禁止任意 URL 直通 shell
    safeOpenExternal(details.url)
    return { action: 'deny' }
  })

  // v2.1 G3-3：把主窗口 webContents 加入 IPC sender 白名单
  registerTrustedWebContents(mainWindow.webContents.id)
  mainWindow.on('closed', () => {
    if (mainWindow) unregisterTrustedWebContents(mainWindow.webContents.id)
  })

  // σ2 · P2-7：主进程窗口状态 → 渲染端 TitleBar
  //   当用户通过系统边缘拖动或 Win+↑ 最大化时，TitleBar 也需要同步图标。
  //   这里订阅 maximize / unmaximize / always-on-top-changed，并广播到 renderer。
  const broadcastWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_STATE_EVENT, {
      maximized: mainWindow.isMaximized(),
      alwaysOnTop: mainWindow.isAlwaysOnTop()
    })
  }
  mainWindow.on('maximize', broadcastWindowState)
  mainWindow.on('unmaximize', broadcastWindowState)
  mainWindow.on('always-on-top-changed', broadcastWindowState)

  // 注册窗口控制 IPC
  registerWindowHandlers()

  // 注册所有业务 IPC 处理器（包括 Sprint 6 HUD/命令面板）
  registerAllHandlers(mainWindow)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** 注册窗口控制 IPC */
function registerWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, () => {
    mainWindow?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_ALWAYS_ON_TOP, () => {
    if (mainWindow) {
      const isOnTop = mainWindow.isAlwaysOnTop()
      mainWindow.setAlwaysOnTop(!isOnTop)
      return !isOnTop
    }
    return false
  })

  // σ2 · P2-7：TitleBar mount 时查一次真实窗口状态
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { maximized: false, alwaysOnTop: false }
    }
    return {
      maximized: mainWindow.isMaximized(),
      alwaysOnTop: mainWindow.isAlwaysOnTop()
    }
  })

  // 开机自启设置
  ipcMain.handle(IPC_CHANNELS.APP_GET_AUTO_LAUNCH, async () => {
    try {
      return await autoLauncher.isEnabled()
    } catch {
      return false
    }
  })

  ipcMain.handle(IPC_CHANNELS.APP_SET_AUTO_LAUNCH, async (_, enabled: boolean) => {
    try {
      if (enabled) {
        await autoLauncher.enable()
      } else {
        await autoLauncher.disable()
      }
      return true
    } catch (error) {
      logger.error('[AutoLaunch] Error:', error)
      return false
    }
  })

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.clipvault')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 初始化数据库
  try {
    initDatabase()
    logger.info('[App] Database initialized')
  } catch (error) {
    logger.error('[App] Failed to initialize database:', error)
    app.quit()
    return
  }

  // v3.1：主进程启动即自动打开 / 创建无密码 vault，避免剪贴板监听抢跑
  try {
    const result = ensureVaultOpen()
    if (result.ok) {
      logger.info(`[App] Vault open (${result.mode})`)
    } else {
      logger.warn(`[App] Vault not auto-opened: ${result.reason} — ${result.message}`)
    }
  } catch (error) {
    logger.error('[App] ensureVaultOpen failed:', error)
  }

  createWindow()

  // 初始化系统托盘
  if (mainWindow) {
    createTray(mainWindow)
    logger.info('[App] System tray created')
  }

  // 初始化全局快捷键
  if (mainWindow) {
    initGlobalShortcuts(mainWindow)
    logger.info('[App] Global shortcuts registered')
  }

  // 启动自动备份（每24小时）
  startAutoBackup(24)
  logger.info('[App] Auto backup started')

  // v3.0 个人本地版：不再启动 Tailscale overlay / P2P

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前清理
let _shuttingDown = false
app.on('before-quit', async (event) => {
  if (_shuttingDown) return
  _shuttingDown = true
  isQuitting = true
  event.preventDefault()
  destroyClipboardMonitor()
  destroyTray()
  unregisterAllShortcuts()
  stopAutoBackup()
  closeDatabase()
  logger.info('[App] Cleanup completed')
  app.exit(0)
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
