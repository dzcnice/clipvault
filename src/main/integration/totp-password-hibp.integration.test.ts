/**
 * 集成测试 · 场景 8/9/10
 *  - TOTP 生成 + 持久化（需要 vault + credential_totp 表）
 *  - 密码生成器三模式 + zxcvbn 熵检查
 *  - HIBP k-anonymity 调用（mock fetch）
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

vi.mock('electron', () => ({
  app: { getPath: (): string => '/tmp/clipvault-test' },
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeAllListeners: vi.fn() },
  BrowserWindow: class {
    isDestroyed(): boolean {
      return false
    }
    webContents = { send: vi.fn() }
  },
  clipboard: { readText: () => '', writeText: () => {} },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from('os:' + s, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').slice(3)
  }
}))

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
import * as totpStore from '../../db/credential-totp-store'
import { generateTOTP, generateFromConfig } from '../totp/generator'
import {
  generateStrong,
  generatePassphrase,
  generatePIN
} from '../password/generator'
import zxcvbn from 'zxcvbn'

describeOrSkip('集成 · τ2.8 TOTP 生成 + 持久化', () => {
  beforeEach(() => {
    createIntegrationDb()
  })
  afterEach(() => {
    vault.__resetVaultForTests()
    closeIntegrationDb()
  })

  it('插入 TOTP → 读回 → 生成 6 位数字码', () => {
    vault.createVault('TotpPass!2024')
    const credId = 'cred-totp-1'
    const db = getActiveIntegrationDb()
    // 先插入一个凭证（credential_totp 的 FK 要求）
    db.prepare(
      `INSERT INTO credentials (id, name, type, value, created_at, updated_at, use_count, is_favorite, value_encrypted)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0)`
    ).run(credId, 'GitHub 2FA', 'api_key', '', Date.now(), Date.now())

    const cfg = totpStore.upsertTOTP({
      credentialId: credId,
      secret: 'JBSWY3DPEHPK3PXP', // 标准测试 secret
      issuer: 'ExampleService',
      account: 'alice@example.com'
    })
    expect(cfg.credentialId).toBe(credId)

    const loaded = totpStore.getTOTP(credId)
    expect(loaded?.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(loaded?.issuer).toBe('ExampleService')

    const code = generateFromConfig(loaded!, 1700000000000) // 固定时间戳
    expect(code.code).toMatch(/^\d{6}$/)
    expect(code.periodMs).toBe(30_000)
    expect(code.remainingMs).toBeGreaterThanOrEqual(0)
    expect(code.remainingMs).toBeLessThanOrEqual(30_000)
  })

  it('vault 锁定时 getTOTP 应返回 null（不解密）', () => {
    vault.createVault('Locked!Test-2024')
    const db = getActiveIntegrationDb()
    db.prepare(
      `INSERT INTO credentials (id, name, type, value, created_at, updated_at, use_count, is_favorite, value_encrypted)
       VALUES ('c1', 'x', 'api_key', '', 0, 0, 0, 0, 0)`
    ).run()
    totpStore.upsertTOTP({ credentialId: 'c1', secret: 'JBSWY3DPEHPK3PXP' })
    vault.lockVault()
    expect(totpStore.getTOTP('c1')).toBeNull()
  })

  it('vault 未解锁时 upsertTOTP 应抛错（不允许降级明文）', () => {
    // 不调 createVault
    const db = getActiveIntegrationDb()
    db.prepare(
      `INSERT INTO credentials (id, name, type, value, created_at, updated_at, use_count, is_favorite, value_encrypted)
       VALUES ('cx', 'x', 'api_key', '', 0, 0, 0, 0, 0)`
    ).run()
    expect(() =>
      totpStore.upsertTOTP({ credentialId: 'cx', secret: 'JBSWY3DPEHPK3PXP' })
    ).toThrow(/未解锁/)
  })

  it('TOTP 30s 窗口切换：now 推进后 code 会变', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const t1 = generateTOTP({ secret, now: 1_000_000 })
    const t2 = generateTOTP({ secret, now: 1_000_000 + 30_000 })
    expect(t1.code).not.toBe(t2.code) // 跨窗口应不同
  })
})

describe('集成 · τ2.9 密码生成器三模式 + zxcvbn', () => {
  it('generateStrong 10 次：长度正确、至少两种字符、两两不同', () => {
    const set = new Set<string>()
    for (let i = 0; i < 10; i++) {
      const s = generateStrong({ length: 20 })
      expect(s.length).toBe(20)
      // 至少含数字或符号（默认开启所有）
      expect(/\d/.test(s)).toBe(true)
      set.add(s)
    }
    expect(set.size).toBe(10) // 完全重复概率几乎为 0
  })

  it('generateStrong 强度 zxcvbn ≥ 3', () => {
    for (let i = 0; i < 5; i++) {
      const s = generateStrong({ length: 16 })
      const score = zxcvbn(s).score
      expect(score).toBeGreaterThanOrEqual(3)
    }
  })

  it('generatePassphrase 英文 4 词默认分隔符为 -', () => {
    const p = generatePassphrase({ wordCount: 4 })
    expect(p.split('-')).toHaveLength(4)
  })

  it('generatePIN 长度 6', () => {
    const pin = generatePIN(6)
    expect(pin).toMatch(/^\d{6}$/)
  })

  it('generateStrong 启用 excludeAmbiguous 后不应出现 0/O/l/1/I', () => {
    for (let i = 0; i < 20; i++) {
      const s = generateStrong({ length: 20, excludeAmbiguous: true })
      expect(/[O0lI1|`']/.test(s)).toBe(false)
    }
  })

  it('generateStrong 非法参数抛错', () => {
    expect(() => generateStrong({ length: 3 })).toThrow()
    expect(() => generateStrong({ length: 300 })).toThrow()
    expect(() =>
      generateStrong({
        length: 10,
        includeLower: false,
        includeUpper: false,
        includeDigits: false,
        includeSymbols: false
      })
    ).toThrow()
  })

  it('generatePIN 长度 3 或 9 抛错', () => {
    expect(() => generatePIN(3)).toThrow()
    expect(() => generatePIN(9)).toThrow()
  })
})

describe('集成 · τ2.10 HIBP k-anonymity（mock fetch）', () => {
  beforeEach(() => {
    // 每次清 cache 避免测试污染
  })

  it('URL 只含 SHA1 前 5 位；完整 hash 永不出现', async () => {
    // 动态 import 避免 fetch mock 生效前模块级 fetch 绑定
    const { checkPasswordLeaked, _clearHibpCache, sha1Upper } = await import('../health/hibp')
    _clearHibpCache()

    const password = 'password123'
    const full = sha1Upper(password)
    const prefix = full.slice(0, 5)
    const suffix = full.slice(5)

    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    const fetchMock = vi.fn(async (url: string, init: { headers: Record<string, string> }) => {
      capturedUrl = url
      capturedHeaders = init.headers
      // 响应里随便塞一条，让 suffix 命中返回 count=42
      return {
        ok: true,
        status: 200,
        text: async () => `${suffix}:42\r\nAAAAA:1\r\nBBBBB:2\r\n`
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const count = await checkPasswordLeaked(password)
    expect(count).toBe(42)

    // 关键断言：URL 只含前 5 位
    expect(capturedUrl).toBe('https://api.pwnedpasswords.com/range/' + prefix)
    // URL 不能含完整 hash 或 suffix
    expect(capturedUrl).not.toContain(full)
    expect(capturedUrl).not.toContain(suffix)
    // User-Agent 按规范设置
    expect(capturedHeaders['User-Agent']).toContain('ClipVault')

    vi.unstubAllGlobals()
  })

  it('响应缓存命中：第二次调用不再 fetch', async () => {
    const { checkPasswordLeaked, _clearHibpCache } = await import('../health/hibp')
    _clearHibpCache()

    const fetchCalls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      fetchCalls.push(url)
      return {
        ok: true,
        text: async () => 'IRRELEVANT:0\r\n'
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    await checkPasswordLeaked('cache-me')
    await checkPasswordLeaked('cache-me')
    expect(fetchCalls.length).toBe(1) // 第二次命中 cache

    vi.unstubAllGlobals()
  })

  it('HTTP 非 2xx 抛错', async () => {
    const { checkPasswordLeaked, _clearHibpCache } = await import('../health/hibp')
    _clearHibpCache()

    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await expect(checkPasswordLeaked('never-seen')).rejects.toThrow(/HIBP HTTP 500/)
    vi.unstubAllGlobals()
  })
})
