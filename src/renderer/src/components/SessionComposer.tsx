import { ArrowUp, AtSign, ClipboardList, ListChecks, Paperclip, ShieldCheck, X } from 'lucide-react'
import type { Mention, SessionPermission } from '@/types/session'
import type { ContextItem, TaskTemplate } from '@/types/workbench'

export const permissions: Array<{ value: SessionPermission; label: string; hint: string }> = [
  { value: 'confirm', label: '逐次确认', hint: '写入、联网和命令都先问你' },
  { value: 'readonly', label: '只读', hint: '只看不改' },
  { value: 'project_auto', label: '项目内自动', hint: '自动改项目文件，其余仍确认' }
]
const icon = { size: 15, strokeWidth: 1.75 }

export function Composer({ text, setText, input, busy, sending, mentions, setMentions, attachments, setAttachments, candidates, addMention, mentionKind, setMentionKind, templates, permission, onSend, onAttach, hero, extra, placeholder, onPasteImage }: {
  text: string; setText: React.Dispatch<React.SetStateAction<string>>; input: React.RefObject<HTMLTextAreaElement>; busy: boolean; sending: boolean
  mentions: Mention[]; setMentions: React.Dispatch<React.SetStateAction<Mention[]>>; attachments: ContextItem[]; setAttachments: React.Dispatch<React.SetStateAction<ContextItem[]>>
  candidates: Mention[]; addMention: (item: Mention) => void; mentionKind: Mention['kind']; setMentionKind: (kind: Mention['kind']) => void; templates: TaskTemplate[]; permission: SessionPermission
  onSend: () => void; onAttach: () => void
  /** 欢迎页里的大输入框：不贴底，左下角放项目与权限选择。 */
  hero?: boolean; extra?: React.ReactNode; placeholder?: string
  /** 粘贴或拖入图片（截图）时调用；未提供时按普通文本处理。 */
  onPasteImage?: (files: File[]) => void
}): JSX.Element {
  const mentioning = /@[^@\n]*$/.test(text), slash = text.startsWith('/')
  const skills = templates.filter(item => item.name.includes(text.slice(1)))
  const images = (list: DataTransferItemList | FileList | undefined | null): File[] => [...(list ?? [])].flatMap(item => item instanceof File ? (item.type.startsWith('image/') ? [item] : []) : item.kind === 'file' && item.type.startsWith('image/') ? [item.getAsFile()!].filter(Boolean) : [])
  return <div className={hero ? 'relative' : 'pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-b from-transparent via-[var(--surface)] via-40% to-[var(--surface)] px-8 pb-5 pt-10'}>
    <form onSubmit={event => { event.preventDefault(); onSend() }} data-busy={busy}
      onDragOver={event => { if (onPasteImage && images(event.dataTransfer.items).length) event.preventDefault() }}
      onDrop={event => { const files = images(event.dataTransfer.files); if (onPasteImage && files.length) { event.preventDefault(); onPasteImage(files) } }}
      className={`cv-composer pointer-events-auto relative mx-auto rounded-[16px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--border-strong),0_8px_28px_-10px_rgba(24,24,27,.22)] ${hero ? 'max-w-none' : 'max-w-[720px]'}`}>
      {(mentioning || (slash && skills.length > 0)) && <div className="cv-pop absolute bottom-[calc(100%+8px)] left-0 w-[420px] max-w-full rounded-[14px] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]">
        {mentioning ? <>
          <div role="tablist" aria-label="引用来源" className="flex gap-1 p-1">{(['clipboard', 'resource', 'file'] as const).map(kind => <button type="button" role="tab" aria-selected={mentionKind === kind} key={kind} onClick={() => setMentionKind(kind)} className={`h-7 rounded-[7px] px-2.5 text-xs transition-colors ${mentionKind === kind ? 'bg-[var(--active)] font-medium text-[var(--ink)]' : 'text-[var(--ink-soft)] hover:bg-[var(--hover)]'}`}>{kind === 'clipboard' ? '剪贴板' : kind === 'resource' ? '资源' : '项目文件'}</button>)}</div>
          <div className="max-h-56 overflow-y-auto" aria-label="引用候选">{candidates.map((item, index) => <button type="button" className={`flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13px] ${index === 0 ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--hover)]'}`} key={item.id} onClick={() => addMention(item)}><span className="min-w-0 flex-1 truncate font-mono">{item.label}</span>{index === 0 && <kbd className="cv-kbd">↵</kbd>}</button>)}
            {!candidates.length && <p className="px-2.5 py-3 text-xs text-[var(--ink-faint)]">暂无匹配资料</p>}</div>
        </> : <div aria-label="技能" className="max-h-56 overflow-y-auto">{skills.map(item => <button type="button" key={item.id} className="flex h-10 w-full items-center gap-2.5 rounded-[9px] px-2.5 text-left text-[13px] hover:bg-[var(--hover)]" onClick={() => setText(item.prompt + (item.acceptance ? '\n验收要求：' + item.acceptance : ''))}><ListChecks {...icon} size={14} />{item.name}</button>)}</div>}
      </div>}
      {(mentions.length > 0 || attachments.length > 0) && <div className="flex flex-wrap gap-1.5 px-3 pt-3">
        {mentions.map(item => <span key={`${item.kind}:${item.id}`} className="cv-pop inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--surface-2)] pl-2.5 pr-1 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)]">{item.kind === 'resource' ? <ShieldCheck {...icon} size={13} /> : <ClipboardList {...icon} size={13} />}{item.label}<button type="button" className="grid h-5 w-5 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" aria-label={`移除引用 ${item.label}`} onClick={() => setMentions(old => old.filter(value => value !== item))}><X size={12} /></button></span>)}
        {attachments.map(item => <span key={item.id} className="cv-pop inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--surface-2)] pl-2.5 pr-1 text-[12.5px] shadow-[inset_0_0_0_1px_var(--line)]"><Paperclip {...icon} size={13} />{item.title}<button type="button" className="grid h-5 w-5 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--hover)]" aria-label={`移除附件 ${item.title}`} onClick={() => setAttachments(old => old.filter(value => value.id !== item.id))}><X size={12} /></button></span>)}
      </div>}
      <label htmlFor="session-message" className="sr-only">消息</label>
      <textarea ref={input} id="session-message" rows={1} maxLength={100000} placeholder={busy ? '助手正在工作，完成后可以继续说…' : placeholder ?? '继续说，或输入 @ 引用剪贴板与资源，/ 使用技能'} value={text}
        className={`block max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] ${hero ? 'min-h-[84px]' : 'min-h-[52px]'}`}
        onChange={event => setText(event.target.value)}
        onPaste={event => { const files = images(event.clipboardData.items); if (onPasteImage && files.length) { event.preventDefault(); onPasteImage(files) } }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (mentioning && candidates[0]) addMention(candidates[0]); else if (!busy && !sending) onSend() } }} />
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <button type="button" className="cv-btn cv-btn-ghost !h-[30px] !px-2.5" onClick={() => { setText(value => value + (value && !value.endsWith(' ') ? ' @' : '@')); input.current?.focus() }}><AtSign {...icon} size={14} />引用</button>
        <button type="button" className="cv-btn cv-btn-ghost !h-[30px] !px-2.5" onClick={onAttach}><Paperclip {...icon} size={14} />附件</button>
        {extra}
        <span className="flex-1" />
        {!hero && <span className="mr-1 text-xs text-[var(--ink-faint)]">{permissions.find(item => item.value === permission)?.label}</span>}
        <button aria-label={sending ? '等待会话接收' : '发送'} title="发送 Enter" disabled={sending || busy || !text.trim()}
          className="grid h-8 w-8 place-items-center rounded-[9px] bg-[var(--primary)] text-[var(--primary-foreground)] transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] hover:scale-105 active:scale-95 disabled:hover:scale-100"><ArrowUp size={16} strokeWidth={2.2} /></button>
      </div>
    </form>
  </div>
}

