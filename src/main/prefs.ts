/**
 * 个人版本地偏好（userData/clipvault-prefs.json）
 * 不进数据库，避免迁移噪音；失败时用安全默认值。
 */

import { app } from 'electron'
import { join, isAbsolute, normalize } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { logger } from './utils/logger'

/** 截图入库后如何写回系统剪贴板 */
export type ImagePasteMode = 'both' | 'path' | 'image'

export interface ClipVaultPrefs {
  /** both=图+路径 | path=仅路径文本 | image=仅图片 */
  imagePasteMode: ImagePasteMode
  /**
   * 截图/图片落盘目录。
   * - null / 空：默认 `%userData%/images`
   * - 绝对路径：自定义目录（须可写）
   */
  imagesDir: string | null
  /** 复制敏感内容后自动清空剪贴板（毫秒）；0=关闭 */
  autoClearTtlMs: number
  /** 从主窗口复制后隐藏到托盘（贴完即走） */
  hideAfterCopy: boolean
  /** 忽略短于 N 字符的剪贴板文本（0=不忽略） */
  minClipboardLength: number
  /** 开机自启推荐已提示过（避免反复打扰） */
  onboardingTipsSeen: boolean

  // ── 剪贴板可控（A1–A5 / A8）──
  /** 非置顶历史条数上限 */
  maxHistorySize: number
  /** 不记录的应用进程名（不含路径） */
  excludedApps: string[]
  /** 是否启用系统剪贴板监听 */
  clipboardMonitorEnabled: boolean
  /** 是否保存图片到历史 */
  saveImages: boolean
  /** 图片最大体积（KB），超出不入库 */
  maxImageSizeKb: number
  /** 是否启用密钥智能识别 */
  enableSmartDetection: boolean

  // ── 更新（C3/C4）──
  /** 是否自动周期检查更新 */
  autoUpdateCheck: boolean
  /** 周期检查间隔（小时），1–24 */
  updateCheckIntervalHours: number
  /** 更新通道 */
  updateChannel: 'stable' | 'beta'

  // ── 安全体验（E1/E2）──
  /** 凭证详情默认遮罩 secret */
  maskSecretsByDefault: boolean
  /** 复制凭证时要求生物识别确认 */
  biometricOnCopy: boolean
  /** 导出时要求生物识别确认 */
  biometricOnExport: boolean
}

const DEFAULTS: ClipVaultPrefs = {
  imagePasteMode: 'both',
  imagesDir: null,
  autoClearTtlMs: 30_000,
  hideAfterCopy: false,
  minClipboardLength: 0,
  onboardingTipsSeen: false,
  maxHistorySize: 500,
  excludedApps: [],
  clipboardMonitorEnabled: true,
  saveImages: true,
  maxImageSizeKb: 5120,
  enableSmartDetection: true,
  autoUpdateCheck: true,
  updateCheckIntervalHours: 4,
  updateChannel: 'stable',
  maskSecretsByDefault: true,
  biometricOnCopy: false,
  biometricOnExport: false
}

function prefsPath(): string {
  return join(app.getPath('userData'), 'clipvault-prefs.json')
}

let cache: ClipVaultPrefs | null = null

/** 默认图片目录（userData/images） */
export function getDefaultImagesDir(): string {
  return join(app.getPath('userData'), 'images')
}

/**
 * 规范化用户自定义目录：
 * - 空 / 空白 → null（走默认）
 * - 必须是绝对路径
 * - normalize 掉 .. 等
 */
export function normalizeImagesDir(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const abs = isAbsolute(trimmed) ? normalize(trimmed) : null
  if (!abs) return null
  if (/^[a-zA-Z]:[\\/]?$/.test(abs) || abs === '/' || abs === '\\') return null
  return abs
}

function clampTtl(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULTS.autoClearTtlMs
  if (raw <= 0) return 0
  return Math.min(Math.floor(raw), 600_000)
}

function clampMinLen(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULTS.minClipboardLength
  return Math.max(0, Math.min(Math.floor(raw), 200))
}

function clampHistory(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULTS.maxHistorySize
  return Math.max(50, Math.min(Math.floor(raw), 5000))
}

