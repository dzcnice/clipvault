import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardPaste, Copy, Pin, PinOff, Bookmark, Trash2, MessageSquarePlus, KeyRound, Eye, Maximize2, ScanText, Sparkles, Check } from 'lucide-react'
import type { ClipboardItem } from '@/types'
import { ClipThumb, type ImageCopyMode } from './ClipboardList'
import { ImageLightbox, useClipImage } from './ImageViewer'
import ClipboardOccurrences from './ClipboardOccurrences'

const icon = { size: 14, strokeWidth: 1.75 }
const LABELS: Record<string, string> = { text: '文本', code: '代码', error: '报错', command: '命令', link: '链接', path: '路径', image: '图片', secret: '密钥', credential: '账号资料', html: 'HTML', file: '文件' }

export default function ClipboardDetail({ item, copy, paste, pin, save, remove, resource, image }: { item: ClipboardItem; copy: () => void; paste: () => void; pin: () => void; save: () => void; remove: () => void; resource: () => void; image: (mode: ImageCopyMode) => void }): JSX.Element {
  const [revealed, setRevealed] = useState(false), [viewing, setViewing] = useState(false), [copiedText, setCopiedText] = useState(false)
  const preview = useClipImage(item.type === 'image' ? item.id : '')
  const sensitive = ['secret', 'credential'].includes(item.category || '')
  const mono = !['text', 'credential'].includes(item.category || 'text') || item.type === 'file'
  return <aside className="flex w-[340px] shrink-0 animate-[cv-rise_.35s_cubic-bezier(.16,1,.3,1)] flex-col border-l border-[var(--line)]" aria-label="剪贴板详情">
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-medium">详情<span className="cv-badge">{LABELS[item.category || item.type] ?? item.category ?? item.type}</span></h2>
      {item.type === 'image' && <>
        <button type="button" aria-label="查看大图" onClick={() => preview.src && setViewing(true)} className="group relative block w-full overflow-hidden rounded-[12px] bg-[var(--surface-2)] shadow-[inset_0_0_0_1px_var(--line)]">
          {preview.src ? <img src={preview.src} alt="" draggable={false} className="max-h-[42vh] w-full object-contain" /> : <ClipThumb id={item.id} imageData={item.imageData} variant="tile" />}
          <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-[8px] bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"><Maximize2 size={13} strokeWidth={2} /></span>
        </button>
        {viewing && preview.src && <ImageLightbox src={preview.src} caption={`${item.sourceApp || '未知来源'} · ${new Date(item.createdAt).toLocaleString()}`} onClose={() => setViewing(false)} />}
        <Link className="cv-btn cv-btn-primary !h-9 w-full" to="/sessions" state={{ mentions: [{ kind: 'clipboard', id: item.id, label: '截图 / 图片' }], text: '这张图里有什么？请帮我解读，并指出需要注意的地方' }}><Sparkles {...icon} />问 AI 这张图</Link>
        {item.ocrText ? <section className="rounded-[12px] bg-[var(--surface-2)] shadow-[inset_0_0_0_1px_var(--line)]">
          <h3 className="flex items-center gap-2 px-3.5 pt-3 text-xs font-medium text-[var(--ink-soft)]"><ScanText {...icon} size={13} />图片中的文字<span className="font-normal text-[var(--ink-faint)]">本机识别</span>
            <button type="button" className="ml-auto flex items-center gap-1 rounded-[6px] px-1.5 py-0.5 text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" onClick={() => { void navigator.clipboard.writeText(item.ocrText ?? '').then(() => { setCopiedText(true); setTimeout(() => setCopiedText(false), 1500) }) }}>{copiedText ? <Check size={12} /> : <Copy size={12} />}{copiedText ? '已复制' : '复制文字'}</button></h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words px-3.5 pb-3 pt-2 font-sans text-[12.5px] leading-relaxed">{item.ocrText}</pre>
        </section> : <p className="text-xs text-[var(--ink-faint)]">{item.ocrState === 'empty' ? '这张图里没有识别到文字。' : item.ocrState === 'failed' ? '本机文字识别未完成（可能缺少 Windows 识别语言）。' : '正在本机识别图片中的文字，完成后可以按文字搜到它。'}</p>}
      </>}
      {item.type !== 'image' && <div className="relative">
        <pre className={`max-h-[46vh] min-h-[120px] overflow-auto whitespace-pre-wrap break-all rounded-[12px] bg-[var(--surface-2)] p-3.5 text-[12.5px] leading-[1.75] shadow-[inset_0_0_0_1px_var(--line)] ${mono ? 'font-mono' : 'font-sans text-[13px]'} ${sensitive && !revealed ? 'select-none tracking-[.3em] text-[var(--ink-faint)]' : ''}`}>{sensitive && !revealed ? '••••••••••••' : item.content || item.filePath || item.preview}</pre>
        {sensitive && <button className="cv-btn cv-btn-secondary absolute bottom-2.5 right-2.5 !h-7 text-xs" onPointerDown={() => setRevealed(true)} onPointerUp={() => setRevealed(false)} onPointerLeave={() => setRevealed(false)} onBlur={() => setRevealed(false)} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setRevealed(true) } }} onKeyUp={() => setRevealed(false)}><Eye {...icon} size={13} />按住查看敏感资料</button>}
      </div>}
      {item.aiMeta && <section className="rounded-[12px] bg-[var(--primary-soft)] p-3"><h3 className="text-xs font-medium text-[var(--blue)]">AI 整理 · {item.aiMeta.title}</h3><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--ink)]">{item.aiMeta.summary}</p></section>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
        <dt className="text-[var(--ink-faint)]">来源</dt><dd className="truncate text-right">{item.sourceApp || '未知来源'}</dd>
        <dt className="text-[var(--ink-faint)]">首次复制</dt><dd className="text-right font-mono">{new Date(item.createdAt).toLocaleString()}</dd>
      </dl>
      <ClipboardOccurrences item={item} />
      {item.type === 'image' && <div className="flex flex-wrap gap-1.5">{(['image', 'path', 'both'] as const).map(mode => <button key={mode} className="cv-btn cv-btn-secondary !h-7 text-xs" onClick={() => image(mode)}>{mode === 'image' ? '仅复制图片' : mode === 'path' ? '仅复制路径' : '复制图与路径'}</button>)}</div>}
      <p className="text-xs leading-relaxed text-[var(--ink-faint)]">长期保存是独立副本。临时历史按设置中的数量和时间清理；置顶及长期保存不自动删除。</p>
    </div>
    <div className="space-y-2 border-t border-[var(--line)] p-3">
      <button className="cv-btn cv-btn-primary !h-9 w-full" onClick={paste}><ClipboardPaste {...icon} />粘贴到前台应用<kbd className="cv-kbd">↵</kbd></button>
      <div className="grid grid-cols-4 gap-1">
        {([[copy, Copy, '复制'], [pin, item.isPinned ? PinOff : Pin, item.isPinned ? '取消置顶' : '置顶'], [save, Bookmark, '长期保存'], [resource, KeyRound, '存为资源']] as const).map(([action, Icon, label]) =>
          <button key={label} className="flex flex-col items-center gap-1 rounded-[9px] py-2 text-[11.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]" onClick={action}><Icon {...icon} />{label}</button>)}
      </div>
      <div className="flex gap-1">
        <Link className="cv-btn cv-btn-secondary !h-8 flex-1" to="/sessions" state={{ clipboardIds: [item.id], projectId: item.projectId }}><MessageSquarePlus {...icon} />在会话中使用</Link>
        <button className="cv-btn cv-btn-ghost !h-8 !px-2.5 hover:!text-[var(--destructive)]" aria-label="删除" title="删除" onClick={remove}><Trash2 {...icon} />删除</button>
      </div>
    </div>
  </aside>
}
