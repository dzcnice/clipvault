import { existsSync, lstatSync, realpathSync, unlinkSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { getDatabase } from '../../db/connection'
import { performBackup } from '../backup'
import { getDefaultImagesDir } from '../prefs'
import { copyImageFile, readImageBytes, deleteImageFile } from './image-store'
import { within } from '../workbench/files'

/** Runs only for the current vault after the UI explains and confirms conversion. */
export async function protectLegacyImages(): Promise<{ converted: number; retainedOriginals: number; failed: number }> {
  const backup = performBackup()
  if (!backup.success) throw new Error('转换前备份失败，原图片未改变')
  const db = getDatabase(), root = resolve(getDefaultImagesDir())
  const rows = db.prepare("SELECT DISTINCT image_path FROM clipboard_history WHERE image_path IS NOT NULL AND image_path<>''").all() as Array<{ image_path: string }>
  const result = { converted: 0, retainedOriginals: 0, failed: 0 }
  for (const { image_path: old } of rows) {
    if (old.toLowerCase().endsWith('.cvimg')) continue
    let created: string | undefined, switched = false
    try {
      const bytes = readImageBytes(old).bytes
      created = copyImageFile(old)
      if (!readImageBytes(created).bytes.equals(bytes)) throw new Error('加密图片核对失败')
      const changed = db.prepare('UPDATE clipboard_history SET image_path=? WHERE image_path=?').run(created, old).changes
      if (!changed) { deleteImageFile(created); continue }
      switched = true; result.converted++
      const info = lstatSync(old)
      const owned = existsSync(root) && within(realpathSync(root), realpathSync(old)) && !info.isSymbolicLink() && info.nlink === 1 && /^[0-9a-f-]{36}\.(png|jpe?g|webp|gif|bin)$/i.test(basename(old))
      if (owned) { try { unlinkSync(old) } catch { result.retainedOriginals++ } }
      else result.retainedOriginals++
    } catch { if (created && !switched) deleteImageFile(created); result.failed++ }
    await new Promise<void>(resolve => setImmediate(resolve))
  }
  return result
}
