import { describe, it, expect } from 'vitest'
import { isAppExcluded } from './source-app'

describe('isAppExcluded', () => {
  it('全等匹配（忽略 .exe 与大小写）', () => {
    expect(isAppExcluded('Code', ['code'])).toBe(true)
    expect(isAppExcluded('Code.exe', ['CODE'])).toBe(true)
    expect(isAppExcluded('chrome', ['firefox'])).toBe(false)
  })

  it('前缀通配 Code*', () => {
    expect(isAppExcluded('Code', ['Code*'])).toBe(true)
    expect(isAppExcluded('Code - Insiders', ['Code*'])).toBe(true)
    expect(isAppExcluded('VSCode', ['Code*'])).toBe(false)
  })

  it('禁止短串 includes 误伤', () => {
    expect(isAppExcluded('chrome', ['a'])).toBe(false)
    expect(isAppExcluded('notepad', ['pad'])).toBe(false)
    expect(isAppExcluded('codehelper', ['code'])).toBe(false)
  })

  it('空值安全', () => {
    expect(isAppExcluded(undefined, ['code'])).toBe(false)
    expect(isAppExcluded('code', [])).toBe(false)
    expect(isAppExcluded('code', ['', '  '])).toBe(false)
  })
})
