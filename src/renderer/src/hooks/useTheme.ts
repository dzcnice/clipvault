/**
 * useTheme：主题切换 hook
 *
 * - mode：用户偏好（'system' | 'light' | 'dark'）
 * - resolved：实际生效的主题（'light' | 'dark'）
 * - setMode：写入 localStorage（v2 后续 Sprint 可改为通过 IPC 落库）
 *
 * 跟随系统：通过 matchMedia('(prefers-color-scheme: dark)') 监听。
 * 副作用：把 resolved 写到 <html data-theme="..."> 上，配合 tokens.css 切换。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'clipvault.theme.mode'

function readStoredMode(): ThemeMode {
  // v3.1：默认暖纸浅色
  if (typeof window === 'undefined') return 'light'
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* ignore */
  }
  return 'light'
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeAttribute(theme: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

export interface UseThemeReturn {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  resolved: ResolvedTheme
}

export function useTheme(): UseThemeReturn {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode())
  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemPrefersDark())

  // 监听系统主题变化
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
      return () => mql.removeEventListener('change', handler)
    }
    // 老版浏览器
    mql.addListener(handler)
    return () => mql.removeListener(handler)
  }, [])

  const resolved: ResolvedTheme = useMemo(() => {
    if (mode === 'system') return systemDark ? 'dark' : 'light'
    return mode
  }, [mode, systemDark])

  // 应用到 <html data-theme>
  useEffect(() => {
    applyThemeAttribute(resolved)
  }, [resolved])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  return { mode, setMode, resolved }
}
