/**
 * 数据库连接管理
 * 使用 better-sqlite3 进行 SQLite 操作
 *
 * v2.0：initSchema 改为通过 migrations 执行器（src/db/migrations）。
 * 保留 safeAlter 兼容层：存量 v1.0 数据库的 user_version 可能为 0，
 * 但实际已存在某些列——我们在 migrations 前先 safeAlter 补齐，
 * 然后让 migrations 安全地把 user_version 推到最新。
 */

import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { logger } from '../main/utils/logger'
import { runMigrations } from './migrations'

let db: Database.Database | null = null

/** 获取数据库文件路径 */
function getDbPath(): string {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'clipvault.db')
}

/** 初始化数据库 */
export function initDatabase(): Database.Database {
  if (db) {
    return db
  }

  const dbPath = getDbPath()
  logger.info(`[DB] Initializing database at: ${dbPath}`)

  // 确保目录存在
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  // 创建数据库连接
  db = new Database(dbPath)

  // 启用 WAL 模式提高并发性能
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 执行 Schema 初始化
  initSchema(db)

  logger.info('[DB] Database initialized successfully')
  return db
}

/** 存量 v1.0 数据库的兼容补齐（这些列 v1.0 通过 safeAlter 加过） */
function legacyCompatAlter(database: Database.Database): void {
  const safeAlter = (sql: string): void => {
    try {
      database.exec(sql)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('duplicate column') && !msg.includes('no such table')) {
        logger.warn('[DB] legacy alter skipped:', msg)
      }
    }
  }

  safeAlter(`ALTER TABLE credentials ADD COLUMN value_encrypted INTEGER NOT NULL DEFAULT 0`)
  safeAlter(`ALTER TABLE clipboard_history ADD COLUMN pinned_at INTEGER`)
  safeAlter(`ALTER TABLE clipboard_history ADD COLUMN image_path TEXT`)
}

/** 初始化默认剪贴板设置（v1.0 行为保留） */
function seedDefaultSettings(database: Database.Database): void {
  const now = Date.now()
  const insertSetting = database.prepare(
    'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
  )
  const defaults: Array<[string, string]> = [
    ['clipboard.enabled', 'true'],
    ['clipboard.pollInterval', '500'],
    ['clipboard.maxHistorySize', '500'],
    ['clipboard.saveImages', 'true'],
    ['clipboard.maxImageSize', '5120'],
    ['clipboard.enableSmartDetection', 'true']
  ]
  for (const [key, value] of defaults) {
    insertSetting.run(key, value, now)
  }
}

/** 执行 Schema 初始化 */
function initSchema(database: Database.Database): void {
  // 1. 运行 migration（版本化 schema 迁移）
  const result = runMigrations(database, undefined, {
    info: (msg) => logger.info(msg),
    warn: (msg) => logger.warn(msg),
    error: (msg, err) => logger.error(msg, err)
  })

  // 2. 存量 v1.0 数据库补齐列（对旧 user_version=0 但已存在旧表的情形）
  legacyCompatAlter(database)

  // 3. 种入默认设置
  seedDefaultSettings(database)

  if (result.applied.length > 0) {
    logger.info(
      `[DB] migrations applied: ${result.applied.map((m) => m.version).join(',')} (from v${result.fromVersion} to v${result.toVersion})`
    )
  }
}

/** 获取数据库实例 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase()
  }
  return db
}

/** 关闭数据库连接 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
    logger.info('[DB] Database connection closed')
  }
}

/** 数据库事务包装 */
export function transaction<T>(fn: () => T): T {
  const database = getDatabase()
  return database.transaction(fn)()
}
