import { getDatabase } from '../../db/connection'
import { getClipboardItemById } from '../../db/clipboard-store'
import { listProjects } from '../../db/workbench-store'
import { isUnlocked } from '../crypto/vault'
import { classifyClip, matchProject } from './classify'

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
