/**
 * 系统剪贴板监听器
 * KR 2.1: 系统剪贴板监听
 *
 * B-6：抽出 detectClipboardFormat / readClipboardByType 两个辅助函数，
 *       让 getCurrentHash / handleClipboardChange / readCurrent 共享一条读取逻辑
 */

import { clipboard, nativeImage } from 'electron'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'
import { detectKey } from '../../utils/key-detector'
import { logger } from '../utils/logger'
import { clipboardAutoClear } from './auto-clear'
import { ClipboardContentType } from '../../types'
import type { CreateClipboardItemInput } from '../../types'
import { detectCurrentClipboardFiles } from './file-clip-detector'
import { getForegroundAppName, isAppExcluded, refreshForegroundAppName } from './source-app'

/** 资源管理器复制文件时发出；个人版同时会走 change(type=file) 入库 */
export interface ClipboardFileListEvent {
  type: 'file-list'
  paths: string[]
}

export interface ClipboardChangeEvent {
  type: ClipboardContentType
  content?: string
  imageData?: string
  filePath?: string
  detectedKeyType?: string
  sourceApp?: string
}

/** 识别当前剪贴板格式；没有有效数据返回 null */
function detectClipboardFormat(): ClipboardContentType | null {
  const formats = clipboard.availableFormats()
  if (formats.includes('text/plain')) return ClipboardContentType.TEXT
  if (formats.some((f) => f.startsWith('image/'))) return ClipboardContentType.IMAGE
  if (formats.includes('text/html')) return ClipboardContentType.HTML
  return null
}

/** 按类型读取剪贴板，返回 `{content, imageData}` 的最小结构；空内容返回 null */
function readClipboardByType(
  type: ClipboardContentType
): { content?: string; imageData?: string } | null {
  if (type === ClipboardContentType.TEXT) {
    const text = clipboard.readText()
    if (!text || !text.trim()) return null
    return { content: text }
  }
  if (type === ClipboardContentType.IMAGE) {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    return { imageData: image.toDataURL() }
  }
  if (type === ClipboardContentType.HTML) {
    const html = clipboard.readHTML()
    if (!html || !html.trim()) return null
    return { content: clipboard.readText() || html }
  }
  return null
}

