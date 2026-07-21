/**
 * Sprint 14 · TASK-072 AutoUpdater 封装
 *
 * 职责：
 *   - 统一包装 electron-updater.autoUpdater
 *   - 启动 30s 后首次检查，之后每 4h 一次
 *   - 通过 IPC 事件广播 status / progress 给渲染进程
 *   - 支持 stable / beta 通道切换
 *
 * 整合提示：
 *   - 真实发布 provider (GitHub / generic) 留给整合 agent 在 electron-builder.yml
 *     中补 `publish:` 字段。本模块仅负责运行时行为。
 */

import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import type { BrowserWindow } from 'electron'
import { logger } from '../utils/logger'
import {
  UPDATER_CHANNELS,
  type UpdateChannel,
  type UpdaterEvent,
  type UpdaterStatus,
  type UpdateInfoPayload,
  type UpdateProgressPayload
} from '../../types/updater'
import { resolveChannel } from './channel'

const FIRST_CHECK_DELAY_MS = 30_000
const INTERVAL_MS = 4 * 60 * 60 * 1000 // 4h

export class UpdaterService {
  private mainWindow: BrowserWindow | null = null
  private statusCbs: Array<(e: UpdaterEvent) => void> = []
  private currentStatus: UpdaterStatus = 'idle'
  private lastInfo?: UpdateInfoPayload
  private lastProgress?: UpdateProgressPayload
  private lastError?: string
  private firstCheckTimer: NodeJS.Timeout | null = null
  private intervalTimer: NodeJS.Timeout | null = null
  private bound = false
  private currentChannel: UpdateChannel = 'stable'
  /**
   * ρ5 · 发布源不可达时禁用周期性检查，避免每 4h 刷 404 污染日志。
   * 手动 `checkForUpdates()` 仍可尝试（允许主人配好 publish 后立即生效）。
   */
  private sourceDisabled = false

  start(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    this.bindListeners()

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (m: unknown) => logger.info(`[updater] ${String(m)}`),
      warn: (m: unknown) => logger.warn(`[updater] ${String(m)}`),
      error: (m: unknown) => logger.error(`[updater] ${String(m)}`),
      debug: () => {}
    } as never

    this.scheduleChecks()
  }

  stop(): void {
    if (this.firstCheckTimer) {
      clearTimeout(this.firstCheckTimer)
      this.firstCheckTimer = null
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer)
      this.intervalTimer = null
    }
  }

  private scheduleChecks(): void {
    this.firstCheckTimer = setTimeout(() => {
      void this.checkForUpdates().catch((e) =>
        logger.warn(`[updater] first check failed: ${(e as Error).message}`)
      )
    }, FIRST_CHECK_DELAY_MS)

    this.intervalTimer = setInterval(() => {
      if (this.sourceDisabled) return // ρ5 · 发布源 404 后跳过，避免日志刷屏
      void this.checkForUpdates().catch((e) =>
        logger.warn(`[updater] periodic check failed: ${(e as Error).message}`)
      )
    }, INTERVAL_MS)
  }

  async checkForUpdates(): Promise<UpdateInfoPayload | null> {
    try {
      this.setStatus('checking')
      const res = await autoUpdater.checkForUpdates()
      const info = res?.updateInfo ? this.toInfoPayload(res.updateInfo) : null
      return info
    } catch (err) {
      const msg = (err as Error).message ?? ''
      // ρ5 · 发布源 404 / ENOTFOUND 视为"未配置 publish 源"，禁用后续周期检查
      if (
        /404/.test(msg) ||
        /ENOTFOUND/.test(msg) ||
        /releases\.atom/.test(msg)
      ) {
        if (!this.sourceDisabled) {
          this.sourceDisabled = true
          logger.warn(
            '[updater] update source unreachable (404/ENOTFOUND), periodic checks disabled'
          )
        }
      }
      this.lastError = msg
      this.setStatus('error')
      return null
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      this.setStatus('downloading')
      await autoUpdater.downloadUpdate()
    } catch (err) {
      this.lastError = (err as Error).message
      this.setStatus('error')
      throw err
    }
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall(false, true)
  }

  setChannel(channel: UpdateChannel): void {
    this.currentChannel = channel
    const cfg = resolveChannel(channel)
    autoUpdater.allowPrerelease = cfg.allowPrerelease
    autoUpdater.channel = cfg.channel
    logger.info(
      `[updater] channel switched to ${channel} (allowPrerelease=${cfg.allowPrerelease})`
    )
  }

  onStatus(cb: (e: UpdaterEvent) => void): () => void {
    this.statusCbs.push(cb)
    return () => {
      this.statusCbs = this.statusCbs.filter((x) => x !== cb)
    }
  }

  getState(): UpdaterEvent & { channel: UpdateChannel } {
    return {
      status: this.currentStatus,
      info: this.lastInfo,
      progress: this.lastProgress,
      error: this.lastError,
      channel: this.currentChannel
    }
  }

  private bindListeners(): void {
    if (this.bound) return
    this.bound = true

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.lastInfo = this.toInfoPayload(info)
      this.setStatus('available')
    })
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.lastInfo = info ? this.toInfoPayload(info) : undefined
      this.setStatus('not-available')
    })
    autoUpdater.on('download-progress', (p: ProgressInfo) => {
      this.lastProgress = {
        bytesPerSecond: p.bytesPerSecond,
        percent: p.percent,
        transferred: p.transferred,
        total: p.total
      }
      this.setStatus('downloading')
    })
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.lastInfo = this.toInfoPayload(info)
      this.setStatus('downloaded')
    })
    autoUpdater.on('error', (err: Error) => {
      this.lastError = err.message
      this.setStatus('error')
    })
  }

  private toInfoPayload(info: UpdateInfo): UpdateInfoPayload {
    const notes = info.releaseNotes
    return {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes:
        typeof notes === 'string'
          ? notes
          : Array.isArray(notes)
            ? notes.map((n) => n.note ?? '').join('\n')
            : undefined,
      files: info.files?.map((f) => ({ url: f.url, size: f.size }))
    }
  }

  private setStatus(status: UpdaterStatus): void {
    this.currentStatus = status
    const ev: UpdaterEvent = {
      status,
      info: this.lastInfo,
      progress: this.lastProgress,
      error: status === 'error' ? this.lastError : undefined
    }
    for (const cb of this.statusCbs) {
      try {
        cb(ev)
      } catch (e) {
        logger.warn(`[updater] status callback error: ${(e as Error).message}`)
      }
    }
    this.broadcast(ev)
  }

  private broadcast(ev: UpdaterEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return
    try {
      this.mainWindow.webContents.send(UPDATER_CHANNELS.EVENT, ev)
    } catch (e) {
      logger.warn(`[updater] broadcast failed: ${(e as Error).message}`)
    }
  }
}

/** 单例 */
export const updaterService = new UpdaterService()
