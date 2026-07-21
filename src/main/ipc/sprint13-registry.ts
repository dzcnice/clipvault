/**
 * Sprint 13 独立 IPC 注册入口
 *
 * 整合方式：
 *   在 src/main/ipc/index.ts 的 registerAllHandlers() 中追加：
 *     import { registerSprint13IPC } from './sprint13-registry'
 *     registerSprint13IPC(mainWindow)
 *
 * 范围：
 *   - TASK-068 剪贴板自动清空（schedule / cancel / status + event 广播）
 *   - TASK-069 反截屏保护（enable / disable / status，作用于 mainWindow）
 *
 * 注意：
 *   - 本 registry 仅暴露 IPC 入口，真实"复制凭证后调度自动清空"
 *     仍需整合人在 credential-handlers 的 COPY 处理点上调用
 *     `clipboardAutoClear.schedule(value)`；同理在 monitor 检测到
 *     新内容时调用 `clipboardAutoClear.cancel()`。
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { ApiResponse } from '../../types'
import {
  SPRINT13_CHANNELS,
  type AutoClearStatus
} from '../../types/auto-clear'
import {
  BIOMETRIC_CHANNELS,
  type BiometricAvailability,
  type BiometricEnrollResult,
  type BiometricUnlockResult
} from '../../types/biometric'
import {
  AUDIT_CHANNELS,
  type CredentialAuditListParams,
  type CredentialAuditListResult,
  type RecordAuditInput
} from '../../types/audit'
import {
  RECOVERY_CHANNELS,
  type RecoveryPhraseSetupResult,
  type RecoveryResetResult,
  type RecoveryStatus,
  type RecoveryVerifyChallenge,
  type RecoveryVerifyInput,
  type RecoveryVerifyMode
} from '../../types/recovery'
import {
  clipboardAutoClear,
  DEFAULT_AUTO_CLEAR_TTL_MS
} from '../clipboard/auto-clear'
import {
  screenProtection,
  isScreenProtectionSupported
} from '../security/screen-protection'
import * as biometric from '../biometric'
import { auditLogger } from '../audit/logger'
import * as recovery from '../recovery/phrase'
import { buildChallenge } from '../recovery/verifier'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'

export interface SchedulePayload {
  secret: string
  ttlMs?: number
}

let registered = false

export function registerSprint13IPC(mainWindow: BrowserWindow | null): void {
  if (registered) {
    logger.warn('[IPC] Sprint13 registry already registered, skip')
    return
  }
  registered = true

  // ============== TASK-068 auto-clear ==============
  ipcMain.handle(
    SPRINT13_CHANNELS.AUTO_CLEAR_SCHEDULE,
    wrapHandler(async (
      _ev,
      payload: SchedulePayload
    ): Promise<ApiResponse<boolean>> => {
      try {
        if (!payload || typeof payload.secret !== 'string') {
          return { success: false, error: 'invalid payload' }
        }
        clipboardAutoClear.schedule(
          payload.secret,
          payload.ttlMs ?? DEFAULT_AUTO_CLEAR_TTL_MS
        )
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT13_CHANNELS.AUTO_CLEAR_CANCEL,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        clipboardAutoClear.cancel()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT13_CHANNELS.AUTO_CLEAR_STATUS,
    wrapHandler(async (): Promise<ApiResponse<AutoClearStatus>> => {
      try {
        return { success: true, data: clipboardAutoClear.getStatus() }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // 事件广播 → 渲染进程
  const broadcast = (payload: unknown): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
      mainWindow.webContents.send(SPRINT13_CHANNELS.AUTO_CLEAR_EVENT, payload)
    } catch (err) {
      logger.warn('[Sprint13] broadcast failed:', (err as Error).message)
    }
  }
  clipboardAutoClear.on('scheduled', (data) =>
    broadcast({ type: 'scheduled', ...data })
  )
  clipboardAutoClear.on('cancelled', () => broadcast({ type: 'cancelled' }))
  clipboardAutoClear.on('cleared', () => broadcast({ type: 'cleared' }))
  clipboardAutoClear.on('skipped', (data) =>
    broadcast({ type: 'skipped', ...data })
  )

  // ============== TASK-069 screen-protection ==============
  ipcMain.handle(
    SPRINT13_CHANNELS.SCREEN_PROTECT_ENABLE,
    wrapHandler(async (event): Promise<ApiResponse<{ supported: boolean }>> => {
      try {
        const supported = isScreenProtectionSupported()
        const win =
          BrowserWindow.fromWebContents(event.sender) ?? mainWindow
        if (win) screenProtection.protect(win)
        return { success: true, data: { supported } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT13_CHANNELS.SCREEN_PROTECT_DISABLE,
    wrapHandler(async (event): Promise<ApiResponse<boolean>> => {
      try {
        const win =
          BrowserWindow.fromWebContents(event.sender) ?? mainWindow
        if (win) {
          // 手动调用 disable + 从 manager 移除
          screenProtection.unprotectAll()
        }
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT13_CHANNELS.SCREEN_PROTECT_STATUS,
    wrapHandler(async (
      event
    ): Promise<
      ApiResponse<{
        supported: boolean
        protectedCount: number
        currentWindowProtected: boolean
      }>
    > => {
      try {
        const win =
          BrowserWindow.fromWebContents(event.sender) ?? mainWindow
        return {
          success: true,
          data: {
            supported: isScreenProtectionSupported(),
            protectedCount: screenProtection.size(),
            currentWindowProtected: win
              ? screenProtection.isProtected(win)
              : false
          }
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // ============== TASK-067 biometric ==============
  ipcMain.handle(
    BIOMETRIC_CHANNELS.AVAILABILITY,
    wrapHandler(async (): Promise<ApiResponse<BiometricAvailability>> => {
      try {
        return { success: true, data: biometric.getAvailability() }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    BIOMETRIC_CHANNELS.ENROLL,
    wrapHandler(async (
      _ev,
      payload: { password: string }
    ): Promise<ApiResponse<BiometricEnrollResult>> => {
      try {
        const r = await biometric.enroll(payload?.password ?? '')
        return { success: true, data: r }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    BIOMETRIC_CHANNELS.UNLOCK,
    wrapHandler(async (): Promise<ApiResponse<BiometricUnlockResult>> => {
      try {
        const r = await biometric.unlock()
        return { success: true, data: r }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    BIOMETRIC_CHANNELS.DISABLE,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        biometric.disable()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // ============== TASK-070 audit ==============
  ipcMain.handle(
    AUDIT_CHANNELS.RECORD,
    wrapHandler(async (_ev, payload: RecordAuditInput): Promise<ApiResponse<boolean>> => {
      try {
        if (!payload?.credentialId || !payload?.action) {
          return { success: false, error: 'invalid payload' }
        }
        auditLogger.record(payload)
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    AUDIT_CHANNELS.LIST,
    wrapHandler(async (
      _ev,
      params?: CredentialAuditListParams
    ): Promise<ApiResponse<CredentialAuditListResult>> => {
      try {
        return { success: true, data: auditLogger.list(params ?? {}) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    AUDIT_CHANNELS.EXPORT_CSV,
    wrapHandler(async (
      _ev,
      params?: CredentialAuditListParams
    ): Promise<ApiResponse<string>> => {
      try {
        return { success: true, data: auditLogger.exportCsv(params ?? {}) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    AUDIT_CHANNELS.CLEAR,
    wrapHandler(async (
      _ev,
      payload?: { credentialId?: string }
    ): Promise<ApiResponse<number>> => {
      try {
        return { success: true, data: auditLogger.clear(payload?.credentialId) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // ============== TASK-071 recovery ==============
  ipcMain.handle(
    RECOVERY_CHANNELS.STATUS,
    wrapHandler(async (): Promise<ApiResponse<RecoveryStatus>> => {
      try {
        return {
          success: true,
          data: {
            enrolled: recovery.isEnrolled(),
            lastVerifiedAt: recovery.lastVerifiedAt()
          }
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    RECOVERY_CHANNELS.SETUP,
    wrapHandler(async (): Promise<ApiResponse<RecoveryPhraseSetupResult>> => {
      try {
        const words = recovery.setupRecoveryPhrase()
        return { success: true, data: { success: true, mnemonic: words } }
      } catch (err) {
        return {
          success: true,
          data: { success: false, mnemonic: [], error: (err as Error).message }
        }
      }
    })
  )

  ipcMain.handle(
    RECOVERY_CHANNELS.CHALLENGE,
    wrapHandler(async (
      _ev,
      payload: { mnemonic: string[]; mode: RecoveryVerifyMode }
    ): Promise<ApiResponse<RecoveryVerifyChallenge>> => {
      try {
        if (!payload?.mnemonic || !payload?.mode) {
          return { success: false, error: 'invalid payload' }
        }
        return { success: true, data: buildChallenge(payload.mnemonic, payload.mode) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    RECOVERY_CHANNELS.VERIFY,
    wrapHandler(async (
      _ev,
      payload: RecoveryVerifyInput
    ): Promise<ApiResponse<{ ok: boolean }>> => {
      try {
        const ok = recovery.verifyMnemonic(payload?.words ?? [])
        return { success: true, data: { ok } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    RECOVERY_CHANNELS.RESET_PASSWORD,
    wrapHandler(async (
      _ev,
      payload: { words: string[]; newPassword: string }
    ): Promise<ApiResponse<RecoveryResetResult>> => {
      try {
        return {
          success: true,
          data: recovery.resetPasswordWithPhrase(
            payload?.words ?? [],
            payload?.newPassword ?? ''
          )
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    RECOVERY_CHANNELS.DISABLE,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        recovery.disableRecovery()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  logger.info(
    '[IPC] Sprint13 registry ready (auto-clear + screen-protection + biometric + audit + recovery)'
  )
}

/** 测试 / 热重载用：移除所有本 registry 注册的 handlers */
export function _unregisterSprint13ForTests(): void {
  registered = false
  for (const ch of [
    SPRINT13_CHANNELS.AUTO_CLEAR_SCHEDULE,
    SPRINT13_CHANNELS.AUTO_CLEAR_CANCEL,
    SPRINT13_CHANNELS.AUTO_CLEAR_STATUS,
    SPRINT13_CHANNELS.SCREEN_PROTECT_ENABLE,
    SPRINT13_CHANNELS.SCREEN_PROTECT_DISABLE,
    SPRINT13_CHANNELS.SCREEN_PROTECT_STATUS,
    BIOMETRIC_CHANNELS.AVAILABILITY,
    BIOMETRIC_CHANNELS.ENROLL,
    BIOMETRIC_CHANNELS.UNLOCK,
    BIOMETRIC_CHANNELS.DISABLE,
    AUDIT_CHANNELS.RECORD,
    AUDIT_CHANNELS.LIST,
    AUDIT_CHANNELS.EXPORT_CSV,
    AUDIT_CHANNELS.CLEAR,
    RECOVERY_CHANNELS.STATUS,
    RECOVERY_CHANNELS.SETUP,
    RECOVERY_CHANNELS.CHALLENGE,
    RECOVERY_CHANNELS.VERIFY,
    RECOVERY_CHANNELS.RESET_PASSWORD,
    RECOVERY_CHANNELS.DISABLE
  ]) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      // ignore
    }
  }
  clipboardAutoClear.removeAllListeners()
}
