/**
 * Sprint 11 独立 IPC 注册入口
 *
 * 整合方式：
 *   在 src/main/ipc/index.ts 的 registerAllHandlers() 中追加：
 *     import { registerSprint11IPC } from './sprint11-registry'
 *     registerSprint11IPC(mainWindow)
 *
 * 范围：
 *   - TASK-057 TOTP upsert / delete / get / generate / parse-uri
 *   - TASK-058 Password generator（strong / passphrase / pin）+ zxcvbn 评估
 *   - TASK-059 Health report + HIBP
 *   - TASK-060 URL meta 抓取
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { ApiResponse } from '../../types'
import {
  SPRINT11_CHANNELS,
  type OtpauthParseResult,
  type TOTPCode,
  type TOTPConfig,
  type TOTPUpsertInput
} from '../../types/totp'
import type { HealthReportStatus, HIBPCheckResult } from '../../types/health'
import { generateFromConfig } from '../totp/generator'
import { parseOtpauthURI } from '../totp/otpauth-parser'
import {
  upsertTOTP,
  getTOTP,
  deleteTOTP
} from '../../db/credential-totp-store'
import {
  generateStrong,
  generatePassphrase,
  generatePIN,
  type StrongPasswordOpts,
  type PassphraseOpts
} from '../password/generator'
import { scanAll, clearCache, evaluateStrength } from '../health/checker'
import { checkPasswordLeaked } from '../health/hibp'
import { fetchUrlMeta, type UrlMeta } from '../preview/url-meta-fetcher'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'

let registered = false

export function registerSprint11IPC(
  _mainWindow: BrowserWindow | null
): void {
  if (registered) {
    logger.warn('[IPC] Sprint11 registry already registered, skip')
    return
  }
  registered = true

  // ============== TOTP ==============
  ipcMain.handle(
    SPRINT11_CHANNELS.TOTP_UPSERT,
    wrapHandler(async (
      _ev,
      payload: TOTPUpsertInput
    ): Promise<ApiResponse<TOTPConfig>> => {
      try {
        if (!payload?.credentialId || !payload?.secret) {
          return { success: false, error: 'invalid payload' }
        }
        return { success: true, data: upsertTOTP(payload) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.TOTP_DELETE,
    wrapHandler(async (
      _ev,
      payload: { credentialId: string }
    ): Promise<ApiResponse<boolean>> => {
      try {
        return { success: true, data: deleteTOTP(payload?.credentialId ?? '') }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.TOTP_GET,
    wrapHandler(async (
      _ev,
      payload: { credentialId: string }
    ): Promise<ApiResponse<TOTPConfig | null>> => {
      try {
        return {
          success: true,
          data: getTOTP(payload?.credentialId ?? '')
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.TOTP_GENERATE,
    wrapHandler(async (
      _ev,
      payload: { credentialId?: string; config?: TOTPConfig }
    ): Promise<ApiResponse<TOTPCode>> => {
      try {
        if (payload?.config) {
          return { success: true, data: generateFromConfig(payload.config) }
        }
        if (payload?.credentialId) {
          const cfg = getTOTP(payload.credentialId)
          if (!cfg) return { success: false, error: 'totp not found' }
          return { success: true, data: generateFromConfig(cfg) }
        }
        return { success: false, error: 'invalid payload' }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.TOTP_PARSE_URI,
    wrapHandler(async (
      _ev,
      payload: { uri: string }
    ): Promise<ApiResponse<OtpauthParseResult>> => {
      try {
        return { success: true, data: parseOtpauthURI(payload?.uri ?? '') }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // ============== Password ==============
  ipcMain.handle(
    SPRINT11_CHANNELS.PASSWORD_GENERATE_STRONG,
    wrapHandler(async (_ev, opts: StrongPasswordOpts): Promise<ApiResponse<string>> => {
      try {
        return { success: true, data: generateStrong(opts) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.PASSWORD_GENERATE_PASSPHRASE,
    wrapHandler(async (_ev, opts: PassphraseOpts): Promise<ApiResponse<string>> => {
      try {
        return { success: true, data: generatePassphrase(opts) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.PASSWORD_GENERATE_PIN,
    wrapHandler(async (
      _ev,
      payload: { length: number }
    ): Promise<ApiResponse<string>> => {
      try {
        return { success: true, data: generatePIN(payload?.length ?? 6) }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.PASSWORD_EVALUATE_STRENGTH,
    wrapHandler(async (
      _ev,
      payload: { value: string }
    ): Promise<ApiResponse<{ score: number; feedback: string[] }>> => {
      try {
        return {
          success: true,
          data: evaluateStrength(payload?.value ?? '')
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // ============== Health ==============
  ipcMain.handle(
    SPRINT11_CHANNELS.HEALTH_REPORT,
    wrapHandler(async (
      _ev,
      payload?: { force?: boolean }
    ): Promise<ApiResponse<HealthReportStatus>> => {
      try {
        if (payload?.force) clearCache()
        const r = scanAll(!!payload?.force)
        if (r.code === 'ok') {
          return { success: true, data: { state: 'ready', report: r.report } }
        }
        if (r.code === 'session_required') {
          return { success: true, data: { state: 'session_required' } }
        }
        return {
          success: true,
          data: { state: 'error', error: r.error }
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    SPRINT11_CHANNELS.HEALTH_CHECK_HIBP,
    wrapHandler(async (
      _ev,
      payload: { password: string }
    ): Promise<ApiResponse<HIBPCheckResult>> => {
      try {
        const count = await checkPasswordLeaked(payload?.password ?? '')
        return {
          success: true,
          data: { pwned: count > 0, count, source: 'network' }
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  // ============== Preview ==============
  ipcMain.handle(
    SPRINT11_CHANNELS.PREVIEW_FETCH_URL_META,
    wrapHandler(async (
      _ev,
      payload: { url: string; timeoutMs?: number }
    ): Promise<ApiResponse<UrlMeta>> => {
      try {
        return {
          success: true,
          data: await fetchUrlMeta(
            payload?.url ?? '',
            payload?.timeoutMs ?? 3000
          )
        }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  logger.info(
    '[IPC] Sprint11 registry ready (totp + password + health + preview)'
  )
}

/** 测试/热重载用 */
export function _unregisterSprint11ForTests(): void {
  registered = false
  for (const ch of Object.values(SPRINT11_CHANNELS)) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      // ignore
    }
  }
}
