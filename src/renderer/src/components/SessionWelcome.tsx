import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ClipboardList, FolderGit2, Globe, Languages, ScanText, Settings2, ShieldCheck, Sparkles, Wand2, type LucideIcon } from 'lucide-react'
import type { Mention, SessionPermission } from '@/types/session'
import type { ContextItem, TaskTemplate, WorkProject } from '@/types/workbench'
import { Composer, permissions } from './SessionComposer'

const icon = { size: 14, strokeWidth: 1.75 }
export const QUICK_PROJECT_ID = 'quick-ask'

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
}

/** 小号下拉：点开后列出选项，Esc 或点外面收起。 */
function Picker<T extends string>({ label, value, options, onChange, footer, icon: Icon }: {
  label: string; value: T; options: Array<{ value: T; label: string; hint?: string; badge?: React.ReactNode }>; onChange: (value: T) => void; footer?: React.ReactNode; icon: LucideIcon
}): JSX.Element {
  const [open, setOpen] = useState(false), box = useRef<HTMLDivElement>(null)
  const current = options.find(item => item.value === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent): void => { if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close); window.addEventListener('keydown', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close) }
  }, [open])
  return <div ref={box} className="relative">
    <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
      className="flex h-[30px] max-w-[180px] items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]">
      <Icon {...icon} size={13} /><span className="truncate">{current?.label}</span><ChevronDown size={12} strokeWidth={2} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div role="listbox" aria-label={label} className="cv-pop absolute left-0 top-[calc(100%+6px)] z-30 w-[260px] rounded-[12px] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]">
      {options.map(item => <button type="button" role="option" aria-selected={item.value === value} key={item.value} onClick={() => { onChange(item.value); setOpen(false) }}
        className={`flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left transition-colors ${item.value === value ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--hover)]'}`}>
        <span className="mt-0.5 w-3.5 shrink-0">{item.value === value && <Check size={13} strokeWidth={2.2} className="text-[var(--blue)]" />}</span>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[13px] text-[var(--ink)]"><span className="truncate">{item.label}</span>{item.badge}</span>{item.hint && <span className="mt-0.5 block text-xs leading-snug text-[var(--ink-faint)]">{item.hint}</span>}</span>
      </button>)}
      {footer && <div className="mt-1 border-t border-[var(--line)] pt-1">{footer}</div>}
    </div>}
  </div>
}

