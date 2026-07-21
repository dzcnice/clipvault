/**
 * 密码生成器单测（Sprint 11 · TASK-058）
 */

import { describe, it, expect } from 'vitest'
import {
  generateStrong,
  generatePassphrase,
  generatePIN
} from './generator'

describe('generateStrong', () => {
  it('生成长度正确的强密码', () => {
    const p = generateStrong({ length: 24 })
    expect(p).toHaveLength(24)
  })

  it('同时启用所有类别时至少包含一个小写/大写/数字/符号', () => {
    for (let i = 0; i < 20; i++) {
      const p = generateStrong({ length: 16 })
      expect(p).toMatch(/[a-z]/)
      expect(p).toMatch(/[A-Z]/)
      expect(p).toMatch(/[0-9]/)
      expect(p).toMatch(/[!@#$%^&*()\-_=+[\]{};:,.<>?/|~]/)
    }
  })

  it('仅启用小写与数字时不含大写/符号', () => {
    for (let i = 0; i < 10; i++) {
      const p = generateStrong({
        length: 20,
        includeLower: true,
        includeUpper: false,
        includeDigits: true,
        includeSymbols: false
      })
      expect(p).toMatch(/^[a-z0-9]+$/)
    }
  })

  it('excludeAmbiguous 时不含易混淆字符 0/O/1/l/I', () => {
    for (let i = 0; i < 30; i++) {
      const p = generateStrong({ length: 30, excludeAmbiguous: true })
      expect(p).not.toMatch(/[O0oIl1|`']/)
    }
  })

  it('length 小于 4 抛错', () => {
    expect(() => generateStrong({ length: 2 })).toThrow()
  })

  it('全部禁用字符集抛错', () => {
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
})

describe('generatePassphrase', () => {
  it('默认生成 wordCount 个英文单词，用 - 连接', () => {
    const p = generatePassphrase({ wordCount: 4 })
    const parts = p.split('-')
    expect(parts).toHaveLength(4)
    for (const w of parts) expect(w).toMatch(/^[a-z]+$/)
  })

  it('支持自定义 separator + capitalize', () => {
    const p = generatePassphrase({
      wordCount: 3,
      separator: '_',
      capitalize: true
    })
    const parts = p.split('_')
    expect(parts).toHaveLength(3)
    for (const w of parts) expect(w.charAt(0)).toMatch(/[A-Z]/)
  })

  it('includeNumber 会插入 2 位数字段', () => {
    const p = generatePassphrase({
      wordCount: 4,
      includeNumber: true
    })
    expect(p.split('-').length).toBe(5)
    expect(p).toMatch(/\d{2}/)
  })

  it('language=zh 时使用汉字', () => {
    const p = generatePassphrase({ wordCount: 4, language: 'zh' })
    const parts = p.split('-')
    expect(parts).toHaveLength(4)
    for (const w of parts) {
      expect(w).toMatch(/[\u4e00-\u9fa5]/)
    }
  })

  it('wordCount 越界抛错', () => {
    expect(() => generatePassphrase({ wordCount: 1 })).toThrow()
    expect(() => generatePassphrase({ wordCount: 999 })).toThrow()
  })
})

describe('generatePIN', () => {
  it('生成纯数字 PIN 且长度正确', () => {
    for (const len of [4, 5, 6, 7, 8]) {
      const p = generatePIN(len)
      expect(p).toHaveLength(len)
      expect(p).toMatch(/^\d+$/)
    }
  })

  it('越界长度抛错', () => {
    expect(() => generatePIN(3)).toThrow()
    expect(() => generatePIN(9)).toThrow()
  })
})
