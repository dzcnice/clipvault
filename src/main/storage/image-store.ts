/**
 * 图片文件存储
 *
 * 截图/剪贴板图片写入磁盘，数据库只保留 image_path 绝对路径。
 * 目录默认 %userData%/images，可在设置中自定义（prefs.imagesDir）。
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  existsSync,
  copyFileSync, lstatSync, readdirSync
} from 'fs'
import { join, basename, extname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { resolveImagesDir, getDefaultImagesDir } from '../prefs'
import { logger } from '../utils/logger'
import { encodeImage, decodeImage, MAX_IMAGE_BYTES, type ImageBytes } from './image-codec'

function ensureImagesDir(): string {
  const dir = resolveImagesDir()
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    } catch (err) {
      logger.warn('[image-store] mkdir custom dir failed, fallback default:', err)
      const fallback = getDefaultImagesDir()
      if (!existsSync(fallback)) {
        mkdirSync(fallback, { recursive: true, mode: 0o700 })
      }
      return fallback
    }
  }
  return dir
}

/**
 * 从 Data URL 提取 MIME 与 base64 内容
 * 形如：data:image/png;base64,iVBORw0KGgoAAA...
 */
function parseDataUrl(dataUrl: string): { mime: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/)
  if (!match || !match[1] || match[2] === undefined) return null
  return { mime: match[1], base64: match[2] }
}

function mimeToExt(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'bin'
  }
}

/** sharp 是 native module；动态加载失败时走 no-op 压缩路径 */
type SharpFactory = typeof import('sharp')['default']
let sharpMod: SharpFactory | null | undefined
function loadSharp(): SharpFactory | null {
  if (sharpMod !== undefined) return sharpMod
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('sharp') as SharpFactory | { default: SharpFactory }
    sharpMod = typeof loaded === 'function' ? loaded : loaded.default
  } catch {
    sharpMod = null
  }
  return sharpMod
}

/**
 * 保存图片 Data URL 到磁盘，返回绝对路径
 * 原始字节保留，缩略图由 loadThumbnailAsDataUrl 单独生成。
 */
export async function saveImageDataUrl(dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null

  const dir = ensureImagesDir()
  if (parsed.base64.length > MAX_IMAGE_BYTES * 1.4) throw new Error('图片超过 32 MB 上限')
  const filename = `${uuidv4()}.cvimg`
  const outPath = join(dir, filename)

  const raw = Buffer.from(parsed.base64, 'base64')
  writeFileSync(outPath, encodeImage({ mime: parsed.mime, bytes: raw }), { flag: 'wx', mode: 0o600 })
  return outPath
}

/** 快照拥有自己的文件，原历史的清理不影响长期副本。 */
export function copyImageFile(source: string): string {
  if (!existsSync(source)) throw new Error('原图片已不存在，无法长期保存')
  const destination = join(ensureImagesDir(), `${uuidv4()}.cvimg`)
  writeFileSync(destination, encodeImage(readImageBytes(source)), { flag: 'wx', mode: 0o600 })
  return destination
}

/** 列表用缩略图（小 JPEG）；失败返回 null */
export async function loadThumbnailAsDataUrl(
  filePath: string,
  maxEdge = 240
): Promise<string | null> {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const sharp = loadSharp()
    if (sharp) {
      const buffer = await sharp(readImageBytes(filePath).bytes)
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 55 })
        .toBuffer()
      return `data:image/jpeg;base64,${buffer.toString('base64')}`
    }
    return loadImageAsDataUrl(filePath)
  } catch {
    return loadImageAsDataUrl(filePath)
  }
}

/** 从磁盘读出图片并重建 Data URL；失败返回 null */
export function loadImageAsDataUrl(filePath: string): string | null {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const { bytes, mime } = readImageBytes(filePath)
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

export function readImageBytes(filePath: string): ImageBytes {
  const info = lstatSync(filePath)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_IMAGE_BYTES + 128) throw new Error('图片不是普通文件或超过大小上限')
  return decodeImage(readFileSync(filePath), extname(filePath).toLowerCase())
}

