/**
 * v2.1 G3-2 · safeOpenExternal 白名单单测
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const openExternalMock = vi.fn((_url: string) => Promise.resolve())
vi.mock('electron', () => ({
  shell: {
    openExternal: (url: string) => openExternalMock(url)
  }
}))

const warnMock = vi.fn()
vi.mock('../utils/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => warnMock(...args),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

import { safeOpenExternal } from './open-external'

describe('safeOpenExternal', () => {
  beforeEach(() => {
    openExternalMock.mockClear()
    warnMock.mockClear()
  })

  it('放行 https:// 链接', () => {
    const ok = safeOpenExternal('https://example.com/a')
    expect(ok).toBe(true)
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com/a')
  })

  it('放行 http://localhost', () => {
    const ok = safeOpenExternal('http://localhost:8080/docs')
    expect(ok).toBe(true)
    expect(openExternalMock).toHaveBeenCalledOnce()
  })

  it('放行 mailto: 链接', () => {
    const ok = safeOpenExternal('mailto:hi@example.com')
    expect(ok).toBe(true)
  })

  it('拦截 file:// 协议并打 warn', () => {
    const ok = safeOpenExternal('file:///c/windows/system32/calc.exe')
    expect(ok).toBe(false)
    expect(openExternalMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalled()
    const msg = String(warnMock.mock.calls[0]?.[0] ?? '')
    expect(msg).toContain('blocked openExternal')
  })

  it('拦截自定义 / 恶意协议（javascript: / ms-word: 等）', () => {
    expect(safeOpenExternal('javascript:alert(1)')).toBe(false)
    expect(safeOpenExternal('ms-word:ofe|u|https://x')).toBe(false)
    expect(openExternalMock).not.toHaveBeenCalled()
  })

  it('拦截非法 URL / 空串', () => {
    expect(safeOpenExternal('')).toBe(false)
    expect(safeOpenExternal('not a url')).toBe(false)
    expect(openExternalMock).not.toHaveBeenCalled()
  })
})
