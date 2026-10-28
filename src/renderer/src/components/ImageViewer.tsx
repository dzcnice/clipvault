import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Minus, Plus, RotateCcw, X } from 'lucide-react'

/** 剪贴板图片的大图预览（最长边 1800px，仅在内存中解密）。 */
export function useClipImage(id: string): { src?: string; failed: boolean } {
  const [state, setState] = useState<{ id: string; src?: string; failed: boolean }>({ id, failed: false })
  useEffect(() => {
    let alive = true
    void window.api.clipboard.getImage?.(id).then(result => { if (alive) setState({ id, src: result.success && result.data ? result.data : undefined, failed: !result.success || !result.data }) })
      .catch(() => { if (alive) setState({ id, failed: true }) })
    return () => { alive = false }
  }, [id])
  return state.id === id ? state : { failed: false }
}

/** 全屏查看：滚轮缩放、拖动平移、双击复位、Esc 关闭。 */
export function ImageLightbox({ src, onClose, caption }: { src: string; onClose: () => void; caption?: string }): JSX.Element {
  const [scale, setScale] = useState(1), [offset, setOffset] = useState({ x: 0, y: 0 }), [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const zoom = (factor: number): void => setScale(value => Math.min(8, Math.max(0.25, value * factor)))
  const reset = (): void => { setScale(1); setOffset({ x: 0, y: 0 }) }
  useEffect(() => {
    const key = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); else if (event.key === '+' || event.key === '=') zoom(1.25); else if (event.key === '-') zoom(0.8); else if (event.key === '0') reset() }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(<div role="dialog" aria-modal="true" aria-label="查看图片" className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm animate-[cv-rise_.2s_ease-out]"
    onWheel={event => zoom(event.deltaY < 0 ? 1.12 : 0.9)}>
    <div className="flex h-12 shrink-0 items-center gap-1 px-3 text-white/85">
      <span className="min-w-0 flex-1 truncate px-2 text-[13px]">{caption}</span>
      <span className="w-14 text-center font-mono text-xs">{Math.round(scale * 100)}%</span>
      {[[Minus, '缩小', () => zoom(0.8)], [Plus, '放大', () => zoom(1.25)], [RotateCcw, '复位', reset], [X, '关闭', onClose]].map(([Icon, label, action]) => {
        const I = Icon as typeof X
        return <button key={label as string} type="button" aria-label={label as string} title={label as string} onClick={action as () => void} className="grid h-8 w-8 place-items-center rounded-[8px] hover:bg-white/10"><I size={16} strokeWidth={1.8} /></button>
      })}
    </div>
    <div className="relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing" onClick={event => { if (event.target === event.currentTarget) onClose() }}
      onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; setDragging(true); (event.target as Element).setPointerCapture?.(event.pointerId) }}
      onPointerMove={event => { const start = drag.current; if (start) setOffset({ x: start.ox + event.clientX - start.x, y: start.oy + event.clientY - start.y }) }}
      onPointerUp={() => { drag.current = null; setDragging(false) }} onDoubleClick={reset}>
      <img src={src} alt={caption ?? ''} draggable={false} className="absolute left-1/2 top-1/2 max-h-[calc(100%-48px)] max-w-[calc(100%-48px)] select-none rounded-[6px] shadow-2xl"
        style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`, transition: dragging ? 'none' : 'transform .15s ease-out' }} />
    </div>
  </div>, document.body)
}
