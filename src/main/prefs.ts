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
}

const DEFAULTS: ClipVaultPrefs = {
  imagePasteMode: 'both',
  imagesDir: null
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
  // 拒绝把根盘当图库（过于危险/空）
  if (/^[a-zA-Z]:[\\/]?$/.test(abs) || abs === '/' || abs === '\\') return null
  return abs
}

function normalizePrefs(raw: unknown): ClipVaultPrefs {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Partial<ClipVaultPrefs>
  const mode = obj.imagePasteMode
  const imagePasteMode: ImagePasteMode =
    mode === 'path' || mode === 'image' || mode === 'both' ? mode : DEFAULTS.imagePasteMode
  const imagesDir = normalizeImagesDir(obj.imagesDir)
  return { imagePasteMode, imagesDir }
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
  // 允许显式传 null 重置 imagesDir
  if ('imagesDir' in partial) {
    merged.imagesDir = normalizeImagesDir(partial.imagesDir)
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
    // 写探测文件
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
