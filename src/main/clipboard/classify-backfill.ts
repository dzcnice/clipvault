import { getDatabase } from '../../db/connection'
import { getClipboardItemById } from '../../db/clipboard-store'
import { listProjects } from '../../db/workbench-store'
import { isUnlocked } from '../crypto/vault'
import { classifyClip, matchProject } from './classify'
import { looksLikeAccountList } from './account-combo'

let running = false
export async function backfillClipCategories(): Promise<number> {
  if (running || !isUnlocked()) return 0
  running = true
  let count = 0, cursor = 0
  try {
    const projects = listProjects(), db = getDatabase()
    while (isUnlocked()) {
      const rows = db.prepare('SELECT rowid AS cursor,id FROM clipboard_history WHERE category IS NULL AND rowid>? ORDER BY rowid LIMIT 200').all(cursor) as Array<{ cursor: number; id: string }>
      if (!rows.length) break
      const update = db.prepare('UPDATE clipboard_history SET category=?,project_id=? WHERE id=? AND category IS NULL')
      db.transaction(() => {
        for (const row of rows) {
          cursor = row.cursor
          const item = getClipboardItemById(row.id, false)
          if (!item || item.decryptError || !isUnlocked()) continue
          const text = item.content ?? item.filePath ?? ''
          update.run(classifyClip({ type: item.type, text, sourceApp: item.sourceApp }).category, matchProject(text, projects), row.id); count++
        }
      })()
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    return count
  } finally { running = false }
}

/** 分类规则升级（v2 识别账号串）：已有文字记录里的账号串改为「账号资料」，只升级不降级；最近 3 天的给出存为资源建议。 */
export const CLASSIFIER_VERSION = 2
export async function reclassifyAccountStrings(suggest?: (id: string) => void): Promise<number> {
  if (running || !isUnlocked()) return 0
  const db = getDatabase()
  const version = db.prepare("SELECT data FROM wb_settings WHERE key='clipboard.classifier'").get() as { data: string } | undefined
  if (version && Number(version.data) >= CLASSIFIER_VERSION) return 0
  running = true
  let count = 0, cursor = 0
  try {
    const recent = Date.now() - 3 * 86_400_000
    while (isUnlocked()) {
      const rows = db.prepare("SELECT rowid AS cursor,id,created_at FROM clipboard_history WHERE type IN ('text','html') AND category IN ('text','code','command','path','link') AND rowid>? ORDER BY rowid LIMIT 200").all(cursor) as Array<{ cursor: number; id: string; created_at: number }>
      if (!rows.length) break
      const changed: Array<{ id: string; recent: boolean }> = []
      db.transaction(() => {
        for (const row of rows) {
          cursor = row.cursor
          const item = getClipboardItemById(row.id, false)
          if (!item || item.decryptError || !isUnlocked() || !looksLikeAccountList(item.content ?? '')) continue
          db.prepare("UPDATE clipboard_history SET category='credential' WHERE id=?").run(row.id); count++
          changed.push({ id: row.id, recent: row.created_at >= recent })
        }
      })()
      for (const item of changed) if (item.recent) suggest?.(item.id)
      await new Promise<void>(resolve => setImmediate(resolve))
    }
    if (isUnlocked()) db.prepare("INSERT INTO wb_settings (key,data) VALUES ('clipboard.classifier',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(String(CLASSIFIER_VERSION))
    return count
  } finally { running = false }
}
