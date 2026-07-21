/**
 * HUD 键盘导航 hook（v2.0 Sprint 6 · TASK-035）
 *
 * 注意：cmdk 自带 ↑↓ 键盘导航；本 hook 只负责全局热键：
 *   - Esc → 关闭 HUD
 *   - 其他快捷键可在此扩展
 */

import { useEffect } from 'react'

interface Sprint6APILike {
  hud: { hide: () => Promise<{ success: boolean }> }
}

function getApi(): Sprint6APILike | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { api?: { sprint6?: Sprint6APILike } }).api
  return api?.sprint6 ?? null
}

export function useHudKeyboardNav(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        const api = getApi()
        if (api) {
          void api.hud.hide()
        } else {
          // 独立页面下 fallback：直接 window.close 不适用，尝试隐藏 body
          document.body.style.display = 'none'
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
