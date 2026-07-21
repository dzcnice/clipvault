/**
 * Vault（主密码）IPC 处理器
 *
 * 前端通过 window.api.vault.* 调用；未解锁时所有凭证接口会被 requireUnlock 拒绝
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS, ApiResponse } from '../../types'
import * as vault from '../crypto/vault'
import * as osCrypto from '../crypto'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'
import { backfillClipboardEncryption } from '../../db/clipboard-store'

/**
 * C1 · vault 解锁成功后触发剪贴板明文 → 密文回填（幂等）
 *
 * 异步 fire-and-forget：不阻塞 IPC 响应；失败仅写日志。
 * 进程内 backfillRunning 锁保证并发安全。
 */
function triggerClipboardBackfill(): void {
  const onProgress = (p: { done: number; total: number }): void => {
    // U5 · 向所有渲染窗口推送 backfill 进度；GlobalProgressBar 订阅此事件
    try {
      const wins = BrowserWindow.getAllWindows()
      for (const w of wins) {
        if (!w.isDestroyed()) {
          w.webContents.send('clipboard:backfill-progress', p)
        }
      }
    } catch {
      /* ignore broadcast error */
    }
  }
  void backfillClipboardEncryption(onProgress)
    .then((r) => {
      if (r.scanned > 0) {
        logger.info(
          `[Backfill] clipboard encryption: scanned=${r.scanned} migrated=${r.migrated} skipped=${r.skipped}`
        )
      }
    })
    .catch((err) => {
      logger.error('[Backfill] clipboard encryption failed:', err)
    })
}

export function registerVaultHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.VAULT_IS_INITIALIZED,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      return { success: true, data: vault.isVaultInitialized() }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_IS_UNLOCKED,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      return { success: true, data: vault.isUnlocked() }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_ENSURE_OPEN,
    wrapHandler(async (): Promise<
      ApiResponse<{ mode: string } | null>
    > => {
      try {
        const result = vault.ensureVaultOpen()
        if (!result.ok) {
          return {
            success: false,
            error: result.message,
            data: null
          }
        }
        triggerClipboardBackfill()
        return { success: true, data: { mode: result.mode } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_MIGRATE_TO_SAFE,
    wrapHandler(async (_event, password: string): Promise<ApiResponse<boolean>> => {
      try {
        const ok = vault.migratePasswordVaultToSafeStorage(password)
        if (ok) triggerClipboardBackfill()
        return { success: ok, data: ok, error: ok ? undefined : '旧密码不正确' }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_OS_SUPPORTED,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      return { success: true, data: osCrypto.isEncryptionAvailable() }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_GET_MODE,
    wrapHandler(async (): Promise<ApiResponse<string | null>> => {
      return { success: true, data: vault.getVaultMode() }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_SETUP,
    wrapHandler(async (_event, password: string): Promise<ApiResponse<boolean>> => {
      try {
        vault.createVault(password)
        triggerClipboardBackfill()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_SETUP_SAFESTORAGE,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        vault.createVaultSafeStorage()
        triggerClipboardBackfill()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_UNLOCK,
    wrapHandler(async (_event, password: string): Promise<ApiResponse<boolean>> => {
      const mode = vault.getVaultMode()
      try {
        let ok = false
        if (mode === 'safestorage') {
          ok = vault.unlockVaultSafeStorage()
        } else {
          ok = vault.unlockVault(password)
        }
        if (ok) {
          triggerClipboardBackfill()
        }
        return { success: true, data: ok }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_LOCK,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      vault.lockVault()
      // 通知渲染端回到锁屏
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.VAULT_LOCKED_EVENT)
      }
      return { success: true, data: true }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.VAULT_CHANGE_PASSWORD,
    wrapHandler(
      async (
        _event,
        payload: { oldPassword: string; newPassword: string }
      ): Promise<ApiResponse<boolean>> => {
        try {
          const ok = vault.changePassword(payload.oldPassword, payload.newPassword)
          return { success: true, data: ok }
        } catch (err) {
          return { success: false, error: (err as Error).message }
        }
      }
    )
  )

  logger.info('[IPC] Vault handlers registered')
}
