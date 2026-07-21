/**
 * migrations 执行器单元测试
 *
 * 由于 better-sqlite3 的 native binding 为 Electron ABI 编译，Node.js 单测
 * 环境直接 new Database 会冲突（v1.0 已有的 vault.test.ts 也是 mock 处理）。
 * 本测试构建一个 FakeDB，专门验证 *执行器* 逻辑：
 *   - validateMigrations 对 version 链的校验
 *   - runMigrations 按序推进 user_version
 *   - 幂等（重复调用不重复执行）
 *   - 失败的 migration 事务回滚 + user_version 不推进
 *
 * SQL 语义由 .sql 文件 + 实际运行时由 SQLite 引擎负责校验。
 */

import { describe, it, expect } from 'vitest'
import {
  runMigrations,
  getCurrentVersion,
  validateMigrations,
  MIGRATIONS,
  type MigrationDefinition
} from './index'
import type Database from 'better-sqlite3'

/**
 * 内存中 SQLite 替身：
 *   - 跟踪 user_version
 *   - 记录 exec/transaction 的调用历史
 *   - 支持 "throw on demand" 以模拟失败 migration
 */
interface FakeDB {
  db: Database.Database
  userVersion: () => number
  executed: () => string[]
}

function createFakeDb(options?: { shouldFailOnSql?: RegExp }): FakeDB {
  let userVersion = 0
  const executed: string[] = []
  const snapshots: number[] = []

  const db = {
    pragma(query: string, opts?: { simple?: boolean }): unknown {
      const trimmed = query.trim()
      // 读
      if (trimmed === 'user_version') {
        return opts?.simple ? userVersion : [{ user_version: userVersion }]
      }
      // 写 user_version = N
      const m = trimmed.match(/^user_version\s*=\s*(-?\d+)$/)
      if (m) {
        const next = parseInt(m[1] ?? '0', 10)
        userVersion = next
        return undefined
      }
      // 其他 pragma 忽略
      return undefined
    },
    exec(sql: string): void {
      if (options?.shouldFailOnSql && options.shouldFailOnSql.test(sql)) {
        throw new Error('fake exec failure')
      }
      executed.push(sql)
    },
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
      // 模拟 SQLite 事务：失败时回滚 userVersion 与 executed
      const wrapped = ((...args: unknown[]) => {
        const prevVersion = userVersion
        const prevExecLen = executed.length
        snapshots.push(prevVersion)
        try {
          return fn(...args)
        } catch (err) {
          userVersion = prevVersion
          executed.length = prevExecLen
          throw err
        } finally {
          snapshots.pop()
        }
      }) as T
      return wrapped
    }
  }

  return {
    db: db as unknown as Database.Database,
    userVersion: () => userVersion,
    executed: () => executed.slice()
  }
}

