/**
 * 备份相关 IPC 处理器（B-5 拆分自 data-handlers）
 * 与 src/main/backup.ts 的模块级 API 解耦
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS, ApiResponse } from '../../types'
import {
  performBackup,
  listBackups,
  restoreFromBackup,
  deleteBackup
} from '../backup'
import { wrapHandler } from './utils'

export function registerBackupIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_CREATE,
    wrapHandler((): ApiResponse<{ filePath?: string }> => {
      const result = performBackup()
      return {
        success: result.success,
        data: result.filePath ? { filePath: result.filePath } : undefined,
        error: result.success ? undefined : result.message
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_LIST,
    wrapHandler((): ApiResponse<Array<{ name: string; path: string; size: number; date: string }>> => {
      const backups = listBackups().map((b) => ({
        name: b.name,
        path: b.path,
        size: b.size,
        date: b.date.toISOString()
      }))
      return { success: true, data: backups }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_RESTORE,
    wrapHandler((_event, backupPath: string): ApiResponse<boolean> => {
      const result = restoreFromBackup(backupPath)
      return {
        success: result.success,
        data: result.success,
        error: result.success ? undefined : result.message
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DELETE,
    wrapHandler((_event, backupPath: string): ApiResponse<boolean> => {
      const result = deleteBackup(backupPath)
      return {
        success: result.success,
        data: result.success,
        error: result.success ? undefined : result.message
      }
    })
  )
}
