/**
 * Sprint 13 渲染进程 API（独立片段）
 *
 * 整合方式：
 *   在 src/preload/index.ts 中：
 *     import { securityAPI } from './security-api'
 *     const api = { ..., security: securityAPI }
 */

import { ipcRenderer } from 'electron'
import type { ApiResponse } from '../types'
import {
  SECURITY_CHANNELS,
  type AutoClearEvent,
  type AutoClearStatus
} from '../types/auto-clear'
import {
  BIOMETRIC_CHANNELS,
  type BiometricAvailability,
  type BiometricEnrollResult,
  type BiometricUnlockResult
} from '../types/biometric'
import {
  AUDIT_CHANNELS,
  type CredentialAuditListParams,
  type CredentialAuditListResult,
  type RecordAuditInput
} from '../types/audit'
import {
  RECOVERY_CHANNELS,
  type RecoveryPhraseSetupResult,
  type RecoveryResetResult,
  type RecoveryStatus,
  type RecoveryVerifyChallenge,
  type RecoveryVerifyInput,
  type RecoveryVerifyMode
} from '../types/recovery'

export const securityAPI = {
  autoClear: {
    schedule: (
      secret: string,
      ttlMs?: number
    ): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(SECURITY_CHANNELS.AUTO_CLEAR_SCHEDULE, {
        secret,
        ttlMs
      }),

    cancel: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(SECURITY_CHANNELS.AUTO_CLEAR_CANCEL),

    status: (): Promise<ApiResponse<AutoClearStatus>> =>
      ipcRenderer.invoke(SECURITY_CHANNELS.AUTO_CLEAR_STATUS),

    /** 订阅 scheduled / cancelled / cleared / skipped 事件，返回 unsubscribe */
    onEvent: (callback: (event: AutoClearEvent) => void): (() => void) => {
      const handler = (
        _ev: Electron.IpcRendererEvent,
        payload: AutoClearEvent
      ): void => callback(payload)
      ipcRenderer.on(SECURITY_CHANNELS.AUTO_CLEAR_EVENT, handler)
      return () =>
        ipcRenderer.removeListener(SECURITY_CHANNELS.AUTO_CLEAR_EVENT, handler)
    }
  },

  screenProtect: {
    enable: (): Promise<ApiResponse<{ supported: boolean }>> =>
      ipcRenderer.invoke(SECURITY_CHANNELS.SCREEN_PROTECT_ENABLE),

    disable: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(SECURITY_CHANNELS.SCREEN_PROTECT_DISABLE),

    status: (): Promise<
      ApiResponse<{
        supported: boolean
        protectedCount: number
        currentWindowProtected: boolean
      }>
    > => ipcRenderer.invoke(SECURITY_CHANNELS.SCREEN_PROTECT_STATUS)
  },

  biometric: {
    availability: (): Promise<ApiResponse<BiometricAvailability>> =>
      ipcRenderer.invoke(BIOMETRIC_CHANNELS.AVAILABILITY),
    enroll: (password: string): Promise<ApiResponse<BiometricEnrollResult>> =>
      ipcRenderer.invoke(BIOMETRIC_CHANNELS.ENROLL, { password }),
    unlock: (): Promise<ApiResponse<BiometricUnlockResult>> =>
      ipcRenderer.invoke(BIOMETRIC_CHANNELS.UNLOCK),
    disable: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(BIOMETRIC_CHANNELS.DISABLE)
  },

  audit: {
    record: (input: RecordAuditInput): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(AUDIT_CHANNELS.RECORD, input),
    list: (
      params?: CredentialAuditListParams
    ): Promise<ApiResponse<CredentialAuditListResult>> =>
      ipcRenderer.invoke(AUDIT_CHANNELS.LIST, params ?? {}),
    exportCsv: (
      params?: CredentialAuditListParams
    ): Promise<ApiResponse<string>> =>
      ipcRenderer.invoke(AUDIT_CHANNELS.EXPORT_CSV, params ?? {}),
    clear: (credentialId?: string): Promise<ApiResponse<number>> =>
      ipcRenderer.invoke(AUDIT_CHANNELS.CLEAR, { credentialId })
  },

  recovery: {
    status: (): Promise<ApiResponse<RecoveryStatus>> =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.STATUS),
    setup: (): Promise<ApiResponse<RecoveryPhraseSetupResult>> =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.SETUP),
    challenge: (
      mnemonic: string[],
      mode: RecoveryVerifyMode
    ): Promise<ApiResponse<RecoveryVerifyChallenge>> =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.CHALLENGE, { mnemonic, mode }),
    verify: (
      input: RecoveryVerifyInput
    ): Promise<ApiResponse<{ ok: boolean }>> =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.VERIFY, input),
    resetPassword: (
      words: string[],
      newPassword: string
    ): Promise<ApiResponse<RecoveryResetResult>> =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.RESET_PASSWORD, {
        words,
        newPassword
      }),
    disable: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(RECOVERY_CHANNELS.DISABLE)
  }
}

export type SecurityAPI = typeof securityAPI
