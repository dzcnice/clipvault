import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clipboard, ShieldCheck, Image as ImageIcon, Sparkles } from 'lucide-react'
import type { ClipboardItem } from '@/types'

type Hint = { kind: 'error' | 'image' | 'credential' | 'translate'; clipboardId: string; title: string; action: string; prompt?: string }

/**
 * 复制时在窗口顶部短暂展开的"灵动岛"。秘密类内容只显示类型，不显示原文。
 * Jarvis 有建议时（报错、截图、账号串、长英文）多停留一会儿，并带一个可点的动作。
 */
export default function ClipIsland(): JSX.Element {
  const navigate = useNavigate()
  const [item, setItem] = useState<{ text: string; kind: 'text' | 'secret' | 'image'; source?: string } | null>(null)
  const [hint, setHint] = useState<Hint | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const close = (ms: number): void => { clearTimeout(timer.current); timer.current = setTimeout(() => { setOpen(false); setHint(null) }, ms) }
    const off = window.api?.clipboard?.onNewItem?.((next: ClipboardItem) => {
      const secret = next.category === 'secret' || next.category === 'credential' || !!(next as { detectedKeyType?: string }).detectedKeyType
      const kind = secret ? 'secret' : next.type === 'image' ? 'image' : 'text'
      const text = secret ? '敏感内容 · 已遮罩，不会发给模型' : kind === 'image' ? '图片' : (next.preview || next.content || '').replace(/\s+/g, ' ').slice(0, 120)
      setItem({ text, kind, source: next.sourceApp }); setHint(null); setOpen(true); close(2600)
    })
    const offHint = window.api?.clipboard?.onHint?.(next => { setHint(next); setOpen(true); close(6000) })
    return () => { off?.(); offHint?.(); clearTimeout(timer.current) }
  }, [])
  const act = (): void => {
    if (!hint) return
    setOpen(false); setHint(null)
    if (hint.kind === 'credential') navigate('/inbox')
    else navigate('/sessions', { state: { mentions: [{ kind: 'clipboard', id: hint.clipboardId, label: hint.kind === 'image' ? '截图 / 图片' : '剪贴板资料' }], text: hint.prompt ?? '' } })
  }
  const Icon = hint ? Sparkles : item?.kind === 'secret' ? ShieldCheck : item?.kind === 'image' ? ImageIcon : Clipboard
  return <div role="status" aria-live="polite" aria-label={hint ? 'Jarvis 建议' : '刚复制的内容'} data-open={open}
    className={`fixed left-1/2 top-2.5 z-[60] flex h-9 -translate-x-1/2 items-center gap-2.5 overflow-hidden rounded-full bg-[#111113] pl-1.5 pr-1.5 text-[#f4f4f2] opacity-0 shadow-[0_10px_30px_-8px_rgba(0,0,0,.45)] transition-[width,opacity] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] data-[open=true]:opacity-100 ${hint && open ? 'pointer-events-auto' : 'pointer-events-none'}`}
    style={{ width: open ? 460 : 36 }}>
    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${hint ? 'bg-[var(--blue)]' : 'bg-[#2a2a2e]'}`}><Icon size={13} strokeWidth={1.75} /></span>
    {hint ? <>
      <span className={`min-w-0 flex-1 truncate text-[12.5px] transition-opacity delay-200 duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}>{hint.title}</span>
      <button type="button" onClick={act} className={`h-6 shrink-0 rounded-full bg-[#f4f4f2] px-3 text-xs font-medium text-[#111113] transition-opacity delay-200 duration-300 hover:bg-white ${open ? 'opacity-100' : 'opacity-0'}`}>{hint.action}</button>
    </> : item && <>
      <span className={`min-w-0 flex-1 truncate text-[12.5px] transition-opacity delay-200 duration-300 ${open ? 'opacity-100' : 'opacity-0'} ${item.kind === 'text' ? 'font-mono' : ''}`}>{item.text}</span>
      <span className={`mr-1.5 shrink-0 text-xs text-[#a6a6ae] transition-opacity delay-200 duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}>{item.source || '已保存'}</span>
    </>}
  </div>
}
