/**
 * Sprint 11 渲染进程 API（独立片段）
 *
 * 整合方式：
 *   在 src/preload/index.ts 中：
 *     import { sprint11API } from './sprint11-api'
 *     const api = { ..., sprint11: sprint11API }
 */

import { ipcRenderer } from 'electron'
import type { ApiResponse } from '../types'
import {
  SPRINT11_CHANNELS,
  type OtpauthParseResult,
  type TOTPCode,
  type TOTPConfig,
  type TOTPUpsertInput
} from '../types/totp'
import type { HealthReportStatus, HIBPCheckResult } from '../types/health'

export interface StrongPasswordOptsWire {
  length: number
  includeLower?: boolean
  includeUpper?: boolean
  includeDigits?: boolean
  includeSymbols?: boolean
  excludeAmbiguous?: boolean
}
export interface PassphraseOptsWire {
  wordCount: number
  separator?: string
  capitalize?: boolean
  includeNumber?: boolean
  language?: 'en' | 'zh'
}

export interface UrlMetaWire {
  title?: string
  description?: string
  image?: string
  favicon?: string
  url: string
  error?: string
}

export const sprint11API = {
  totp: {
    upsert: (input: TOTPUpsertInput): Promise<ApiResponse<TOTPConfig>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.TOTP_UPSERT, input),
    remove: (credentialId: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.TOTP_DELETE, { credentialId }),
    get: (credentialId: string): Promise<ApiResponse<TOTPConfig | null>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.TOTP_GET, { credentialId }),
    list: (): Promise<
      ApiResponse<Array<TOTPConfig & { credentialName: string }>>
    > => ipcRenderer.invoke(SPRINT11_CHANNELS.TOTP_LIST),
    generate: (
      payload: { credentialId?: string; config?: TOTPConfig }
    ): Promise<ApiResponse<TOTPCode>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.TOTP_GENERATE, payload),
    parseUri: (uri: string): Promise<ApiResponse<OtpauthParseResult>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.TOTP_PARSE_URI, { uri })
  },

  password: {
    generateStrong: (
      opts: StrongPasswordOptsWire
    ): Promise<ApiResponse<string>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.PASSWORD_GENERATE_STRONG, opts),
    generatePassphrase: (
      opts: PassphraseOptsWire
    ): Promise<ApiResponse<string>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.PASSWORD_GENERATE_PASSPHRASE, opts),
    generatePIN: (length: number): Promise<ApiResponse<string>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.PASSWORD_GENERATE_PIN, { length }),
    evaluateStrength: (
      value: string
    ): Promise<ApiResponse<{ score: number; feedback: string[] }>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.PASSWORD_EVALUATE_STRENGTH, {
        value
      })
  },

  health: {
    report: (force?: boolean): Promise<ApiResponse<HealthReportStatus>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.HEALTH_REPORT, { force: !!force }),
    checkHibp: (password: string): Promise<ApiResponse<HIBPCheckResult>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.HEALTH_CHECK_HIBP, { password })
  },

  preview: {
    fetchUrlMeta: (
      url: string,
      timeoutMs?: number
    ): Promise<ApiResponse<UrlMetaWire>> =>
      ipcRenderer.invoke(SPRINT11_CHANNELS.PREVIEW_FETCH_URL_META, {
        url,
        timeoutMs
      })
  }
}

export type Sprint11API = typeof sprint11API
