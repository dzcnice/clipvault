/**
 * Sprint 14 · TASK-072 AutoUpdater 类型
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

export const UPDATER_CHANNELS = {
  CHECK: 'updater:check',
  DOWNLOAD: 'updater:download',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
  SET_CHANNEL: 'updater:set-channel',
  GET_STATE: 'updater:get-state',
  EVENT: 'updater:event'
} as const
