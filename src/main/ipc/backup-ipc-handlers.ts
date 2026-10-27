/**
 * 备份相关 IPC 处理器（B-5 拆分自 data-handlers）
 * 与 src/main/backup.ts 的模块级 API 解耦
 */

import { ipcMain, dialog } from 'electron'
import { copyFileSync } from 'node:fs'
import { basename } from 'node:path'
import { IPC_CHANNELS, ApiResponse } from '../../types'
import {
  performBackup,
  listBackups,
  restoreFromBackup,
  deleteBackup
} from '../backup'
import { wrapHandler, wrapUnlockedHandler } from './utils'

export function registerBackupIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.BACKUP_EXPORT, wrapUnlockedHandler(async (_event, password: string) => {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('备份密码需要 12 到 1024 个字符')
    const selected = await dialog.showSaveDialog({ title: '导出完整加密备份', defaultPath: `ClipVault-${new Date().toISOString().slice(0, 10)}.cvbackup`, filters: [{ name: 'ClipVault 完整备份', extensions: ['cvbackup'] }] })
    if (selected.canceled || !selected.filePath) return { success: true, data: {} }
    const result = performBackup(password)
    if (!result.success || !result.filePath) return { success: false, error: result.message }
    copyFileSync(result.filePath, selected.filePath)
    return { success: true, data: { filePath: selected.filePath } }
  }))
  ipcMain.handle(IPC_CHANNELS.BACKUP_IMPORT, wrapUnlockedHandler(async (_event, password?: string) => {
    if (password !== undefined && (typeof password !== 'string' || password.length > 1024)) throw new Error('备份密码格式无效')
    const selected = await dialog.showOpenDialog({ title: '选择完整备份', properties: ['openFile'], filters: [{ name: 'ClipVault 备份', extensions: ['cvbackup', 'db'] }] })
    if (selected.canceled || !selected.filePaths[0]) return { success: true, data: false }
    const confirm = await dialog.showMessageBox({ type: 'warning', title: '恢复备份', message: `将恢复“${basename(selected.filePaths[0])}”并替换当前资料库。`, detail: '会先校验备份与图片并备份当前数据。外部代码项目不包含在备份中，恢复后需要重新核对目录。', buttons: ['取消', '确认恢复'], defaultId: 0, cancelId: 0 })
    if (confirm.response !== 1) return { success: true, data: false }
    const result = restoreFromBackup(selected.filePaths[0], password || undefined, true)
    return { success: result.success, data: result.success, error: result.success ? undefined : result.message }
  }))
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