export default function SessionWelcome({ loading, projects, projectId, setProjectId, permission, setPermission, recent, mentions, setMentions, addMention, text, setText, input, attachments, setAttachments, candidates, mentionKind, setMentionKind, templates, sending, modelReady, onSend, onAttach, onPasteImage, onCapture }: {
  loading: boolean; projects: WorkProject[]; projectId: string; setProjectId: (value: string) => void; permission: SessionPermission; setPermission: (value: SessionPermission) => void
  recent: Mention[]; mentions: Mention[]; setMentions: React.Dispatch<React.SetStateAction<Mention[]>>; addMention: (item: Mention) => void
  text: string; setText: React.Dispatch<React.SetStateAction<string>>; input: React.RefObject<HTMLTextAreaElement>
  attachments: ContextItem[]; setAttachments: React.Dispatch<React.SetStateAction<ContextItem[]>>; candidates: Mention[]; mentionKind: Mention['kind']; setMentionKind: (kind: Mention['kind']) => void
  templates: TaskTemplate[]; sending: boolean; modelReady: boolean | null
  onSend: () => void; onAttach: () => void; onPasteImage?: (files: File[]) => void; onCapture?: () => void
}): JSX.Element {
  const selected = projects.find(item => item.id === projectId) ?? projects.find(item => item.id === QUICK_PROJECT_ID) ?? projects[0]
  const quick = selected?.builtin === 'quick'
  const use = (item: Mention, prompt: string): void => { addMention(item); setText(prompt); input.current?.focus() }
  const latest = recent[0]
  useEffect(() => { input.current?.focus() }, [input])
  return <section className="min-w-0 flex-1 overflow-y-auto">
    <div className="mx-auto flex min-h-full max-w-[680px] flex-col px-8 pb-16 pt-[14vh]">
      {loading && <p role="status" className="cv-shimmer mb-4 text-[13px]">正在读取会话…</p>}
      <h2 className="cv-rise flex items-center gap-3 text-[28px] font-semibold tracking-[-.03em]"><span className="cv-jarvis-orb" aria-hidden />{greeting()}，想做点什么？</h2>
      <p className="cv-rise mt-2 text-[14px] text-[var(--ink-faint)]" style={{ '--i': 1 } as React.CSSProperties}>
        {quick ? '直接问就行：可以联网查资料，@ 引用剪贴板和资源，粘贴截图让它看图。' : `在「${selected?.name ?? '项目'}」里工作：能读写项目代码，每个动作都会先问你。`}
      </p>
      {modelReady === false && <Link to="/resources" className="cv-rise mt-5 flex items-center gap-2.5 rounded-[12px] bg-[var(--warn-soft)] px-3.5 py-2.5 text-[13px] text-[var(--ink)]" style={{ '--i': 2 } as React.CSSProperties}><Settings2 {...icon} />还没有配置模型服务，先去资源库填写地址和密钥 →</Link>}
      <div className="cv-rise mt-7" style={{ '--i': 2 } as React.CSSProperties}>
        <Composer hero {...{ text, setText, input, busy: false, sending, mentions, setMentions, attachments, setAttachments, candidates, addMention, mentionKind, setMentionKind, templates, permission, onSend, onAttach, onPasteImage }}
          placeholder={quick ? '问点什么，或粘贴一张截图…' : '描述你要在这个项目里做的事…'}
          extra={<>
            <span className="mx-1 h-4 w-px bg-[var(--line)]" aria-hidden />
            <Picker label="项目" icon={quick ? Sparkles : FolderGit2} value={selected?.id ?? QUICK_PROJECT_ID} onChange={setProjectId}
              options={projects.map(item => ({ value: item.id, label: item.name, hint: item.builtin === 'quick' ? '不关联代码，可联网' : item.directory, badge: item.builtin === 'quick' || item.web ? <Globe size={11} strokeWidth={2} className="text-[var(--ink-faint)]" /> : undefined }))}
              footer={<Link to="/more/projects" className="flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--hover)]"><FolderGit2 {...icon} size={13} />添加或管理代码项目</Link>} />
            <Picker label="权限" icon={ShieldCheck} value={permission} onChange={setPermission} options={permissions.map(item => ({ value: item.value, label: item.label, hint: item.hint }))} />
          </>} />
      </div>
      <div className="cv-rise mt-4 flex flex-wrap gap-2" style={{ '--i': 3 } as React.CSSProperties} aria-label="快捷开始">
        {onCapture && <button type="button" className="cv-chip" onClick={onCapture}><ScanText {...icon} />截图问 AI<kbd className="cv-kbd">Alt Shift S</kbd></button>}
        {latest && <button type="button" className="cv-chip" onClick={() => use(latest, '解释一下这段内容，给出要点')}><Wand2 {...icon} />解释最近复制</button>}
        {latest && <button type="button" className="cv-chip" onClick={() => use(latest, '把这段内容翻译成中文（若已是中文则译成英文），保持格式')}><Languages {...icon} />翻译最近复制</button>}
      </div>
      <section className="cv-rise mt-12" style={{ '--i': 4 } as React.CSSProperties}>
        <h3 className="mb-3 flex items-center gap-2 text-xs text-[var(--ink-faint)]"><ClipboardList {...icon} size={13} />最近复制</h3>
        {recent.length ? <div className="grid gap-2">{recent.map(item => <button key={item.id} onClick={() => use(item, '请分析这段资料，给我可执行的处理建议')}
          className="group flex items-center gap-3 rounded-[12px] px-3.5 py-3 text-left shadow-[inset_0_0_0_1px_var(--line)] transition-all duration-200 hover:-translate-y-px hover:bg-[var(--surface-2)]">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{item.label || '剪贴板资料'}</span>
          <span className="text-xs text-[var(--ink-faint)] opacity-0 transition-opacity group-hover:opacity-100">引用到输入框</span></button>)}</div>
          : <p className="text-[13px] text-[var(--ink-faint)]">复制内容后，这里会出现最近资料。复制、搜索和粘贴始终在本机可用。</p>}
      </section>
    </div>
  </section>
}
