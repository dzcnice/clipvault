/**
 * crypto/index 单元测试
 * 注意：由于 safeStorage 依赖 Electron 运行时，此处用 vi.mock 打桩
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 打桩 electron safeStorage；注意必须在 import 之前
vi.mock('electron', () => {
  let available = true
  const store = new Map<string, Buffer>()
  return {
    safeStorage: {
      isEncryptionAvailable: () => available,
      encryptString: (plain: string) => {
        const b = Buffer.from('enc:' + plain, 'utf8')
        store.set(plain, b)
        return b
      },
      decryptString: (buf: Buffer) => {
        const s = buf.toString('utf8')
        if (!s.startsWith('enc:')) throw new Error('bad buffer')
        return s.slice(4)
      },
      __setAvailable: (v: boolean) => (available = v)
    }
  }
})

import {
  encryptString,
  decryptString,
  encryptBuffer,
  decryptBuffer,
  isEncryptionAvailable
} from './index'
import * as electron from 'electron'

// 避免 no-extra-semi：统一用局部引用代替前导分号
/* eslint-disable @typescript-eslint/no-explicit-any */
const ss = electron.safeStorage as any

describe('crypto/index (safeStorage 封装)', () => {
  beforeEach(() => {
    ss.__setAvailable(true)
  })

  it('字符串加密-解密 roundtrip', () => {
    const plain = 'hello-key-123'
    const cipher = encryptString(plain)
    expect(cipher).not.toBe(plain)
    expect(decryptString(cipher)).toBe(plain)
  })

  it('Buffer 加密-解密 roundtrip', () => {
    const plain = Buffer.from([1, 2, 3, 4, 5])
    const cipher = encryptBuffer(plain)
    const dec = decryptBuffer(cipher)
    expect(dec.equals(plain)).toBe(true)
  })

  it('safeStorage 不可用时应抛错', () => {
    ss.__setAvailable(false)
    expect(isEncryptionAvailable()).toBe(false)
    expect(() => encryptString('x')).toThrow()
    expect(() => decryptString('y')).toThrow()
  })
})
