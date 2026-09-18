/**
 * 自动更新类型
 */

export type UpdateChannel = 'stable' | 'beta'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateInfoPayload {
  version: string
  releaseDate?: string
  releaseNotes?: string
  files?: Array<{ url: string; size?: number }>
}

export interface UpdateProgressPayload {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export interface UpdaterEvent {
  status: UpdaterStatus
  info?: UpdateInfoPayload
  progress?: UpdateProgressPayload
  error?: string
}

/** getState 载荷：状态 + 通道 + 是否已打包 */
export type UpdaterStatePayload = UpdaterEvent & {
  channel: UpdateChannel
  packaged: boolean
}

/** 更新诊断（C2） */
export interface UpdaterDiagnostics {
  appVersion: string
  channel: UpdateChannel
  status: UpdaterStatus
  lastError?: string
  lastInfoVersion?: string
  sourceDisabled: boolean
  autoCheckEnabled: boolean
  intervalHours: number
  platform: string
  feedUrlHint: string
  /** false = npm run dev / unpackaged，electron-updater 不会真正检查 */
  packaged: boolean
}

export const UPDATER_CHANNELS = {
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
  SET_CHANNEL: 'updater:set-channel',
  GET_STATE: 'updater:get-state',
  GET_DIAGNOSTICS: 'updater:get-diagnostics',
  OPEN_RELEASE: 'updater:open-release',
  EVENT: 'updater:event'
} as const
