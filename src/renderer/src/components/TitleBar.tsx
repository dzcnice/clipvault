/**
 * TitleBar · 画布顶部的拖拽区与窗口按钮
 */

import { useEffect, useState } from 'react'
import { Pin, PinOff, Minus, Square, Copy, X } from 'lucide-react'

export default function TitleBar(): JSX.Element {
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let alive = true
    const winApi = window.api?.window
    if (!winApi) return
    if (typeof winApi.getState === 'function') {
      winApi.getState().then((s) => {
        if (!alive) return
        setIsMaximized(Boolean(s?.maximized))
        setIsAlwaysOnTop(Boolean(s?.alwaysOnTop))
      }).catch(() => undefined)
    }
    let unsub: (() => void) | undefined
    if (typeof winApi.onStateChange === 'function') {
      unsub = winApi.onStateChange((state) => {
        if (!alive) return
        setIsMaximized(Boolean(state?.maximized))
        setIsAlwaysOnTop(Boolean(state?.alwaysOnTop))
      })
    }
    return () => { alive = false; unsub?.() }
  }, [])

  const btn = 'no-drag grid h-8 w-10 place-items-center rounded-[8px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]'
  const icon = { size: 14, strokeWidth: 1.75 }
  return (
    <div className="drag-region flex h-9 shrink-0 items-center justify-end gap-0.5 px-2">
      <button type="button" onClick={() => void window.api.window.toggleAlwaysOnTop().then(setIsAlwaysOnTop)} className={btn}
        style={isAlwaysOnTop ? { color: 'var(--blue)' } : undefined} title={isAlwaysOnTop ? '取消置顶' : '置顶'} aria-label={isAlwaysOnTop ? '取消置顶' : '置顶'}>
        {isAlwaysOnTop ? <PinOff {...icon} /> : <Pin {...icon} />}
      </button>
      <button type="button" onClick={() => window.api.window.minimize()} className={btn} title="最小化" aria-label="最小化"><Minus {...icon} /></button>
      <button type="button" onClick={() => { window.api.window.maximize(); setIsMaximized((v) => !v) }} className={btn} title={isMaximized ? '还原' : '最大化'} aria-label={isMaximized ? '还原' : '最大化'}>
        {isMaximized ? <Copy {...icon} size={12} /> : <Square {...icon} size={12} />}
      </button>
      <button type="button" onClick={() => window.api.window.close()} className={`${btn} hover:!bg-[var(--destructive)] hover:!text-white`} title="关闭" aria-label="关闭"><X {...icon} /></button>
    </div>
  )
}
