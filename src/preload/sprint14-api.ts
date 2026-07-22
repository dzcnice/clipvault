/**
 * Sprint 14 API · 更新 + 导入（无 webhook）
 */

import { ipcRenderer } from 'electron'
import type { ApiResponse } from '../types'
import {
  UPDATER_CHANNELS,
  type UpdateChannel,
  type UpdateInfoPayload,
  type UpdaterEvent,
  type UpdaterDiagnostics
} from '../types/updater'
import {
  IMPORT_CHANNELS,
  type ImportParseResult,
  type ImportRequest
} from '../types/import'

export const sprint14API = {
  updater: {
    check: (): Promise<ApiResponse<UpdateInfoPayload | null>> =>
      ipcRenderer.invoke(UPDATER_CHANNELS.CHECK),
    download: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(UPDATER_CHANNELS.DOWNLOAD),
    quitAndInstall: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(UPDATER_CHANNELS.QUIT_AND_INSTALL),
    setChannel: (channel: UpdateChannel): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(UPDATER_CHANNELS.SET_CHANNEL, { channel }),
    getState: (): Promise<
      ApiResponse<UpdaterEvent & { channel: UpdateChannel }>
    > => ipcRenderer.invoke(UPDATER_CHANNELS.GET_STATE),
    getDiagnostics: (): Promise<ApiResponse<UpdaterDiagnostics>> =>
      ipcRenderer.invoke(UPDATER_CHANNELS.GET_DIAGNOSTICS),
    openReleasePage: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(UPDATER_CHANNELS.OPEN_RELEASE),
    onEvent: (cb: (ev: UpdaterEvent) => void): (() => void) => {
      const handler = (_ev: Electron.IpcRendererEvent, payload: UpdaterEvent): void =>
        cb(payload)
      ipcRenderer.on(UPDATER_CHANNELS.EVENT, handler)
      return () => ipcRenderer.removeListener(UPDATER_CHANNELS.EVENT, handler)
    }
  },

  import: {
    parse: (req: ImportRequest): Promise<ApiResponse<ImportParseResult>> =>
      ipcRenderer.invoke(IMPORT_CHANNELS.PARSE, req),
    commit: (
      items: ImportParseResult['items']
    ): Promise<ApiResponse<{ count: number; skipped: number }>> =>
      ipcRenderer.invoke(IMPORT_CHANNELS.COMMIT, { items })
  }
}

export type Sprint14API = typeof sprint14API
