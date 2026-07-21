/**
 * TitleBar · 像素窗框（轻）
 */

import { useEffect, useState } from 'react'
import { ChevronUp, Minus, Square, Copy, X } from 'lucide-react'

export default function TitleBar(): JSX.Element {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    const winApi = window.api?.window
    if (!winApi) return

    if (typeof winApi.getState === 'function') {
      winApi
        .getState()
        .then((s) => {
          if (!alive) return
          setIsMaximized(Boolean(s?.maximized))
          setIsAlwaysOnTop(Boolean(s?.alwaysOnTop))
        })
        .catch(() => undefined)
    }

    let unsub: (() => void) | undefined
    if (typeof winApi.onStateChange === 'function') {
      unsub = winApi.onStateChange((state) => {
        if (!alive) return
        setIsMaximized(Boolean(state?.maximized))
        setIsAlwaysOnTop(Boolean(state?.alwaysOnTop))
      })
    }

    return () => {
      alive = false
      unsub?.()
    }
  }, [])

  const btn =
    'no-drag flex h-7 w-7 items-center justify-center border-2 border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--primary-soft)] active:translate-x-px active:translate-y-px'

  return (
    <div className="drag-region flex h-11 shrink-0 items-center justify-between px-3">
      <div className="no-drag font-pixel px-1 text-[11px] font-bold tracking-[0.16em] text-muted-foreground">
        CLIPVAULT
      </div>

      <div className="no-drag flex items-center gap-1">
        <button
          type="button"
          onClick={() => void window.api.window.toggleAlwaysOnTop().then(setIsAlwaysOnTop)}
          className={btn}
          style={isAlwaysOnTop ? { background: 'var(--primary-soft)' } : undefined}
          title={isAlwaysOnTop ? '取消置顶' : '置顶'}
          aria-label={isAlwaysOnTop ? '取消置顶' : '置顶'}
        >
          <ChevronUp size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => window.api.window.minimize()}
          className={btn}
          title="最小化"
          aria-label="最小化"
        >
          <Minus size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => {
            window.api.window.maximize()
            setIsMaximized((v) => !v)
          }}
          className={btn}
          title={isMaximized ? '还原' : '最大化'}
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <Copy size={11} strokeWidth={2.5} />
          ) : (
            <Square size={11} strokeWidth={2.5} />
          )}
        </button>
        <button
          type="button"
          onClick={() => window.api.window.close()}
          className={`${btn} hover:!bg-[var(--destructive)] hover:!text-white`}
          title="关闭"
          aria-label="关闭"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
