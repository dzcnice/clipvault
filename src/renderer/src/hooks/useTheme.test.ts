// @vitest-environment jsdom
/**
 * useTheme hook 单元测试 · v3.0 默认深色
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from './useTheme'

const STORAGE_KEY = 'clipvault.theme.mode'

function mockMatchMedia(dark: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

describe('useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('无存储时默认 light', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('light')
    expect(result.current.resolved).toBe('light')
  })

  it('system 模式且系统偏好 dark 时 resolved=dark', () => {
    mockMatchMedia(true)
    window.localStorage.setItem(STORAGE_KEY, 'system')
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.resolved).toBe('dark')
  })

  it('system 模式且系统偏好 light 时 resolved=light', () => {
    mockMatchMedia(false)
    window.localStorage.setItem(STORAGE_KEY, 'system')
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('system')
    expect(result.current.resolved).toBe('light')
  })

  it('setMode 切换到 dark 并写入 localStorage', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark'))
    expect(result.current.mode).toBe('dark')
    expect(result.current.resolved).toBe('dark')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark')
  })

  it('setMode light 强制覆盖系统偏好', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('light'))
    expect(result.current.resolved).toBe('light')
  })

  it('应用 data-theme 到 <html>', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark'))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('初始化读取 localStorage 里的 mode', () => {
    window.localStorage.setItem(STORAGE_KEY, 'light')
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('light')
    expect(result.current.resolved).toBe('light')
  })
})
