/**
 * vault 单元测试
 * 使用内存 Map 模拟 better-sqlite3，避免在 Node 模式下加载 Electron 专用的 native 绑定
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 简易内存"表"：只为 vault_meta 单行服务
let metaRow: Record<string, unknown> | null = null

function fakeDb() {
  return {
    prepare(sql: string) {
      const s = sql.trim()
      if (s.startsWith('SELECT')) {
        return {
          get: () => metaRow ?? undefined,
          run: () => ({ changes: 0 })
        }
      }
      if (s.startsWith('INSERT')) {
        return {
          run: (...args: unknown[]) => {
            // INSERT .. VALUES(1, ?, ?, ?, ?, ?, 'password'|'safestorage', ?)
            // 实际 bind 参数 6 个：salt, iv, auth_tag, encrypted_dek, kdf_params, created_at
            const [salt, iv, auth_tag, encrypted_dek, kdf_params, created_at] = args
            const mode = s.includes("'password'") ? 'password' : 'safestorage'
            metaRow = {
              id: 1,
              salt,
              iv,
              auth_tag,
              encrypted_dek,
              kdf_params,
              mode,
              created_at
            }
            return { changes: 1 }
          }
        }
      }
      if (s.startsWith('UPDATE')) {
        return {
          run: (...args: unknown[]) => {
            if (metaRow) {
              const [salt, iv, auth_tag, encrypted_dek] = args
              Object.assign(metaRow, { salt, iv, auth_tag, encrypted_dek })
            }
            return { changes: 1 }
          }
        }
      }
      if (s.startsWith('DELETE')) {
        return {
          run: () => {
            metaRow = null
            return { changes: 1 }
          }
        }
      }
      return { get: () => undefined, run: () => ({ changes: 0 }) }
    }
  }
}

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from('os:' + plain, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8').slice(3)
  }
}))

vi.mock('../../db/connection', () => ({
  getDatabase: () => fakeDb(),
  transaction: <T>(fn: () => T) => fn()
}))

import * as vault from './vault'

describe('vault（主密码 + DEK）', () => {
  beforeEach(() => {
    metaRow = null
    vault.__resetVaultForTests()
  })

  afterEach(() => {
    vault.__resetVaultForTests()
  })

  it('isVaultInitialized 初始为 false', () => {
    expect(vault.isVaultInitialized()).toBe(false)
  })

  it('createVault 后 isInitialized=true 且自动解锁', () => {
    vault.createVault('hello-123')
    expect(vault.isVaultInitialized()).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
  })

  it('lockVault 后 unlock 正确密码可再次进入', () => {
    vault.createVault('Hunter2$Secure')
    vault.lockVault()
    expect(vault.isUnlocked()).toBe(false)
    expect(vault.unlockVault('Hunter2$Secure')).toBe(true)
    expect(vault.isUnlocked()).toBe(true)
  })

  it('unlock 错误密码返回 false 且保持锁定', () => {
    vault.createVault('right-password')
    vault.lockVault()
    expect(vault.unlockVault('wrong-password')).toBe(false)
    expect(vault.isUnlocked()).toBe(false)
  })

  it('changePassword 成功后旧密码失效、新密码可用', () => {
    vault.createVault('old-pass')
    const ok = vault.changePassword('old-pass', 'new-pass')
    expect(ok).toBe(true)
    vault.lockVault()
    expect(vault.unlockVault('old-pass')).toBe(false)
    expect(vault.unlockVault('new-pass')).toBe(true)
  })

  it('encryptWithDEK / decryptWithDEK roundtrip', () => {
    vault.createVault('Pw1234$Strong')
    const secret = 'my-super-secret-value'
    const cipher = vault.encryptWithDEK(secret)
    expect(cipher).not.toBe(secret)
    expect(vault.decryptWithDEK(cipher)).toBe(secret)
  })

  it('未解锁调用加密应抛错', () => {
    vault.createVault('Pw1234$Strong')
    vault.lockVault()
    expect(() => vault.encryptWithDEK('x')).toThrow()
    expect(() => vault.decryptWithDEK('x:y:z')).toThrow()
  })

  it('safeStorage 免密模式可用', () => {
    vault.createVaultSafeStorage()
    expect(vault.getVaultMode()).toBe('safestorage')
    expect(vault.isUnlocked()).toBe(true)
    vault.lockVault()
    expect(vault.unlockVaultSafeStorage()).toBe(true)
  })
})
