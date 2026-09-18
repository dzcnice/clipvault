/**
 * IPC 处理器统一注册
 *
 * v3.0 个人本地版：仅注册单机核心能力。
 * 已下线：Team/P2P、Vera AI、CLI/HTTP/SSH、Webhook UI、文件传输、Overlay。
 */

import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../types'
import { registerCredentialHandlers } from './credential-handlers'
import { registerClipboardHandlers } from './clipboard-handlers'
import { registerCategoryHandlers } from './category-handlers'
import { registerExportHandlers } from './export-handlers'
import { registerImportHandlers } from './import-handlers'
import { registerBackupIpcHandlers } from './backup-ipc-handlers'
import { registerVaultHandlers } from './vault-handlers'
import { registerShortcutHandlers } from './shortcuts-handlers'
import { registerKeyInterceptIPC } from './key-intercept-registry'
import { registerHudIPC } from './hud-registry'
import { registerToolsIPC } from './tools-registry'
import { registerSecurityIPC } from './security-registry'
import { registerUpdaterIPC } from './updater-registry'
import { registerSystemHandlers } from './system-handlers'
import { logger } from '../utils/logger'

/** 注册所有 IPC 处理器（个人本地版） */
export function registerAllHandlers(mainWindow: BrowserWindow): void {
  registerVaultHandlers(mainWindow)
  registerCredentialHandlers()
  registerCategoryHandlers()
  registerClipboardHandlers(mainWindow)
  registerExportHandlers(mainWindow)
  registerImportHandlers(mainWindow)
  registerBackupIpcHandlers()
  registerShortcutHandlers()
  registerSystemHandlers()

  registerKeyInterceptIPC(mainWindow)
  registerToolsIPC(mainWindow)
  registerSecurityIPC(mainWindow)
  registerUpdaterIPC(mainWindow)
  registerHudIPC(mainWindow)

  ipcMain.handle(IPC_CHANNELS.LOG_RENDERER_ERROR, (_event, payload: unknown) => {
    logger.error('[renderer-error]', payload)
    return { success: true }
  })

  logger.info('[IPC] Personal-local handlers registered')
}

export { registerCredentialHandlers } from './credential-handlers'
export { registerClipboardHandlers } from './clipboard-handlers'
export { registerCategoryHandlers } from './category-handlers'
export { registerExportHandlers } from './export-handlers'
export { registerImportHandlers } from './import-handlers'
export { registerBackupIpcHandlers } from './backup-ipc-handlers'
export { registerVaultHandlers } from './vault-handlers'
export { registerShortcutHandlers } from './shortcuts-handlers'