/** 剪贴板监听器 */
export class ClipboardMonitor extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null
  private lastHash: string = ''
  private pollInterval: number
  private isRunning: boolean = false
  private maxImageSize: number
  private enableSmartDetection: boolean
  private saveImages: boolean = true
  private excludedApps: string[] = []
  private minClipboardLength: number = 0
  private lastSourceApp: string = ''
  /** 内容 hash + 来源，避免「排除应用跳过」后同内容从其它应用无法再记 */
  private lastFingerprint: string = ''
  private lastWasExcluded = false
  private lastExcludeRecheckAt = 0
  /** 每次系统剪贴板内容变化 +1；截图异步落盘后用它判断是否还能写回 */
  private generation = 0
  private checking = false
  private pendingKeyChange: ClipboardChangeEvent | null = null

  constructor(options?: {
    pollInterval?: number
    maxImageSize?: number
    enableSmartDetection?: boolean
    saveImages?: boolean
    excludedApps?: string[]
    minClipboardLength?: number
  }) {
    super()
    this.pollInterval = options?.pollInterval ?? 500
    this.maxImageSize = options?.maxImageSize ?? 5120 // 5MB in KB
    this.enableSmartDetection = options?.enableSmartDetection ?? true
    this.saveImages = options?.saveImages ?? true
    this.excludedApps = options?.excludedApps ?? []
    this.minClipboardLength = options?.minClipboardLength ?? 0
  }

  /** 启动监听 */
  start(): void {
    if (this.isRunning) {
      return
    }

    this.isRunning = true

    this.lastHash = this.getCurrentHash()
    this.lastFingerprint = `${this.lastHash}\0`
    this.lastWasExcluded = false

    this.intervalId = setInterval(() => {
      void this.checkClipboard()
    }, this.pollInterval)

    logger.info(`[ClipboardMonitor] Started with ${this.pollInterval}ms interval`)
    this.emit('started')
  }

  /** 停止监听 */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    this.isRunning = false
    logger.info('[ClipboardMonitor] Stopped')
    this.emit('stopped')
  }

  /** 获取运行状态 */
  getStatus(): { isRunning: boolean; interval: number } {
    return {
      isRunning: this.isRunning,
      interval: this.pollInterval
    }
  }

  /** 剪贴板内容世代：截图入库期间若已变化，调用方应跳过写回 */
  getGeneration(): number {
    return this.generation
  }

  /** 密钥拦截结束后再写入历史 */
  flushPendingKeyChange(): void {
    const ev = this.pendingKeyChange
    this.pendingKeyChange = null
    if (ev) this.emit('change', ev)
  }

  /** 更新设置 */
  updateSettings(options: {
    pollInterval?: number
    maxImageSize?: number
    enableSmartDetection?: boolean
    saveImages?: boolean
    excludedApps?: string[]
    minClipboardLength?: number
  }): void {
    if (options.pollInterval !== undefined) {
      this.pollInterval = options.pollInterval
    }
    if (options.maxImageSize !== undefined) {
      this.maxImageSize = options.maxImageSize
    }
    if (options.enableSmartDetection !== undefined) {
      this.enableSmartDetection = options.enableSmartDetection
    }
    if (options.saveImages !== undefined) {
      this.saveImages = options.saveImages
    }
    if (options.excludedApps !== undefined) {
      this.excludedApps = options.excludedApps
    }
    if (options.minClipboardLength !== undefined) {
      this.minClipboardLength = options.minClipboardLength
    }

    // 如果正在运行，重启以应用新的轮询间隔
    if (this.isRunning && options.pollInterval !== undefined) {
      this.stop()
      this.start()
    }
  }

  /** 检查剪贴板变化（排除判定完成前不提交 lastHash） */
  private async checkClipboard(): Promise<void> {
    if (this.checking) return
    this.checking = true
    try {
      const contentHash = this.getCurrentHash()
      const sameContent = contentHash === this.lastHash

      if (sameContent && !this.lastWasExcluded) return

      if (sameContent && this.lastWasExcluded) {
        const now = Date.now()
        if (now - this.lastExcludeRecheckAt < 1500) return
        this.lastExcludeRecheckAt = now
      }

      const sourceApp = await this.resolveSourceApp(!sameContent)
      const fingerprint = `${contentHash}\0${sourceApp}`
      if (fingerprint === this.lastFingerprint) return

      if (!sameContent) {
        this.generation += 1
        clipboardAutoClear.cancel()
      }

      if (isAppExcluded(sourceApp, this.excludedApps)) {
        this.lastHash = contentHash
        this.lastFingerprint = fingerprint
        this.lastWasExcluded = true
        logger.info(`[ClipboardMonitor] skipped excluded app: ${sourceApp}`)
        return
      }

      this.lastHash = contentHash
      this.lastFingerprint = fingerprint
      this.lastWasExcluded = false
      this.emitClipboardChange(sourceApp)
    } catch (error) {
      logger.error('[ClipboardMonitor] Error checking clipboard:', error)
      this.emit('error', error)
    } finally {
      this.checking = false
    }
  }

  /** 有排除列表时必须 await 前台应用，避免用过期缓存误伤 */
  private async resolveSourceApp(contentChanged: boolean): Promise<string> {
    let sourceApp = getForegroundAppName() || this.lastSourceApp
    if (this.excludedApps.length > 0 || this.lastWasExcluded) {
      sourceApp = (await refreshForegroundAppName()) || sourceApp
    } else if (contentChanged) {
      void refreshForegroundAppName().then((n) => {
        if (n) this.lastSourceApp = n
      })
    }
    if (sourceApp) this.lastSourceApp = sourceApp
    return sourceApp
  }

  /** 获取当前剪贴板内容的哈希值（文件列表优先，避免无 text/plain 时漏检） */
  private getCurrentHash(): string {
    const files = detectCurrentClipboardFiles()
    if (files.isFileList && files.paths.length > 0) {
      return crypto.createHash('md5').update(`file:${files.paths.join('\n')}`).digest('hex')
    }
    const type = detectClipboardFormat()
    let raw = ''
    if (type === ClipboardContentType.IMAGE) {
      const image = clipboard.readImage()
      if (!image.isEmpty()) {
        const size = image.getSize()
        const bmp = image.toBitmap()
        const head = bmp.subarray(0, Math.min(512, bmp.length))
        const tail = bmp.subarray(Math.max(0, bmp.length - 512))
        raw = `img:${size.width}x${size.height}:${bmp.length}:${head.toString('hex')}:${tail.toString('hex')}`
      }
    } else if (type) {
      const read = readClipboardByType(type)
      if (read) raw = read.content ?? ''
    }
    return crypto.createHash('md5').update(raw).digest('hex')
  }

  /** 处理已通过排除判定的剪贴板变化 */
  private emitClipboardChange(sourceApp: string): void {
    const fileDetect = detectCurrentClipboardFiles()
    if (fileDetect.isFileList && fileDetect.paths.length > 0) {
      const joined = fileDetect.paths.join('\n')
      logger.info(
        `[ClipboardMonitor] file-list detected: ${fileDetect.paths.length} file(s)`
      )
      this.emit('file-list', {
        type: 'file-list',
        paths: fileDetect.paths
      } as ClipboardFileListEvent)
      this.emit('change', {
        type: ClipboardContentType.FILE,
        filePath: joined,
        content: joined,
        sourceApp: sourceApp || undefined
      })
      return
    }

    const type = detectClipboardFormat()
    if (!type) return

    let event: ClipboardChangeEvent | null = null

    if (type === ClipboardContentType.TEXT) {
      const read = readClipboardByType(ClipboardContentType.TEXT)
      if (read?.content) {
        if (
          this.minClipboardLength > 0 &&
          read.content.trim().length < this.minClipboardLength
        ) {
          return
        }
        event = {
          type: ClipboardContentType.TEXT,
          content: read.content,
          sourceApp: sourceApp || undefined
        }
        if (this.enableSmartDetection) {
          const detection = detectKey(read.content)
          if (detection.detected && detection.pattern) {
            event.detectedKeyType = detection.pattern.name
          }
        }
      }
    } else if (type === ClipboardContentType.IMAGE) {
      if (!this.saveImages) {
        logger.info('[ClipboardMonitor] image skipped (saveImages=false)')
        return
      }
      const image = clipboard.readImage()
      if (!image.isEmpty()) {
        const size = image.toJPEG(80).length / 1024
        if (size <= this.maxImageSize) {
          event = {
            type: ClipboardContentType.IMAGE,
            imageData: image.toDataURL(),
            sourceApp: sourceApp || undefined
          }
        } else {
          logger.info(
            `[ClipboardMonitor] Image too large: ${size}KB > ${this.maxImageSize}KB`
          )
        }
      }
    } else if (type === ClipboardContentType.HTML) {
      const read = readClipboardByType(ClipboardContentType.HTML)
      if (read?.content) {
        if (
          this.minClipboardLength > 0 &&
          read.content.trim().length < this.minClipboardLength
        ) {
          return
        }
        event = {
          type: ClipboardContentType.HTML,
          content: read.content,
          sourceApp: sourceApp || undefined
        }
        if (this.enableSmartDetection) {
          const detection = detectKey(read.content)
          if (detection.detected && detection.pattern) {
            event.detectedKeyType = detection.pattern.name
          }
        }
      }
    }

    if (event) {
      logger.info(`[ClipboardMonitor] New ${event.type} content detected`)
      if (event.detectedKeyType && event.content) {
        if (this.pendingKeyChange) {
          this.emit('change', this.pendingKeyChange)
          this.pendingKeyChange = null
        }
        this.emit('key-detected', {
          content: event.content,
          detectedKeyType: event.detectedKeyType,
          type: event.type
        })
        this.pendingKeyChange = event
        return
      }
      if (this.pendingKeyChange) {
        this.emit('change', this.pendingKeyChange)
        this.pendingKeyChange = null
      }
      this.emit('change', event)
    }
  }

  /** 本进程写入后同步指纹，避免轮询把自写内容再入库 */
  private rememberSelfWrite(): void {
    this.lastHash = this.getCurrentHash()
    this.lastFingerprint = `${this.lastHash}\0${this.lastSourceApp}`
    this.lastWasExcluded = false
    this.generation += 1
  }

  /** 手动写入剪贴板（凭证/片段复制应走这里，而不是 clipboard.writeText） */
  writeText(text: string): void {
    clipboard.writeText(text)
    this.rememberSelfWrite()
  }

  /** 手动写入图片到剪贴板 */
  writeImage(dataUrl: string): void {
    const image = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(image)
    this.rememberSelfWrite()
  }

  /** 路径含空格/特殊字符时加双引号，便于终端粘贴 */
  formatPathText(absolutePath: string): string {
    return /[\s&()^]/.test(absolutePath) ? `"${absolutePath}"` : absolutePath
  }

  /**
   * 截图落盘后按模式写回系统剪贴板：
   * - both：图片 + 路径文本（默认，终端得路径、画图贴图）
   * - path：仅路径文本（CLI 友好）
   * - image：仅图片（PPT / 文档友好）
   * 写完后刷新 lastHash，避免把写回内容再记成新历史。
   */
  writeImagePaste(
    dataUrl: string,
    absolutePath: string,
    mode: 'both' | 'path' | 'image' = 'both'
  ): void {
    const pathText = this.formatPathText(absolutePath)
    try {
      if (mode === 'path') {
        clipboard.writeText(pathText)
        this.rememberSelfWrite()
        logger.info(`[ClipboardMonitor] path-only on clipboard: ${pathText}`)
        return
      }

      const image = nativeImage.createFromDataURL(dataUrl)
      if (image.isEmpty()) {
        if (mode !== 'image') clipboard.writeText(pathText)
        this.rememberSelfWrite()
        return
      }

      if (mode === 'image') {
        clipboard.writeImage(image)
        this.rememberSelfWrite()
        logger.info('[ClipboardMonitor] image-only on clipboard')
        return
      }

      // both
      clipboard.write({ text: pathText, image })
      this.rememberSelfWrite()
      logger.info(`[ClipboardMonitor] image+path on clipboard: ${pathText}`)
    } catch (err) {
      logger.warn('[ClipboardMonitor] writeImagePaste failed, fallback text:', err)
      try {
        if (mode !== 'image') {
          clipboard.writeText(pathText)
          this.rememberSelfWrite()
        }
      } catch {
        /* ignore */
      }
    }
  }

  /** @deprecated 使用 writeImagePaste(..., 'both') */
  writeImageWithPathText(dataUrl: string, absolutePath: string): void {
    this.writeImagePaste(dataUrl, absolutePath, 'both')
  }

  /** 读取当前剪贴板内容（B-6：复用 readClipboardByType） */
  readCurrent(): CreateClipboardItemInput | null {
    const type = detectClipboardFormat()
    if (!type) return null
    const read = readClipboardByType(type)
    if (!read) return null
    return { type, ...read }
  }
}

// 单例实例
let monitorInstance: ClipboardMonitor | null = null

/** 获取剪贴板监听器单例 */
export function getClipboardMonitor(): ClipboardMonitor {
  if (!monitorInstance) {
    monitorInstance = new ClipboardMonitor()
  }
  return monitorInstance
}

/** 销毁剪贴板监听器 */
export function destroyClipboardMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop()
    monitorInstance.removeAllListeners()
    monitorInstance = null
  }
}
