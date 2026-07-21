/**
 * 自动备份管理
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, unlinkSync, copyFileSync, statSync } from 'fs'
import { showBackupNotification } from './notification'
import { closeDatabase, initDatabase } from '../db/connection'
import { backfillClipboardEncryption } from '../db/clipboard-store'
import * as vault from './crypto/vault'
import { IPC_CHANNELS } from '../types'
import { logger } from './utils/logger'

const BACKUP_DIR_NAME = 'backups'
const MAX_BACKUP_DAYS = 7
const DB_FILE_NAME = 'clipvault.db'

let backupInterval: NodeJS.Timeout | null = null
let backupEnabled = true

/**
 * 获取备份目录路径
 */
function getBackupDir(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, BACKUP_DIR_NAME)
}

/**
 * 获取数据库文件路径
 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, DB_FILE_NAME)
}

/**
 * 确保备份目录存在
 * A-4：对类 Unix 系统用 0o700 保证仅当前用户可读写；Windows 会忽略 mode
 */
function ensureBackupDir(): void {
  const backupDir = getBackupDir()
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true, mode: 0o700 })
  }
}

/**
 * 生成备份文件名
 */
function generateBackupFileName(): string {
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0] ?? '' // YYYY-MM-DD
  const timeStr = (now.toTimeString().split(' ')[0] ?? '').replace(/:/g, '-') // HH-MM-SS
  return `clipvault-backup-${dateStr}_${timeStr}.db`
}

/**
 * 执行备份
 */
export function performBackup(): { success: boolean; message: string; filePath?: string } {
  try {
    const dbPath = getDbPath()

    // 检查数据库文件是否存在
    if (!existsSync(dbPath)) {
      return { success: false, message: '数据库文件不存在' }
    }

    ensureBackupDir()
    const backupDir = getBackupDir()
    const backupFileName = generateBackupFileName()
    const backupPath = join(backupDir, backupFileName)

    // C1 · 备份前强制触发剪贴板明文 → 密文回填，确保物理副本不含明文。
    // 仅在 vault 已解锁时执行；未解锁则跳过（用户尚未解锁过的库本就无新增明文，
    // 仅遗留 legacy 明文，会在下次解锁时被回填，然后下次备份就干净了）。
    if (vault.isUnlocked()) {
      try {
        // backfill 体内均为 better-sqlite3 同步调用，async 包装只影响返回值，
        // 调用后 DB 的明文列已在 copyFileSync 之前完成清空。
        const r = backfillClipboardEncryption()
        void r.then((res) => {
          if (res.scanned > 0) {
            logger.info(
              `[Backup] pre-backup backfill: scanned=${res.scanned} migrated=${res.migrated} skipped=${res.skipped}`
            )
          }
        })
      } catch (err) {
        logger.warn('[Backup] pre-backup backfill failed (continuing): ' + String(err))
      }
    }

    // 复制数据库文件
    copyFileSync(dbPath, backupPath)

    logger.info(
      `[Backup] Created backup: ${backupPath} (备份文件包含加密数据库；遗忘主密码将无法恢复)`
    )

    // 清理旧备份
    cleanOldBackups()

    return {
      success: true,
      message: '备份成功',
      filePath: backupPath
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    logger.error('[Backup] Backup failed:', error)
    return { success: false, message: errorMessage }
  }
}

/**
 * 清理超过保留天数的备份
 */
function cleanOldBackups(): void {
  try {
    const backupDir = getBackupDir()
    if (!existsSync(backupDir)) return

    const files = readdirSync(backupDir)
    const now = Date.now()
    const maxAge = MAX_BACKUP_DAYS * 24 * 60 * 60 * 1000 // 毫秒

    for (const file of files) {
      if (!file.startsWith('clipvault-backup-') || !file.endsWith('.db')) {
        continue
      }

      const filePath = join(backupDir, file)
      const stats = statSync(filePath)
      const fileAge = now - stats.mtime.getTime()

      if (fileAge > maxAge) {
        unlinkSync(filePath)
        logger.info(`[Backup] Deleted old backup: ${file}`)
      }
    }
  } catch (error) {
    logger.error('[Backup] Failed to clean old backups:', error)
  }
}

/**
 * 获取所有备份文件列表
 */
export function listBackups(): Array<{ name: string; path: string; size: number; date: Date }> {
  try {
    const backupDir = getBackupDir()
    if (!existsSync(backupDir)) return []

    const files = readdirSync(backupDir)
    const backups: Array<{ name: string; path: string; size: number; date: Date }> = []

    for (const file of files) {
      if (!file.startsWith('clipvault-backup-') || !file.endsWith('.db')) {
        continue
      }

      const filePath = join(backupDir, file)
      const stats = statSync(filePath)

      backups.push({
        name: file,
        path: filePath,
        size: stats.size,
        date: stats.mtime
      })
    }

    // 按日期降序排序
    backups.sort((a, b) => b.date.getTime() - a.date.getTime())

    return backups
  } catch (error) {
    logger.error('[Backup] Failed to list backups:', error)
    return []
  }
}

/**
 * 从备份恢复（P0-6 修复）
 * 步骤：
 * 1. 关闭当前 DB 连接（避免 Windows 文件锁冲突与运行中查询命中旧 handle）
 * 2. 覆盖物理文件
 * 3. 重新打开连接（触发 initSchema 的兼容迁移）
 * 4. 锁定 vault 并通知渲染端回到解锁页（恢复后的 DEK 必须重新派生）
 */
export function restoreFromBackup(backupPath: string): { success: boolean; message: string } {
  try {
    if (!existsSync(backupPath)) {
      return { success: false, message: '备份文件不存在' }
    }

    const dbPath = getDbPath()

    // 先备份当前数据库（失败不阻塞，仅告警）
    const currentBackup = performBackup()
    if (!currentBackup.success) {
      logger.warn('[Backup] Warning: Could not backup current database before restore')
    }

    // 1) 断开现有连接
    closeDatabase()

    // 2) 覆盖 db 文件
    copyFileSync(backupPath, dbPath)

    // 3) 重新打开（initDatabase 内部会调 initSchema 完成迁移）
    initDatabase()

    // 4) 锁定 vault 并通知所有窗口回到解锁页
    vault.lockVault()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.VAULT_LOCKED_EVENT)
      }
    }

    logger.info(`[Backup] Restored from: ${backupPath}`)
    return { success: true, message: '恢复成功，请重新解锁' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    logger.error('[Backup] Restore failed:', error)
    return { success: false, message: errorMessage }
  }
}

