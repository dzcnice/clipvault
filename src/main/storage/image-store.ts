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
  copyFileSync
} from 'fs'
import { join, basename } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { resolveImagesDir, getDefaultImagesDir } from '../prefs'
import { logger } from '../utils/logger'

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
let sharpMod: typeof import('sharp') | null | undefined
function loadSharp(): typeof import('sharp') | null {
  if (sharpMod !== undefined) return sharpMod
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sharpMod = require('sharp') as typeof import('sharp')
  } catch {
    sharpMod = null
  }
  return sharpMod
}

/**
 * 保存图片 Data URL 到磁盘，返回绝对路径
 * 若 sharp 可用，对 > 1024 边的图片做缩放 + 质量 80 压缩
 */
export async function saveImageDataUrl(dataUrl: string): Promise<string | null> {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return null

  const dir = ensureImagesDir()
  const ext = mimeToExt(parsed.mime)
  const filename = `${uuidv4()}.${ext}`
  const outPath = join(dir, filename)

  const raw = Buffer.from(parsed.base64, 'base64')
  const sharp = loadSharp()

  if (sharp) {
    try {
      const img = sharp(raw)
      const metadata = await img.metadata()
      const needResize =
        (metadata.width && metadata.width > 1024) ||
        (metadata.height && metadata.height > 1024)
      let pipe = img
      if (needResize) {
        pipe = pipe.resize({ width: 1024, height: 1024, fit: 'inside' })
      }
      let buffer: Buffer
      if (ext === 'jpg') {
        buffer = await pipe.jpeg({ quality: 80 }).toBuffer()
      } else if (ext === 'webp') {
        buffer = await pipe.webp({ quality: 80 }).toBuffer()
      } else {
        buffer = await pipe.png({ compressionLevel: 9 }).toBuffer()
      }
      writeFileSync(outPath, buffer, { mode: 0o600 })
      return outPath
    } catch {
      // sharp 处理失败则降级为直接写原始字节
    }
  }

  writeFileSync(outPath, raw, { mode: 0o600 })
  return outPath
}

/** 从磁盘读出图片并重建 Data URL；失败返回 null */
export function loadImageAsDataUrl(filePath: string): string | null {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const buf = readFileSync(filePath)
    const lower = filePath.toLowerCase()
    let mime = 'image/png'
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg'
    else if (lower.endsWith('.webp')) mime = 'image/webp'
    else if (lower.endsWith('.gif')) mime = 'image/gif'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
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