function clampImageKb(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULTS.maxImageSizeKb
  return Math.max(100, Math.min(Math.floor(raw), 50_000))
}

function clampUpdateHours(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULTS.updateCheckIntervalHours
  return Math.max(1, Math.min(Math.floor(raw), 24))
}

function normalizeExcluded(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const t = x.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t)
    if (out.length >= 50) break
  }
  return out
}

function normalizePrefs(raw: unknown): ClipVaultPrefs {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<ClipVaultPrefs>
  const mode = obj.imagePasteMode
  const imagePasteMode: ImagePasteMode =
    mode === 'path' || mode === 'image' || mode === 'both' ? mode : DEFAULTS.imagePasteMode
  const imagesDir = normalizeImagesDir(obj.imagesDir)
  const ch = obj.updateChannel
  return {
    imagePasteMode,
    imagesDir,
    autoClearTtlMs: clampTtl(obj.autoClearTtlMs),
    hideAfterCopy: obj.hideAfterCopy === true,
    minClipboardLength: clampMinLen(obj.minClipboardLength),
    onboardingTipsSeen: obj.onboardingTipsSeen === true,
    maxHistorySize: clampHistory(obj.maxHistorySize),
    excludedApps: normalizeExcluded(obj.excludedApps),
    clipboardMonitorEnabled: obj.clipboardMonitorEnabled !== false,
    saveImages: obj.saveImages !== false,
    maxImageSizeKb: clampImageKb(obj.maxImageSizeKb),
    enableSmartDetection: obj.enableSmartDetection !== false,
    autoUpdateCheck: obj.autoUpdateCheck !== false,
    updateCheckIntervalHours: clampUpdateHours(obj.updateCheckIntervalHours),
    updateChannel: ch === 'beta' ? 'beta' : 'stable',
    maskSecretsByDefault: obj.maskSecretsByDefault !== false,
    biometricOnCopy: obj.biometricOnCopy === true,
    biometricOnExport: obj.biometricOnExport === true
  }
}

export function getPrefs(): ClipVaultPrefs {
  if (cache) return cache
  try {
    const p = prefsPath()
    if (!existsSync(p)) {
      cache = { ...DEFAULTS }
      return cache
    }
    const raw = JSON.parse(readFileSync(p, 'utf8')) as unknown
    cache = normalizePrefs(raw)
    return cache
  } catch (err) {
    logger.warn('[prefs] read failed, using defaults:', err)
    cache = { ...DEFAULTS }
    return cache
  }
}

export function setPrefs(partial: Partial<ClipVaultPrefs>): ClipVaultPrefs {
  const merged: ClipVaultPrefs = {
    ...getPrefs(),
    ...partial
  }
  if ('imagesDir' in partial) {
    merged.imagesDir = normalizeImagesDir(partial.imagesDir)
  }
  if ('excludedApps' in partial) {
    merged.excludedApps = normalizeExcluded(partial.excludedApps)
  }
  const next = normalizePrefs(merged)
  cache = next
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(prefsPath(), JSON.stringify(next, null, 2), 'utf8')
  } catch (err) {
    logger.warn('[prefs] write failed:', err)
  }
  return next
}

export function getImagePasteMode(): ImagePasteMode {
  return getPrefs().imagePasteMode
}

/** 当前实际使用的图片目录（已解析默认） */
export function resolveImagesDir(): string {
  return getPrefs().imagesDir ?? getDefaultImagesDir()
}

/**
 * 确保图片目录可写：不存在则创建。
 * 返回 { ok, path, error? }
 */
export function ensureImagesDirWritable(dir: string): {
  ok: boolean
  path: string
  error?: string
} {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    const probe = join(dir, '.clipvault-write-test')
    writeFileSync(probe, 'ok', { mode: 0o600 })
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('fs').unlinkSync(probe)
    } catch {
      /* ignore probe cleanup */
    }
    return { ok: true, path: dir }
  } catch (err) {
    return {
      ok: false,
      path: dir,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export { DEFAULTS as PREFS_DEFAULTS }
