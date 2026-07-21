/**
 * 生物识别最小逻辑测试
 *
 * 完整 enroll/unlock 涉及 electron safeStorage + vault.ts 状态，需集成测试；
 * 此处只验证 getAvailability 在 mock 下的归类。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

let fakeRow: unknown = null

vi.mock('../../db/connection', () => ({
  getDatabase: () => ({
    prepare: () => ({
      get: () => fakeRow,
      run: () => ({ changes: 1 })
    })
  })
}))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString()
  },
  systemPreferences: {
    canPromptTouchID: () => false,
    promptTouchID: async () => undefined
  }
}))

vi.mock('../crypto/vault', () => ({
  getVaultMode: () => 'password',
  unlockVault: () => true,
  unlockVaultSafeStorage: () => true
}))

import { getAvailability } from './index'

describe('biometric / getAvailability', () => {
  beforeEach(() => {
    fakeRow = null
  })

  it('未注册时 enrolled=false', () => {
    const a = getAvailability()
    expect(a.enrolled).toBe(false)
    // 平台结论：win32 → dpapi（safeStorage 可用），darwin → unsupported（mock canPromptTouchID=false），linux → unsupported
    if (process.platform === 'win32') {
      expect(a.mechanism).toBe('dpapi')
      expect(a.isAvailable).toBe(true)
    } else {
      expect(a.isAvailable).toBe(false)
      expect(a.mechanism).toBe('unsupported')
    }
  })

  it('已有 row 时 enrolled=true', () => {
    fakeRow = { id: 1, mechanism: 'dpapi' }
    const a = getAvailability()
    expect(a.enrolled).toBe(true)
  })
})
