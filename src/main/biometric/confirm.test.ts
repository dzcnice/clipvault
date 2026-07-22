/**
 * confirmSensitiveAction 单元测试（mock prefs / enrollment）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../prefs', () => ({
  getPrefs: vi.fn(() => ({
    biometricOnCopy: false,
    biometricOnExport: false
  }))
}))

vi.mock('./index', () => ({
  getAvailability: vi.fn(() => ({
    isAvailable: true,
    enrolled: false,
    mechanism: 'dpapi',
    platform: 'win32'
  }))
}))

vi.mock('../../db/connection', () => ({
  getDatabase: vi.fn()
}))

import { confirmSensitiveAction } from './confirm'
import { getPrefs } from '../prefs'
import { getAvailability } from './index'

describe('confirmSensitiveAction', () => {
  beforeEach(() => {
    vi.mocked(getPrefs).mockReturnValue({
      biometricOnCopy: false,
      biometricOnExport: false
    } as never)
    vi.mocked(getAvailability).mockReturnValue({
      isAvailable: true,
      enrolled: false,
      mechanism: 'dpapi',
      platform: 'win32'
    } as never)
  })

  it('prefs 关闭时 skipped 通过', async () => {
    const r = await confirmSensitiveAction('copy', 'test')
    expect(r.ok).toBe(true)
    expect(r.skipped).toBe(true)
  })

  it('prefs 开启但未注册 → 失败', async () => {
    vi.mocked(getPrefs).mockReturnValue({
      biometricOnCopy: true,
      biometricOnExport: false
    } as never)
    vi.mocked(getAvailability).mockReturnValue({
      isAvailable: true,
      enrolled: false,
      mechanism: 'dpapi',
      platform: 'win32'
    } as never)
    const r = await confirmSensitiveAction('copy', 'test')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/尚未注册/)
  })

  it('系统不支持 → 失败', async () => {
    vi.mocked(getPrefs).mockReturnValue({
      biometricOnCopy: true,
      biometricOnExport: false
    } as never)
    vi.mocked(getAvailability).mockReturnValue({
      isAvailable: false,
      enrolled: false,
      mechanism: 'unsupported',
      platform: 'other'
    } as never)
    const r = await confirmSensitiveAction('copy', 'test')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/不支持/)
  })
})