/**
 * 删除指定备份
 */
export function deleteBackup(backupPath: string): { success: boolean; message: string } {
  try {
    if (!existsSync(backupPath)) {
      return { success: false, message: '备份文件不存在' }
    }

    unlinkSync(backupPath)
    logger.info(`[Backup] Deleted backup: ${backupPath}`)

    return { success: true, message: '删除成功' }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误'
    logger.error('[Backup] Delete failed:', error)
    return { success: false, message: errorMessage }
  }
}

/**
 * 启动自动备份定时器
 * @param intervalHours 备份间隔（小时），默认24小时
 */
export function startAutoBackup(intervalHours = 24): void {
  if (backupInterval) {
    clearInterval(backupInterval)
  }

  const intervalMs = intervalHours * 60 * 60 * 1000

  // 立即执行一次备份
  if (backupEnabled) {
    const result = performBackup()
    if (result.success) {
      showBackupNotification(true, '自动备份已完成')
    }
  }

  // 设置定时备份
  backupInterval = setInterval(() => {
    if (backupEnabled) {
      const result = performBackup()
      showBackupNotification(result.success, result.message)
    }
  }, intervalMs)

  logger.info(`[Backup] Auto backup started, interval: ${intervalHours} hours`)
}

/**
 * 停止自动备份
 */
export function stopAutoBackup(): void {
  if (backupInterval) {
    clearInterval(backupInterval)
    backupInterval = null
    logger.info('[Backup] Auto backup stopped')
  }
}

/**
 * 设置自动备份启用状态
 */
export function setAutoBackupEnabled(enabled: boolean): void {
  backupEnabled = enabled
}

// B-9：isAutoBackupEnabled / getBackupDirPath 清理；未使用的 getter
