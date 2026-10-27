import type Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getCurrentVersion, MIGRATIONS } from './migrations'

/** 升级前保存包含 WAL 已提交内容的一致快照；失败阻止迁移。 */
export function backupBeforeMigration(db: Database.Database): string | null {
  const version = getCurrentVersion(db)
  const target = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0
  if (version > target) throw new Error(`数据库版本 ${version} 高于当前应用支持的 ${target}，请使用匹配版本`)
  if (version === target || db.name === ':memory:' || !db.name) return null
  const tables = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get() as { n: number }
  if (tables.n === 0) return null
  const directory = join(dirname(db.name), 'migration-backups')
  mkdirSync(directory, { recursive: true })
  const destination = join(directory, `before-v${version}-to-v${target}-${randomUUID()}.db`)
  db.prepare('VACUUM INTO ?').run(destination)
  const columns = db.prepare('PRAGMA table_info(clipboard_history)').all() as Array<{ name: string }>
  if (columns.some(column => column.name === 'image_path')) {
    const rows = db.prepare("SELECT DISTINCT image_path FROM clipboard_history WHERE image_path IS NOT NULL AND image_path != ''").all() as Array<{ image_path: string }>
    if (rows.length) {
      const attachmentsDir = `${destination}.attachments`
      mkdirSync(attachmentsDir)
      const manifest = rows.map(({ image_path: source }) => {
        if (!existsSync(source)) return { source, missing: true }
        const file = `${randomUUID()}${extname(source)}`
        copyFileSync(source, join(attachmentsDir, file))
        return { source, file, missing: false }
      })
      writeFileSync(join(attachmentsDir, 'manifest.json'), JSON.stringify({ schemaVersion: version, attachments: manifest }, null, 2))
    }
  }
  return destination
}
