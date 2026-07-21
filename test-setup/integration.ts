/**
 * 集成测试辅助：搭建真实的 better-sqlite3 + migrations 环境
 *
 * 用途：
 *   - 集成测试调用 `createIntegrationDb()` 得到一个 :memory: DB（已执行全部 migrations）
 *   - 通过 `vi.mock('../../db/connection', () => ...)` 把 getDatabase 指到该 DB
 *   - 测试结束用 `closeIntegrationDb()` 清理
 *
 * 为什么在独立文件而不是 vi.mock 内联：
 *   - 方便多个集成测试文件共享
 *   - 避免 hoist 顺序导致的 "Cannot access before initialization"
 *
 * ⚠️ 关于 better-sqlite3 ABI 兼容（重要！）：
 *   项目里 better-sqlite3 默认编译为 Electron ABI（NODE_MODULE_VERSION=136），
 *   而 vitest 以纯 Node 运行（ABI=127），运行集成测试前必须切换到 Node ABI：
 *
 *       npm run rebuild:sqlite      # 一次切到 Node 22，跑完集成测试
 *       npm run postinstall          # 切回 Electron，恢复 dev/build 能力
 *
 *   若 .node 绑定与当前 Node ABI 不匹配，本模块的 `isSqliteAvailable()` 会
 *   返回 false，依赖 sqlite 的 describe 区块自动跳过（不会污染单元测试结果）。
 *   依赖 sqlite 的 18+ 测试将以 'skipped' 状态报告，由开发者按需手动 rebuild。
 */

import type Database from 'better-sqlite3'
import { runMigrations } from '../src/db/migrations'

let currentDb: Database.Database | null = null

/**
 * 检测 better-sqlite3 原生绑定是否可用。
 *
 * 为什么：better-sqlite3 的 prebuild 绑定 target 是 Electron（ABI 136），而 vitest
 * 以纯 Node（ABI 127）运行，跨平台集成测试要么先 `npm rebuild better-sqlite3 --build-from-source`，
 * 要么在这里优雅降级。若加载失败就让 describe 用 `describe.skip` 跳过集成测试。
 */
export function isSqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require('better-sqlite3')
    const tmp = new Database(':memory:')
    tmp.close()
    return true
  } catch (err) {
    // 不静默：便于区分「ABI 不匹配」与「未安装」
    const msg = err instanceof Error ? err.message : String(err)
    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      console.warn(
        `[integration] better-sqlite3 unavailable under current Node ABI — integration suites will skip.\n` +
          `  reason: ${msg}\n` +
          `  fix: npm run rebuild:sqlite   # Node ABI for vitest\n` +
          `  then: npm run postinstall     # restore Electron ABI for dev/build`
      )
    }
    return false
  }
}

/** 创建一个内存 DB 并跑完所有 migrations */
export function createIntegrationDb(): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as new (input: string) => Database.Database
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  currentDb = db
  return db
}

/** 返回当前活动 DB（供 vi.mock 里的 getDatabase 返回） */
export function getActiveIntegrationDb(): Database.Database {
  if (!currentDb) throw new Error('integration DB 未初始化，请先调用 createIntegrationDb()')
  return currentDb
}

/** 替换当前活动 DB（供 restoreFromBackup 场景） */
export function setActiveIntegrationDb(db: Database.Database): void {
  currentDb = db
}

/** 关闭并清空 */
export function closeIntegrationDb(): void {
  if (currentDb) {
    try {
      currentDb.close()
    } catch {
      /* ignore */
    }
    currentDb = null
  }
}

/** 便捷 transaction 包装（对齐 connection.ts 的 transaction 函数签名） */
export function integrationTransaction<T>(fn: () => T): T {
  const db = getActiveIntegrationDb()
  return db.transaction(fn)()
}