describe('migrations / validateMigrations', () => {
  it('接受严格单调递增 +1 的 migration 链', () => {
    const defs: MigrationDefinition[] = [
      { version: 1, name: 'a', sql: 'SELECT 1;' },
      { version: 2, name: 'b', sql: 'SELECT 1;' }
    ]
    expect(() => validateMigrations(defs)).not.toThrow()
  })

  it('拒绝跳号 migration', () => {
    const defs: MigrationDefinition[] = [
      { version: 1, name: 'a', sql: 'SELECT 1;' },
      { version: 3, name: 'c', sql: 'SELECT 1;' }
    ]
    expect(() => validateMigrations(defs)).toThrow(/broken chain/)
  })

  it('拒绝不从 1 开始', () => {
    const defs: MigrationDefinition[] = [{ version: 0, name: 'x', sql: 'SELECT 1;' }]
    expect(() => validateMigrations(defs)).toThrow()
  })

  it('生产 MIGRATIONS 列表本身必须合法', () => {
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow()
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('migrations / runMigrations', () => {
  it('空库从 v0 推进到最新版本', () => {
    const fake = createFakeDb()
    expect(getCurrentVersion(fake.db)).toBe(0)

    const result = runMigrations(fake.db)
    expect(result.fromVersion).toBe(0)
    expect(result.toVersion).toBe(MIGRATIONS.length)
    expect(result.applied.length).toBe(MIGRATIONS.length)
    expect(fake.userVersion()).toBe(MIGRATIONS.length)
  })

  it('每条 migration 的 SQL 都被 exec 到', () => {
    const fake = createFakeDb()
    runMigrations(fake.db)
    // transactional migration 各自一次 exec；non-transactional migration 按分号拆分后
    // 每条语句独立 exec（用于 ALTER TABLE 幂等容错）。因此 exec 次数 >= MIGRATIONS.length。
    expect(fake.executed().length).toBeGreaterThanOrEqual(MIGRATIONS.length)
    // 用 migration 名字里的业务关键字做更宽松的断言：每条 migration 的 SQL 里至少
    // 有一个显著的标识符（表名）必须出现在被 exec 的 SQL 串集合里。
    const executedAll = fake.executed().join('\n')
    const expectKeywords: Record<string, string> = {
      initial: 'categories',
      shortcuts: 'shortcuts',
      theme_setting: 'theme.mode',
      '004_team_members': 'team_self_keys',
      '005_shared_clipboard': 'shared_clipboard',
      '006_shared_credentials': 'shared_credentials',
      '007_ai_settings': 'ai_settings',
      '008_ai_audit_log': 'ai_audit_log',
      '009_vera_operation_history': 'vera_operation_history',
      '010_biometric': 'biometric_enrollment',
      '011_credential_audit': 'credential_audit',
      '012_recovery_phrase': 'recovery_phrase',
      '013_credential_totp': 'credential_totp',
      '014_ssh_keys': 'ssh_keys',
      '015_http_api_tokens': 'http_api_tokens',
      '016_webhooks': 'webhooks',
      '017_team_info': 'team_info',
      '018_workspace_fields': 'workspace',
      '019_self_identity_extend': 'avatar_blob',
      '020_file_transfers': 'file_transfers',
      '021_clipboard_encryption': 'content_encrypted',
      '022_sync_outbox': 'sync_outbox',
      '023_shared_clipboard_nullable_member': 'shared_clipboard__new'
    }
    for (const m of MIGRATIONS) {
      const kw = expectKeywords[m.name]
      if (!kw) continue
      expect(executedAll).toContain(kw)
    }
  })

  it('重复调用是幂等的（没有 pending 时不再执行 SQL）', () => {
    const fake = createFakeDb()
    runMigrations(fake.db)
    const firstExecCount = fake.executed().length

    const second = runMigrations(fake.db)
    expect(second.applied).toEqual([])
    expect(second.fromVersion).toBe(MIGRATIONS.length)
    expect(second.toVersion).toBe(MIGRATIONS.length)
    expect(fake.executed().length).toBe(firstExecCount)
  })

  it('只应用 pending 部分（已到 v1 时只跑 v2+）', () => {
    const fake = createFakeDb()
    // 手动把当前版本设为 1
    fake.db.pragma('user_version = 1')
    const result = runMigrations(fake.db)
    expect(result.fromVersion).toBe(1)
    expect(result.toVersion).toBe(MIGRATIONS.length)
    expect(result.applied.map((m) => m.version)).toEqual(
      MIGRATIONS.filter((m) => m.version > 1).map((m) => m.version)
    )
  })

  it('失败的 migration 回滚事务，user_version 不推进', () => {
    const fake = createFakeDb({ shouldFailOnSql: /__should_fail__/ })
    // 先跑到最新
    runMigrations(fake.db)
    const before = fake.userVersion()

    const brokenDefs: MigrationDefinition[] = [
      ...MIGRATIONS,
      {
        version: MIGRATIONS.length + 1,
        name: 'broken',
        sql: '-- __should_fail__\nSELECT 1;'
      }
    ]
    expect(() => runMigrations(fake.db, brokenDefs)).toThrow()
    expect(fake.userVersion()).toBe(before)
  })

  it('validateMigrations 在 runMigrations 里被调用，非法链直接抛', () => {
    const fake = createFakeDb()
    const broken: MigrationDefinition[] = [
      { version: 1, name: 'a', sql: 'SELECT 1;' },
      { version: 5, name: 'skip', sql: 'SELECT 1;' }
    ]
    expect(() => runMigrations(fake.db, broken)).toThrow(/broken chain/)
    // 版本没推进
    expect(fake.userVersion()).toBe(0)
  })
})