/** 只有用户选择复制路径时才产生明文；十分钟后及下次启动时回收本应用导出文件。 */
export function exportImagePath(filePath: string): string {
  const image = readImageBytes(filePath), root = join(getDefaultImagesDir(), 'temporary-exports')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  cleanupImageExports()
  const destination = join(root, `cv-export-${uuidv4()}.${mimeToExt(image.mime)}`)
  writeFileSync(destination, image.bytes, { flag: 'wx', mode: 0o600 })
  const timer = setTimeout(() => { try { unlinkSync(destination) } catch { /* 使用中的文件留待下次清理 */ } }, 10 * 60_000)
  timer.unref()
  return destination
}

export function cleanupImageExports(): void {
  const root = join(getDefaultImagesDir(), 'temporary-exports')
  if (!existsSync(root)) return
  for (const name of readdirSync(root)) {
    if (!/^cv-export-[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(name)) continue
    const path = join(root, name)
    try { const info = lstatSync(path); if (info.isFile() && !info.isSymbolicLink() && Date.now() - info.mtimeMs >= 10 * 60_000) unlinkSync(path) } catch { /* 不影响历史读取 */ }
  }
}

/** 删除单个图片文件（不存在时忽略） */
export function deleteImageFile(filePath: string | null | undefined): void {
  if (!filePath) return
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch {
    // 单张图删不掉不影响主逻辑
  }
}

/**
 * 将历史截图从旧目录迁移到新目录，并更新 clipboard_history.image_path。
 * - 仅处理磁盘上仍存在的文件
 * - 复制后更新 DB；原文件保留（避免半失败丢图）
 * - 失败条数计入 failed，不中断整批
 */
export function migrateClipboardImagePaths(
  newDir: string
): { scanned: number; moved: number; updated: number; failed: number; skipped: number } {
  // lazy import 避免 image-store ↔ db 循环在模块顶层爆炸
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getDatabase } = require('../../db/connection') as {
    getDatabase: () => {
      prepare: (sql: string) => {
        all: (...a: unknown[]) => Array<{ id: string; image_path: string }>
        run: (...a: unknown[]) => unknown
      }
    }
  }

  if (!existsSync(newDir)) {
    mkdirSync(newDir, { recursive: true, mode: 0o700 })
  }

  const db = getDatabase()
  const rows = db
    .prepare(
      `SELECT id, image_path FROM clipboard_history
       WHERE type = 'image' AND image_path IS NOT NULL AND image_path != ''`
    )
    .all() as Array<{ id: string; image_path: string }>

  let moved = 0
  let updated = 0
  let failed = 0
  let skipped = 0
  const update = db.prepare(`UPDATE clipboard_history SET image_path = ? WHERE id = ?`)

  for (const row of rows) {
    const oldPath = row.image_path
    if (!oldPath) {
      skipped += 1
      continue
    }
    // 已在目标目录
    if (oldPath.startsWith(newDir)) {
      skipped += 1
      continue
    }
    if (!existsSync(oldPath)) {
      skipped += 1
      continue
    }
    try {
      const name = basename(oldPath) || `${uuidv4()}.png`
      const dest = join(newDir, name)
      // 重名则加 uuid 前缀
      const finalDest = existsSync(dest) ? join(newDir, `${uuidv4()}_${name}`) : dest
      copyFileSync(oldPath, finalDest)
      moved += 1
      update.run(finalDest, row.id)
      updated += 1
    } catch (err) {
      failed += 1
      logger.warn('[image-store] migrate failed for', row.id, err)
    }
  }

  return { scanned: rows.length, moved, updated, failed, skipped }
}

export const __test__ = {
  getImagesDir: resolveImagesDir,
  getDefaultImagesDir
}
