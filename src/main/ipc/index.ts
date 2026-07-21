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
import { registerSprint4IPC } from './sprint4-registry'
import { registerSprint6IPC } from './sprint6-registry'
import { registerSprint11IPC } from './sprint11-registry'
import { registerSprint13IPC } from './sprint13-registry'
import { registerSprint14IPC } from './sprint14-registry'
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

  // 密钥拦截
  registerSprint4IPC(mainWindow)
  // TOTP / 密码生成 / 健康检查 / HIBP
  registerSprint11IPC(mainWindow)
  // 自动清空 / 反截屏 / 生物识别 / 审计 / BIP39
  registerSprint13IPC(mainWindow)
  // 自动更新 + 导入
  registerSprint14IPC(mainWindow)
  // HUD / 命令面板
  registerSprint6IPC(mainWindow)

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
