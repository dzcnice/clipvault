/**
 * SQLite Migration 执行器
 *
 * 机制：
 *   1. 读取 PRAGMA user_version
 *   2. 对所有 version > current 的 migration 按序执行
 *   3. 每条 migration 默认包裹事务；失败自动 ROLLBACK
 *   4. 成功则更新 PRAGMA user_version = migration.version
 *
 * 约束：
 *   - migration definitions 必须按 version 严格单调 +1
 *   - sql 字段支持多语句 (用分号分隔)，通过 db.exec 批量执行
 */

import type Database from 'better-sqlite3'
import { MIGRATIONS, type MigrationDefinition } from './definitions'

export { MIGRATIONS } from './definitions'
export type { MigrationDefinition } from './definitions'

/** 读取当前数据库版本（PRAGMA user_version） */
export function getCurrentVersion(db: Database.Database): number {
  const row = db.pragma('user_version', { simple: true }) as number
  return typeof row === 'number' ? row : 0
}

/**
 * 把 migration.sql 字符串按 ";" 切分为单条语句，去掉行注释与空白。
 * 供 non-transactional 模式下逐条容错执行（对 ALTER TABLE ADD COLUMN 幂等很关键）。
 */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    // 去掉单行 "--" 注释（块注释较少见，保留下来由 SQLite 自己处理）
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * 容错执行单条语句：对 SQLite "duplicate column name" 错误静默吞掉，
 * 用于保证 ALTER TABLE ADD COLUMN 在 user_version 回滚后重跑时的幂等性。
 * 其它错误照常抛出。
 */
function tolerantExec(db: Database.Database, sql: string): void {
  try {
    db.exec(sql)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/duplicate column name/i.test(msg)) {
      // 列已存在：视为幂等成功
      return
    }
    throw err
  }
}

/** 原子执行单个 migration（事务 + 版本号写入） */
function applyMigration(db: Database.Database, migration: MigrationDefinition): void {
  const useTransaction = migration.transactional !== false
  if (useTransaction) {
    db.transaction(() => {
      db.exec(migration.sql)
      db.pragma(`user_version = ${migration.version}`)
    })()
    return
  }

  // Non-transactional：用于 ALTER TABLE ADD COLUMN 等需幂等容错的语句。
  // 逐条 exec，每条单独吞 "duplicate column name" 错误。
  for (const stmt of splitStatements(migration.sql)) {
    tolerantExec(db, stmt)
  }
  db.pragma(`user_version = ${migration.version}`)
}

export interface MigrationLogger {
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string, err?: unknown) => void
}

const noopLogger: MigrationLogger = {
  info: () => {},
  warn: () => {},
  error: () => {}
}

/** 校验 migration 列表的完整性：version 必须从 1 开始严格 +1 递增。 */
export function validateMigrations(defs: readonly MigrationDefinition[]): void {
  for (let i = 0; i < defs.length; i++) {
    const expected = i + 1
    const actual = defs[i]?.version
    if (actual !== expected) {
      throw new Error(
        `[migrations] broken chain at index ${i}: expected version ${expected}, got ${actual}`
      )
    }
  }
}

export interface RunMigrationsResult {
  fromVersion: number
  toVersion: number
  applied: MigrationDefinition[]
}

/** 运行所有未应用的 migration，返回本次变更摘要。 */
export function runMigrations(
  db: Database.Database,
  defs: readonly MigrationDefinition[] = MIGRATIONS,
  logger: MigrationLogger = noopLogger
): RunMigrationsResult {
  validateMigrations(defs)
  const fromVersion = getCurrentVersion(db)
  const pending = defs.filter((m) => m.version > fromVersion)

  if (pending.length === 0) {
    logger.info(`[migrations] up-to-date (version=${fromVersion})`)
    return { fromVersion, toVersion: fromVersion, applied: [] }
  }

  logger.info(
    `[migrations] upgrading from v${fromVersion} -> v${pending[pending.length - 1]?.version ?? fromVersion} (${pending.length} pending)`
  )

  const applied: MigrationDefinition[] = []
  try {
    for (const m of pending) {
      applyMigration(db, m)
      applied.push(m)
      logger.info(`[migrations] applied v${m.version} (${m.name})`)
    }
  } catch (err) {
    logger.error(
      `[migrations] failed at v${applied.length + fromVersion + 1}: aborting`,
      err
    )
    throw err
  }

  const toVersion = getCurrentVersion(db)
  return { fromVersion, toVersion, applied }
}
