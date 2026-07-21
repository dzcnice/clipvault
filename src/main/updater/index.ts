/**
 * AutoUpdater 封装 · v3.1
 *
 * - 启动 30s 后首次检查，之后每 4h
 * - 检查自动 / 下载需用户确认（autoDownload=false）
 * - 下载完成后可「立即重启安装」或退出时安装
 * - 发布源 404/DNS 失败时暂停周期检查；手动检查会重新尝试
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

function humanizeUpdaterError(msg: string): string {
  const m = msg || '未知错误'
  if (/404|ENOTFOUND|getaddrinfo|ECONNREFUSED|net::/i.test(m)) {
    return '无法连接更新服务器，请检查网络或稍后在设置中重试'
  }
  if (/sha512|checksum|blockmap|ERR_UPDATER/i.test(m)) {
    return '更新包校验失败，请稍后重试或从官网重新下载安装包'
  }
  if (/EPERM|EBUSY|locked|access/i.test(m)) {
    return '文件被占用，请关闭其它 ClipVault 窗口后重试'
  }
  if (m.length > 160) return `${m.slice(0, 160)}…`
  return m
}

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
   * 发布源不可达时禁用周期性检查，避免刷屏。
   * 手动 checkForUpdates() 会清零并重试。
   */
  private sourceDisabled = false

  start(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow
    this.bindListeners()

    // 大厂常见：自动检查，下载需确认
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    // 允许降级检测关闭；仅更高版本提示
    autoUpdater.allowDowngrade = false
    autoUpdater.logger = {
      info: (m: unknown) => logger.info(`[updater] ${String(m)}`),
      warn: (m: unknown) => logger.warn(`[updater] ${String(m)}`),
      error: (m: unknown) => logger.error(`[updater] ${String(m)}`),
      debug: () => {}
    } as never

    // 应用当前通道
    this.applyChannelConfig(this.currentChannel)
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
      if (this.sourceDisabled) return
      void this.checkForUpdates().catch((e) =>
        logger.warn(`[updater] periodic check failed: ${(e as Error).message}`)
      )
    }, INTERVAL_MS)
  }

  /** 手动检查时重新启用周期源 */
  reenableSource(): void {
    if (this.sourceDisabled) {
      this.sourceDisabled = false
      logger.info('[updater] update source re-enabled (manual check)')
    }
  }

  async checkForUpdates(): Promise<UpdateInfoPayload | null> {
    // 用户/设置触发的检查：允许恢复源
    this.reenableSource()
    try {
      this.setStatus('checking')
      const res = await autoUpdater.checkForUpdates()
      // 能连上源即恢复周期检查
      this.sourceDisabled = false
      const info = res?.updateInfo ? this.toInfoPayload(res.updateInfo) : null
      return info
    } catch (err) {
      const raw = (err as Error).message ?? ''
      if (
        /404/.test(raw) ||
        /ENOTFOUND/.test(raw) ||
        /releases\.atom/.test(raw) ||
        /ECONNREFUSED/.test(raw)
      ) {
        if (!this.sourceDisabled) {
          this.sourceDisabled = true
          logger.warn(
            '[updater] update source unreachable; periodic checks paused until manual retry'
          )
        }
      }
      this.lastError = humanizeUpdaterError(raw)
      this.setStatus('error')
      return null
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      this.setStatus('downloading')
      await autoUpdater.downloadUpdate()
    } catch (err) {
      const raw = (err as Error).message ?? ''
      this.lastError = humanizeUpdaterError(raw)
      this.setStatus('error')
      throw err
    }
  }

  quitAndInstall(): void {
    // isSilent=false, isForceRunAfter=true
    autoUpdater.quitAndInstall(false, true)
  }

  setChannel(channel: UpdateChannel): void {
    this.currentChannel = channel
    this.applyChannelConfig(channel)
    this.reenableSource()
    logger.info(`[updater] channel switched to ${channel}`)
  }

  private applyChannelConfig(channel: UpdateChannel): void {
    const cfg = resolveChannel(channel)
    autoUpdater.allowPrerelease = cfg.allowPrerelease
    autoUpdater.channel = cfg.channel
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
      this.sourceDisabled = false
      this.lastInfo = this.toInfoPayload(info)
      this.setStatus('available')
    })
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.sourceDisabled = false
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
      this.lastError = humanizeUpdaterError(err.message)
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
