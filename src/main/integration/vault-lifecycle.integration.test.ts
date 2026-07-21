/**
 * 集成测试 · 场景 1-3（vault 生命周期 / 凭证加密 roundtrip / migrations 执行）
 *
 * 用真实的 better-sqlite3 内存 DB + 真实 migrations + 真实 vault/credential-store，
 * 只替换 electron 模块到 stub。
 *
 * 找 bug 优先：遇到异常不 swallow，让 vitest 断言失败以暴露问题。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createIntegrationDb,
  closeIntegrationDb,
  getActiveIntegrationDb,
  integrationTransaction,
  isSqliteAvailable
} from '../../../test-setup/integration'

const SQLITE_OK = isSqliteAvailable()
const describeOrSkip = SQLITE_OK ? describe : describe.skip

// ========= mock electron 模块：给 safeStorage 一个简易的可逆实现 =========
vi.mock('electron', () => {
  return {
    app: {
      getPath: (): string => '/tmp/clipvault-test',
      getName: (): string => 'clipvault-test',
      getVersion: (): string => '0.0.0-test',
      on: (): void => {},
      once: (): void => {},
      whenReady: (): Promise<void> => Promise.resolve(),
      isReady: (): boolean => true
    },
    ipcMain: { on: (): void => {}, handle: (): void => {}, removeAllListeners: (): void => {} },
    BrowserWindow: class {
      static getAllWindows(): unknown[] {
        return []
      }
      isDestroyed(): boolean {
        return true
      }
      webContents = { send: (): void => {} }
    },
    clipboard: {
      readText: (): string => '',
      writeText: (): void => {},
      readImage: (): unknown => ({ isEmpty: () => true })
    },
    safeStorage: {
      isEncryptionAvailable: (): boolean => true,
      encryptString: (plain: string): Buffer => Buffer.from('os:' + plain, 'utf8'),
      decryptString: (buf: Buffer): string => {
        const s = buf.toString('utf8')
        if (!s.startsWith('os:')) throw new Error('invalid blob')
        return s.slice(3)
      }
    }
  }
})

// ========= mock db/connection：指向集成 DB =========
vi.mock('@/db/connection', () => ({
  getDatabase: () => getActiveIntegrationDb(),
  transaction: integrationTransaction,
  initDatabase: () => getActiveIntegrationDb(),
  closeDatabase: () => {}
}))
vi.mock('../../db/connection', () => ({
  getDatabase: () => getActiveIntegrationDb(),
  transaction: integrationTransaction,
  initDatabase: () => getActiveIntegrationDb(),
  closeDatabase: () => {}
}))

import * as vault from '../crypto/vault'
import * as credStore from '../../db/credential-store'
import { runMigrations, validateMigrations, MIGRATIONS } from '../../db/migrations'
import { CredentialType } from '../../types'

describeOrSkip('集成 · τ2.1 Vault 完整生命周期', () => {
  beforeEach(() => {
    createIntegrationDb()
  })
  afterEach(() => {
    vault.__resetVaultForTests()
    closeIntegrationDb()
  })

  it('setup → lock → unlock → 改密码 → 再 unlock（DEK 每次正确派生）', () => {
    // 1. 初始化
    expect(vault.isVaultInitialized()).toBe(false)
    vault.createVault('Initial!Password-2024')
    expect(vault.isUnlocked()).toBe(true)

    // 2. 用 DEK 加密一段标记
    const marker = vault.encryptWithDEK('hello-world-marker')
    expect(vault.decryptWithDEK(marker)).toBe('hello-world-marker')

    // 3. 锁定
    vault.lockVault()
    expect(vault.isUnlocked()).toBe(false)
    expect(() => vault.decryptWithDEK(marker)).toThrow()

    // 4. 用正确密码解锁并验证 marker 可解
    expect(vault.unlockVault('Initial!Password-2024')).toBe(true)
    expect(vault.decryptWithDEK(marker)).toBe('hello-world-marker')

    // 5. 错误密码
    vault.lockVault()
    expect(vault.unlockVault('wrong-pass-123')).toBe(false)
    expect(vault.isUnlocked()).toBe(false)

    // 6. 改密码
    expect(vault.unlockVault('Initial!Password-2024')).toBe(true)
    expect(vault.changePassword('Initial!Password-2024', 'NewStronger!Pass-2025')).toBe(true)

    // 改密码后仍保持解锁
    expect(vault.isUnlocked()).toBe(true)
    // 旧密码不可用
    vault.lockVault()
    expect(vault.unlockVault('Initial!Password-2024')).toBe(false)
    expect(vault.unlockVault('NewStronger!Pass-2025')).toBe(true)
    // DEK 仍能还原 marker（内部 DEK 相同）
    expect(vault.decryptWithDEK(marker)).toBe('hello-world-marker')
  })

  it('重复 createVault 应抛错', () => {
    vault.createVault('First!Password-2024')
    expect(() => vault.createVault('Second!Password-2025')).toThrow()
  })

  it('安全存储模式 (safestorage) 的 DEK 解锁自洽', () => {
    vault.createVaultSafeStorage()
    expect(vault.getVaultMode()).toBe('safestorage')
    const m = vault.encryptWithDEK('marker-ss')
    vault.lockVault()
    expect(vault.unlockVaultSafeStorage()).toBe(true)
    expect(vault.decryptWithDEK(m)).toBe('marker-ss')
  })
})

describeOrSkip('集成 · τ2.2 凭证加密存储 roundtrip', () => {
  beforeEach(() => {
    createIntegrationDb()
  })
  afterEach(() => {
    vault.__resetVaultForTests()
    closeIntegrationDb()
  })

  it('create 后的 value 加密保存、retrieve 时解密还原', () => {
    vault.createVault('Pass!Strong-2024')

    const created = credStore.createCredential({
      name: 'GitHub API Key',
      type: CredentialType.API_KEY,
      value: 'sk-super-secret-abc123',
      tags: ['dev', 'ci']
    })
    expect(created.value).toBe('sk-super-secret-abc123')

    // 从 DB 直接读 raw row，校验 value 已被加密（非明文）
    const db = getActiveIntegrationDb()
    const raw = db.prepare('SELECT * FROM credentials WHERE id = ?').get(created.id) as {
      value: string
      value_encrypted: number
    }
    expect(raw.value_encrypted).toBe(1)
    expect(raw.value).not.toBe('sk-super-secret-abc123')

    // API 取出后解密
    const fetched = credStore.getCredentialById(created.id)
    expect(fetched?.value).toBe('sk-super-secret-abc123')
    expect(fetched?.decryptError).toBeFalsy()

    // 锁定后取出：BUG-CRED-3 修复后 decrypt 失败会标记 decryptError=true
    vault.lockVault()
    const locked = credStore.getCredentialById(created.id)
    expect(locked?.value).toBe('') // 占位空串
    expect(locked?.decryptError).toBe(true) // 显式标志位
    expect(locked?.decryptErrorMessage).toBeTruthy()
  })

  it('【BUG-CRED-1 修复】vault 锁定时创建凭证必须抛 E_VAULT_LOCKED，绝不允许明文落盘', () => {
    // 注意：这里没有 createVault，代表 vault 未初始化（isUnlocked=false）
    expect(() =>
      credStore.createCredential({
        name: 'Leaked Plaintext',
        type: CredentialType.PASSWORD,
        value: 'i-will-be-plaintext'
      })
    ).toThrow(/E_VAULT_LOCKED/)

    // 断言 DB 里确实没有任何记录（没有幽灵写入）
    const db = getActiveIntegrationDb()
    const count = db.prepare('SELECT COUNT(*) as c FROM credentials').get() as { c: number }
    expect(count.c).toBe(0)
  })

  it('【BUG-CRED-2 修复】updateCredential 在锁定期间改 value 必须抛错，原密文保留', () => {
    vault.createVault('Pass!Update-2024')
    const c = credStore.createCredential({
      name: 'Rotating',
      type: CredentialType.PASSWORD,
      value: 'v1-secret'
    })
    const db = getActiveIntegrationDb()
    const enc0 = db.prepare('SELECT value, value_encrypted FROM credentials WHERE id = ?').get(
      c.id
    ) as { value: string; value_encrypted: number }
    expect(enc0.value_encrypted).toBe(1)
    const originalCipher = enc0.value

    // 锁定：update value 应该抛错
    vault.lockVault()
    expect(() =>
      credStore.updateCredential({ id: c.id, value: 'v2-plain' })
    ).toThrow(/E_VAULT_LOCKED/)

    // DB 里 value 字段原封不动（还是原密文，还是加密态）
    const raw = db.prepare('SELECT value, value_encrypted FROM credentials WHERE id = ?').get(
      c.id
    ) as { value: string; value_encrypted: number }
    expect(raw.value_encrypted).toBe(1)
    expect(raw.value).toBe(originalCipher)
  })

  it('【BUG-CRED-2 修复】updateCredential 锁定期间只改 metadata / name 应成功，不动 value', () => {
    vault.createVault('Pass!MetaUpdate-2024')
    const c = credStore.createCredential({
      name: 'before-rename',
      type: CredentialType.API_KEY,
      value: 'original-secret',
      tags: ['old-tag']
    })
    const db = getActiveIntegrationDb()
    const before = db
      .prepare('SELECT value, value_encrypted FROM credentials WHERE id = ?')
      .get(c.id) as { value: string; value_encrypted: number }

    vault.lockVault()
    // 只改 name 和 tags，未传 value —— 应该成功
    const ret = credStore.updateCredential({
      id: c.id,
      name: 'after-rename',
      tags: ['new-tag']
    })
    expect(ret).not.toBeNull()

    const after = db
      .prepare('SELECT value, value_encrypted, name FROM credentials WHERE id = ?')
      .get(c.id) as { value: string; value_encrypted: number; name: string }
    // 原 value / value_encrypted 完全保留
    expect(after.value).toBe(before.value)
    expect(after.value_encrypted).toBe(1)
    expect(after.name).toBe('after-rename')
  })

  it('【BUG-CRED-8 修复】空字符串 value 加密→解密 roundtrip 成功', () => {
    vault.createVault('EmptyRoundtrip!Pass-2024')
    const c = credStore.createCredential({
      name: 'empty-value',
      type: CredentialType.OTHER,
      value: ''
    })
    // 原样返回 ''；不应触发 decryptError
    expect(c.value).toBe('')
    expect(c.decryptError).toBeFalsy()

    const refetch = credStore.getCredentialById(c.id)
    expect(refetch?.value).toBe('')
    expect(refetch?.decryptError).toBeFalsy()

    // DB 里确实是加密态（非明文空串）
    const db = getActiveIntegrationDb()
    const raw = db
      .prepare('SELECT value, value_encrypted FROM credentials WHERE id = ?')
      .get(c.id) as { value: string; value_encrypted: number }
    expect(raw.value_encrypted).toBe(1)
    // "iv:authTag:" 形式，长度显著 > 0
    expect(raw.value.length).toBeGreaterThan(10)
  })
})

describeOrSkip('集成 · τ2.3 Migrations 执行', () => {
  beforeEach(() => {
    createIntegrationDb()
  })
  afterEach(() => {
    closeIntegrationDb()
  })

  it('16 个表 + 关键索引都已创建', () => {
    const db = getActiveIntegrationDb()
    const tableNames = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((r) => r.name)

    const expected = [
      'ai_audit_log',
      'ai_settings',
      'biometric_enrollment',
      'categories',
      'clipboard_history',
      'clipboard_tags',
      'credential_audit',
      'credential_tags',
      'credential_totp',
      'credentials',
      'http_api_tokens',
      'recovery_phrase',
      'settings',
      'shared_clipboard',
      'shared_credentials',
      'shortcuts',
      'ssh_keys',
      'tags',
      'team_members',
      'team_self_keys',
      'vault_meta',
      'vera_operation_history',
      'webhooks'
    ]
    for (const t of expected) {
      expect(tableNames, `missing table ${t}`).toContain(t)
    }
  })

  it('重复 runMigrations 是幂等的', () => {
    const db = getActiveIntegrationDb()
    // 再跑一遍不应该抛；版本号随 MIGRATIONS 链增长，不写死 16
    const r = runMigrations(db)
    expect(r.applied.length).toBe(0)
    expect(r.fromVersion).toBe(r.toVersion)
    expect(r.toVersion).toBeGreaterThanOrEqual(16)
  })

  it('validateMigrations 校验链条完整', () => {
    expect(() => validateMigrations(MIGRATIONS)).not.toThrow()
  })

  it('伪造降级：user_version=99 时 pending 为空', () => {
    const db = getActiveIntegrationDb()
    db.pragma('user_version = 99')
    const r = runMigrations(db)
    expect(r.applied.length).toBe(0)
    expect(r.toVersion).toBe(99)
  })

  it('在 migration003 之后 settings.theme.mode 应存在', () => {
    const db = getActiveIntegrationDb()
    const row = db.prepare("SELECT value FROM settings WHERE key='theme.mode'").get() as
      | { value: string }
      | undefined
    expect(row?.value).toBe('system')
  })
})
