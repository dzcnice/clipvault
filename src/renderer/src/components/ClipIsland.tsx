import { useEffect, useRef, useState } from 'react'
import { Clipboard, ShieldCheck, Image as ImageIcon } from 'lucide-react'
import type { ClipboardItem } from '@/types'

/** 复制时在窗口顶部短暂展开的"灵动岛"。秘密类内容只显示类型，不显示原文。 */
export default function ClipIsland(): JSX.Element {
  const [item, setItem] = useState<{ text: string; kind: 'text' | 'secret' | 'image'; source?: string } | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    const off = window.api?.clipboard?.onNewItem?.((next: ClipboardItem) => {
      const secret = next.category === 'secret' || next.category === 'credential' || !!(next as { detectedKeyType?: string }).detectedKeyType
      const kind = secret ? 'secret' : next.type === 'image' ? 'image' : 'text'
      const text = secret ? '敏感内容 · 已遮罩，不会发给模型' : kind === 'image' ? '图片' : (next.preview || next.content || '').replace(/\s+/g, ' ').slice(0, 120)
      setItem({ text, kind, source: next.sourceApp }); setOpen(true)
      clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 2600)
    })
    return () => { off?.(); clearTimeout(timer.current) }
  }, [])
  const Icon = item?.kind === 'secret' ? ShieldCheck : item?.kind === 'image' ? ImageIcon : Clipboard
  return <div role="status" aria-live="polite" aria-label="刚复制的内容" data-open={open}
    className="pointer-events-none fixed left-1/2 top-2.5 z-[60] flex h-9 -translate-x-1/2 items-center gap-2.5 overflow-hidden rounded-full bg-[#111113] pl-1.5 pr-3 text-[#f4f4f2] opacity-0 shadow-[0_10px_30px_-8px_rgba(0,0,0,.45)] transition-[width,opacity] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] data-[open=true]:opacity-100"
    style={{ width: open ? 440 : 36 }}>
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#2a2a2e]"><Icon size={13} strokeWidth={1.75} /></span>
    {item && <>
      <span className={`min-w-0 flex-1 truncate text-[12.5px] transition-opacity delay-200 duration-300 ${open ? 'opacity-100' : 'opacity-0'} ${item.kind === 'text' ? 'font-mono' : ''}`}>{item.text}</span>
      <span className={`shrink-0 text-xs text-[#a6a6ae] transition-opacity delay-200 duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}>{item.source || '已保存'}</span>
    </>}
  </div>
}
