/**
 * 像素风轻量 Toast（复制成功等）
 */

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

type ToastPayload = { message: string; id: number }

let pushToast: ((message: string) => void) | null = null
let seq = 0

/** 任意处调用：showPixelToast('已复制') */
export function showPixelToast(message: string): void {
  pushToast?.(message)
}

export function PixelToastHost(): JSX.Element | null {
  const [toast, setToast] = useState<ToastPayload | null>(null)

  const show = useCallback((message: string) => {
    setToast({ message, id: ++seq })
  }, [])

  useEffect(() => {
    pushToast = show
    return () => {
      if (pushToast === show) pushToast = null
    }
  }, [show])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1400)
    return () => window.clearTimeout(t)
  }, [toast])

  if (!toast || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-8 left-1/2 z-[9999] -translate-x-1/2"
      key={toast.id}
    >
      <div className="cv-toast-pixel animate-toast pointer-events-auto">
        ★ {toast.message}
      </div>
    </div>,
    document.body
  )
}
