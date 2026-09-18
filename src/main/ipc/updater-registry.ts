/**
 * Sprint 14 IPC · v3.0 个人本地版
 * 仅：自动更新 + 凭证导入
 */

import { ipcMain, type BrowserWindow } from 'electron'
import type { ApiResponse } from '../../types'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'

import {
  UPDATER_CHANNELS,
  type UpdateChannel,
  type UpdateInfoPayload,
  type UpdaterDiagnostics,
  type UpdaterStatePayload
} from '../../types/updater'
import { updaterService } from '../updater'
import { isValidChannel } from '../updater/channel'

import {
  IMPORT_CHANNELS,
  type ImportParseResult,
  type ImportRequest
} from '../../types/import'
import { parseOnepassword } from '../import/onepassword'
import { parseBitwardenJson } from '../import/bitwarden'
import { parseChromeCsv } from '../import/chrome'
import { parseLastpassCsv } from '../import/lastpass'
import { parseKeepassKdbx } from '../import/keepass'
import { parseGenericCsv, guessMapping } from '../import/generic-csv'
import { createCredential } from '../../db/credential-store'
import type { CredentialType } from '../../types'

let registered = false

export function registerUpdaterIPC(mainWindow: BrowserWindow | null): void {
  if (registered) {
    logger.warn('[IPC] Updater registry already registered, skip')
    return
  }
  registered = true

  if (mainWindow) {
    try {
      updaterService.start(mainWindow)
    } catch (err) {
      logger.warn(`[Updater] updater start failed: ${(err as Error).message}`)
    }
  }

  ipcMain.handle(
    UPDATER_CHANNELS.CHECK,
    wrapHandler(async (): Promise<ApiResponse<UpdateInfoPayload | null>> => {
      try {
        const info = await updaterService.checkForUpdates()
        return { success: true, data: info }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    UPDATER_CHANNELS.DOWNLOAD,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        await updaterService.downloadUpdate()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    UPDATER_CHANNELS.QUIT_AND_INSTALL,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        updaterService.quitAndInstall()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    UPDATER_CHANNELS.SET_CHANNEL,
    wrapHandler(async (_ev, payload: { channel: UpdateChannel }): Promise<ApiResponse<boolean>> => {
      try {
        if (!isValidChannel(payload?.channel)) {
          return { success: false, error: 'invalid channel' }
        }
        updaterService.setChannel(payload.channel)
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    UPDATER_CHANNELS.GET_DIAGNOSTICS,
    wrapHandler(async (): Promise<ApiResponse<UpdaterDiagnostics>> => {
      try {
        return { success: true, data: updaterService.getDiagnostics() }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    UPDATER_CHANNELS.OPEN_RELEASE,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      try {
        await updaterService.openReleasePage()
        return { success: true, data: true }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    UPDATER_CHANNELS.GET_STATE,
    wrapHandler(async (): Promise<ApiResponse<UpdaterStatePayload>> => {
      try {
        return { success: true, data: updaterService.getState() }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IMPORT_CHANNELS.PARSE,
    wrapHandler(async (
      _ev,
      req: ImportRequest
    ): Promise<ApiResponse<ImportParseResult>> => {
      try {
        if (!req || !req.source || typeof req.content !== 'string') {
          return { success: false, error: 'invalid payload' }
        }
        let result: ImportParseResult
        switch (req.source) {
          case 'onepassword':
            result = parseOnepassword(req.content, !!req.base64)
            break
          case 'bitwarden':
            result = parseBitwardenJson(req.content, req.password)
            break
          case 'chrome':
            result = parseChromeCsv(req.content)
            break
          case 'lastpass':
            result = parseLastpassCsv(req.content)
            break
          case 'keepass':
            result = await parseKeepassKdbx(req.content, req.password, req.keyFile)
            break
          case 'generic-csv': {
            const firstLine = req.content.split(/\r?\n/)[0] ?? ''
            const headers = firstLine
              .split(',')
              .map((h) => h.replace(/^"|"$/g, '').trim())
              .filter(Boolean)
            const mapping = req.mapping ?? guessMapping(headers)
            const auto = parseGenericCsv(req.content, mapping)
            result = {
              source: 'generic-csv',
              items: auto.items,
              skipped: auto.skipped,
              warnings: auto.headers.length ? [`列: ${auto.headers.join(', ')}`] : []
            }
            break
          }
          default:
            return { success: false, error: `unknown source: ${String(req.source)}` }
        }
        return { success: true, data: result }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IMPORT_CHANNELS.COMMIT,
    wrapHandler(async (
      _ev,
      req: { items: ImportParseResult['items'] }
    ): Promise<ApiResponse<{ count: number; skipped: number }>> => {
      try {
        const items = Array.isArray(req?.items) ? req.items : []
        let count = 0
        let skipped = 0
        for (const it of items) {
          try {
            if (!it || !it.name || !it.value || !it.type) {
              skipped++
              continue
            }
            createCredential({
              name: it.name,
              type: it.type as CredentialType,
              value: it.value,
              description: it.description,
              metadata: it.metadata,
              tags: it.tags
            })
            count++
          } catch (err) {
            logger.error('[import.commit] skip item:', err)
            skipped++
          }
        }
        return { success: true, data: { count, skipped } }
      } catch (err) {
        return { success: false, error: (err as Error).message }
      }
    })
  )

  logger.info('[IPC] Updater registry ready (updater + import)')
}

export function _unregisterUpdaterForTests(): void {
  registered = false
  for (const ch of [
    UPDATER_CHANNELS.CHECK,
    UPDATER_CHANNELS.DOWNLOAD,
    UPDATER_CHANNELS.QUIT_AND_INSTALL,
    UPDATER_CHANNELS.SET_CHANNEL,
    UPDATER_CHANNELS.GET_STATE,
    IMPORT_CHANNELS.PARSE,
    IMPORT_CHANNELS.COMMIT
  ]) {
    try {
      ipcMain.removeHandler(ch)
    } catch {
      // ignore
    }
  }
}
