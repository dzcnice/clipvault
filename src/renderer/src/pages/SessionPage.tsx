import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Check, ChevronRight, FilePen, PanelRight, Plus, Square, X, Lightbulb, ShieldCheck, AlarmClock, ScanText } from 'lucide-react'
import type { HostSessionSummary, QuestionAnswer, SessionPermission, UiEvent, UiQuestion, Mention, SessionContext } from '@/types/session'
import type { WorkProject, ContextItem, TaskTemplate } from '@/types/workbench'
import { Composer } from '../components/SessionComposer'
import SessionWelcome, { QUICK_PROJECT_ID } from '../components/SessionWelcome'
import { unwrap } from '../hooks/useWorkbench'
import ResourceIntake from '../components/ResourceIntakeReview'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog'
import SessionContextPanel, { FileDifference } from '../components/SessionContextPanel'

const status: Record<HostSessionSummary['state'], string> = { idle: '就绪', starting: '正在启动', running: '进行中', waiting_user: '等你确认', stopping: '正在停止', stopped: '已停止', failed: '未完成', queued: '排队中' }
const ongoing = new Set(['starting', 'running', 'waiting_user', 'stopping', 'queued'])
const dot = (state?: HostSessionSummary['state']): string => !state ? 'cv-dot-idle' : state === 'failed' ? 'cv-dot-failed' : state === 'waiting_user' ? 'cv-dot-waiting' : ['running', 'starting', 'queued', 'stopping'].includes(state) ? 'cv-dot-running' : state === 'idle' ? 'cv-dot-done' : 'cv-dot-idle'
const icon = { size: 15, strokeWidth: 1.75 }
const remembered = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => { try { const value = localStorage.getItem(key) as T | null; return value && allowed.includes(value) ? value : fallback } catch { return fallback } }
type Incoming = { clipboardIds?: string[]; resourceId?: string; projectId?: string; text?: string; mentions?: Mention[]; attachments?: ContextItem[]; autoSend?: boolean }

export default function SessionPage(): JSX.Element {
  const { id } = useParams(), navigate = useNavigate(), location = useLocation()
  const incoming = useMemo(() => { const query = new URLSearchParams(location.search); return (location.state ?? (query.has('clipboard') ? { clipboardIds: [query.get('clipboard')!] } : query.has('resource') ? { resourceId: query.get('resource')! } : null)) as Incoming | null }, [location.state, location.search])
  const applied = useRef(''), autoSend = useRef(''), feed = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null)
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  const [context, setContext] = useState<SessionContext>(), [titleEdit, setTitleEdit] = useState<string>(), [showContext, setShowContext] = useState(false)
  const [recent, setRecent] = useState<Mention[]>([]), [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [sessions, setSessions] = useState<HostSessionSummary[]>([]), [events, setEvents] = useState<UiEvent[]>([])
  const [projects, setProjects] = useState<WorkProject[]>([]), [projectId, setProjectId] = useState(() => { try { return localStorage.getItem('cv.session.project') || QUICK_PROJECT_ID } catch { return QUICK_PROJECT_ID } })
  const [permission, setPermission] = useState<SessionPermission>(() => remembered<SessionPermission>('cv.session.permission', ['confirm', 'readonly', 'project_auto'], 'confirm'))
  const [text, setText] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [sending, setSending] = useState(false)
  const [intake, setIntake] = useState(false), [mentions, setMentions] = useState<Mention[]>([]), [candidates, setCandidates] = useState<Mention[]>([]), [mentionKind, setMentionKind] = useState<Mention['kind']>('clipboard')
  const [attachments, setAttachments] = useState<ContextItem[]>([])
  const [possibleSecret, setPossibleSecret] = useState(false)
  const current = sessions.find(item => item.id === id)
  const busy = !!current && ongoing.has(current.state)
  const refresh = useCallback(async () => {
    const next = await window.sessionAPI.list(); setSessions(next)
    if (id) { setEvents(await window.sessionAPI.events({ sessionId: id, afterSeq: -1 })); if (window.sessionAPI.context) setContext(await window.sessionAPI.context(id)) } else { setEvents([]); setContext(undefined) }
    setLoading(false)
  }, [id])
  useEffect(() => {
    let alive = true
    const update = (): void => { if (alive) void refresh().catch(error => { if (alive) { setError(error.message); setLoading(false) } }) }
    update()
    const off = window.sessionAPI.onChanged(update)
    const timer = window.setInterval(update, 1500)
    return () => { alive = false; off(); window.clearInterval(timer) }
  }, [refresh])
  useEffect(() => {
    const load = (): void => { void window.api.workbench.quickIndex().then(result => { if (result.success && result.data) setProjects(result.data.projects) }).catch(() => setError('项目列表暂时不可用')) }
    load(); const off = window.api.workbench.onChanged?.(load)
    return () => { off?.() }
  }, [])
  useEffect(() => {
    void window.sessionAPI.mentionCandidates?.({ kind: 'clipboard', query: '' }).then(items => setRecent(items.slice(0, 3))).catch(() => {})
    void window.api.workbench.templates?.().then(result => { if (result.success && result.data) setTemplates(result.data) }).catch(() => {})
    void window.api.workbench.modelService?.().then(result => setModelReady(result.success ? !!result.data?.configured : null)).catch(() => {})
  }, [])
  useEffect(() => {
    if (applied.current === location.key) return
    applied.current = location.key; setError(''); setTitleEdit(undefined); setAttachments(incoming?.attachments ?? [])
    setText(incoming?.text || (incoming?.clipboardIds?.length ? '请处理这些剪贴板资料' : incoming?.resourceId ? '请使用这份资源帮我处理工作' : ''))
    setMentions(incoming?.mentions ?? [...(incoming?.clipboardIds ?? []).map(value => ({ kind: 'clipboard' as const, id: value, label: '剪贴板资料' })), ...(incoming?.resourceId ? [{ kind: 'resource' as const, id: incoming.resourceId, label: '资源引用' }] : [])])
    if (incoming?.projectId) setProjectId(incoming.projectId)
    autoSend.current = id && incoming?.autoSend ? location.key : ''
    if (id && !incoming?.autoSend) void window.sessionAPI.prewarm(id).catch(() => {})
  }, [id, location.key, incoming])
  useEffect(() => {
    const query = text.match(/@([^@\n]*)$/)?.[1]
    let alive = true
    if (query === undefined) { setCandidates([]); return }
    const timer = window.setTimeout(() => { void window.sessionAPI.mentionCandidates({ sessionId: id, kind: mentionKind, query }).then(items => { if (alive) setCandidates(items) }).catch(() => { if (alive) setCandidates([]) }) }, 150)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [id, mentionKind, text])
  useEffect(() => { const box = feed.current; if (!box || box.scrollHeight - box.scrollTop - box.clientHeight >= 240) return; if (box.scrollTo) box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); else box.scrollTop = box.scrollHeight }, [events.length])
  useEffect(() => { const box = input.current; if (box) { box.style.height = 'auto'; box.style.height = Math.min(200, box.scrollHeight) + 'px' } }, [text])

  /** 粘贴或拖入的截图：存为剪贴板图片（重复图片合并），作为图片引用带进这条消息。 */
  const pasteImages = (files: File[]): void => void act(async () => {
    for (const file of files.slice(0, 4)) {
      if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20 MB，请先压缩')
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file) })
      const item = await unwrap(window.api.clipboard.savePastedImage(dataUrl))
      setMentions(old => old.some(value => value.id === item.id) ? old : [...old, { kind: 'clipboard', id: item.id, label: '截图 / 图片' }])
    }
    setText(value => value || '这张图里有什么？'); input.current?.focus()
  })
  /** 截图问 AI：调起系统框选截图，截到后作为图片引用放进输入框。 */
  const capture = (): void => void act(async () => {
    const id = await unwrap(window.api.clipboard.capture())
    if (!id) return
    setMentions(old => old.some(value => value.id === id) ? old : [...old, { kind: 'clipboard', id, label: '截图 / 图片' }])
    setText(value => value || '这张截图里有什么？'); input.current?.focus()
  })
  const addMention = (item: Mention): void => { setMentions(old => old.some(value => value.kind === item.kind && value.id === item.id) ? old : [...old, item]); setText(value => value.replace(/@[^@\n]*$/, '')); setCandidates([]) }
  const act = async (action: () => Promise<unknown>): Promise<void> => { setError(''); try { await action(); await refresh() } catch (error) { setError(error instanceof Error ? error.message : '操作失败') } }
  /** 欢迎页回车：建会话并直接发出第一句；项目与权限记住到下次。 */
  async function create(): Promise<void> {
    if (!text.trim() || sending) return
    const chosen = projects.some(item => item.id === projectId) ? projectId : projects[0]?.id ?? QUICK_PROJECT_ID
    try { localStorage.setItem('cv.session.project', chosen); localStorage.setItem('cv.session.permission', permission) } catch { /* 隐私模式下不记忆 */ }
    setSending(true)
    try {
      const session = await window.sessionAPI.create({ projectId: chosen, permission })
      navigate(`/sessions/${session.id}`, { state: { text, mentions, attachments, autoSend: true } satisfies Incoming })
    } finally { setSending(false) }
  }
  async function send(allowPossibleSecret = false): Promise<void> {
    if (!id || !text.trim() || sending) return
    setSending(true)
    try { await window.sessionAPI.prompt({ sessionId: id, text, ...(allowPossibleSecret ? { allowPossibleSecret: true } : {}), ...(mentions.length ? { mentions } : {}), ...(attachments.length ? { attachmentIds: attachments.map(item => item.id) } : {}) }); setText(''); setMentions([]); setAttachments([]); setPossibleSecret(false) }
    catch (error) { if (error instanceof Error && error.message.startsWith('POSSIBLE_SECRET')) { setPossibleSecret(true); return } if (error instanceof Error && /检测到账号或密钥/.test(error.message)) setIntake(true); throw error }
    finally { setSending(false) }
  }
  // 欢迎页带来的第一句：进入会话后自动发出（审批卡片会出现在会话里）。
  useEffect(() => {
    if (!id || !autoSend.current || autoSend.current !== location.key || !text.trim() || sending) return
    autoSend.current = ''
    void act(send)
  })
  const visible = events.filter((event, index) => {
    if (event.type === 'question') return !events.slice(index + 1).some(later => later.type === 'question' && later.question.id === event.question.id)
    if (event.type === 'approval') return !events.slice(index + 1).some(later => later.type === 'approval' && later.approval.id === event.approval.id)
    if (event.type === 'proposal') return !events.slice(index + 1).some(later => later.type === 'proposal' && later.id === event.id)
    return true
  })
  const last = visible.at(-1)
  const thinking = busy && current?.state !== 'waiting_user' && !(last && ['approval', 'question'].includes(last.type))
  const projectName = projects.find(p => p.id === current?.projectId)?.name

  return <div className="relative flex h-full min-h-0 min-w-0 flex-col">
    <Dialog open={possibleSecret} onOpenChange={setPossibleSecret}><DialogContent><DialogTitle>这段像是密码，要先存为资源吗？</DialogTitle><DialogDescription>如果这是示例代码或你确认可以发送，可按原样继续。本次选择只适用于当前消息。</DialogDescription><div className="flex gap-2"><button className="cv-btn cv-btn-secondary" onClick={() => { setPossibleSecret(false); setIntake(true) }}>存为资源</button><button className="cv-btn cv-btn-primary" onClick={() => { setPossibleSecret(false); void act(() => send(true)) }}>按原样发送</button></div></DialogContent></Dialog>
    <Dialog open={intake} onOpenChange={setIntake}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogTitle>检测到账号或密钥，消息尚未发送</DialogTitle><DialogDescription>先存为资源，再用资源引用继续。也可以关闭后删掉秘密再发送。</DialogDescription><ResourceIntake source={{ text }} sendAfter onCancel={() => setIntake(false)} onSaved={resource => { setIntake(false); setText(`请使用 @资源:${resource.id} ${resource.purpose || '管理这份资料，方便下次取用'}`); setMentions([{ kind: 'resource', id: resource.id, label: resource.name }]); void act(async () => { await window.sessionAPI.prompt({ sessionId: id!, text: `请使用 @资源:${resource.id} ${resource.purpose || '管理这份资料，方便下次取用'}`, mentions: [{ kind: 'resource', id: resource.id }] }); setText(''); setMentions([]) }) }} /></DialogContent></Dialog>

    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] pl-6 pr-3">
      {titleEdit !== undefined && current
        ? <form className="flex items-center gap-2" onSubmit={event => { event.preventDefault(); void act(async () => { await window.sessionAPI.rename({ sessionId: current.id, title: titleEdit }); setTitleEdit(undefined) }) }}><input aria-label="会话标题" className="cv-input !h-8 w-72" autoFocus maxLength={120} value={titleEdit} onChange={event => setTitleEdit(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setTitleEdit(undefined) }} /><button className="cv-btn cv-btn-secondary !h-8">保存标题</button></form>
        : <h1 className="min-w-0 truncate text-[14px] font-medium tracking-[-.01em]">{current ? <button title="修改标题" className="max-w-[420px] truncate rounded-md px-1 py-0.5 hover:bg-[var(--hover)]" onClick={() => setTitleEdit(current.title)}>{current.title}</button> : '新会话'}</h1>}
      {current && <>
        <span className="truncate text-[13px] text-[var(--ink-faint)]">{projectName ?? '项目'}</span>
        <span className="flex h-6 shrink-0 items-center gap-1.5 rounded-[7px] bg-[var(--surface-2)] px-2 text-xs text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--line)]"><span className={`cv-dot ${dot(current.state)}`} style={{ width: 6, height: 6 }} />{status[current.state]}</span>
        {current.planMode && <span className="cv-badge cv-badge-accent">计划模式 · 只读</span>}
        {!!context?.schedules?.some(item => item.status === 'active') && <button className="cv-badge cv-badge-accent" title="查看定时提醒" onClick={() => setShowContext(true)}><AlarmClock size={12} strokeWidth={1.75} />{context.schedules.filter(item => item.status === 'active').length} 个提醒</button>}
      </>}
      <span className="flex-1" />
      {current && <button className="cv-btn cv-btn-ghost" aria-pressed={current.planMode ?? false} disabled={ongoing.has(current.state)} onClick={() => void act(() => window.sessionAPI.setPlanMode({ sessionId: current.id, active: !current.planMode }))}><Lightbulb {...icon} />{current.planMode ? '退出计划模式' : '计划模式'}</button>}
      {current && ongoing.has(current.state) && <button className="cv-btn cv-btn-ghost" onClick={() => void act(() => window.sessionAPI.stop(current.id))}><Square {...icon} size={13} />停止</button>}
      {id && <button className={`cv-btn cv-btn-ghost !px-2 ${showContext ? '!bg-[var(--active)] !text-[var(--ink)]' : ''}`} aria-expanded={showContext} aria-label={showContext ? '收起上下文' : '展开上下文'} title="本会话上下文" onClick={() => setShowContext(!showContext)}><PanelRight {...icon} /></button>}
      <button className="cv-btn cv-btn-ghost !px-2" aria-label="新会话" title="新会话 Ctrl N" onClick={() => navigate('/sessions')}><Plus {...icon} /></button>
    </header>

    {error && <div role="alert" className="mx-auto mt-3 flex w-full max-w-[720px] items-center gap-3 rounded-[10px] bg-[var(--bad-soft)] px-4 py-2.5 text-[13px] text-[var(--destructive)] cv-pop">{error}<button className="ml-auto font-medium underline-offset-2 hover:underline" onClick={() => void act(refresh)}>重试</button></div>}

    <div className="flex min-h-0 flex-1">
      {!id ? <SessionWelcome {...{ loading, projects, projectId, setProjectId, permission, setPermission, recent, mentions, setMentions, addMention, text, setText, input, attachments, setAttachments, candidates, mentionKind, setMentionKind, templates, sending, modelReady }}
        onSend={() => void act(create)} onAttach={() => void act(async () => setAttachments(await unwrap(window.api.workbench.chooseAttachments())))} onPasteImage={pasteImages} onCapture={capture} /> :
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={feed} className="min-h-0 flex-1 overflow-y-auto" aria-label="会话消息" aria-live="polite">
            <div className="mx-auto max-w-[720px] px-8 pb-56 pt-9">
              {!visible.length && !loading && <div className="cv-rise py-16 text-center"><p className="text-[15px] text-[var(--ink)]">告诉我你想处理什么</p><p className="mt-1.5 text-[13px] text-[var(--ink-faint)]">输入 @ 引用剪贴板或资源；消息里含账号或密钥时，会在发送前拦下。</p></div>}
              {visible.map((event, index) => <div key={event.seq} className="cv-rise" style={{ '--i': Math.min(index, 8) } as React.CSSProperties}><EventView event={event} current={current} act={act} live={busy && event === last} /></div>)}
              {thinking && <p className="cv-rise mt-2 flex items-center gap-2.5 text-[13px]"><span className="cv-dot cv-dot-running" /><span className="cv-shimmer">{current?.state === 'starting' ? '正在启动会话…' : current?.state === 'queued' ? '排队中，同目录的会话完成后开始…' : '正在处理…'}</span></p>}
            </div>
          </div>
          <Composer {...{ text, setText, input, busy, sending, mentions, setMentions, attachments, setAttachments, candidates, addMention, mentionKind, setMentionKind, templates, permission: current?.permission ?? 'confirm' }}
            onSend={() => void act(send)} onAttach={() => void act(async () => setAttachments(await unwrap(window.api.workbench.chooseAttachments())))} onPasteImage={pasteImages}
            extra={<button type="button" className="cv-btn cv-btn-ghost !h-[30px] !px-2.5" title="截图问 AI（Alt+Shift+S）" onClick={capture}><ScanText size={14} strokeWidth={1.75} />截图</button>} />
        </section>}
      {id && showContext && <SessionContextPanel context={context} onClose={() => setShowContext(false)} onDeleteSchedule={scheduleId => void act(() => window.sessionAPI.deleteSchedule({ sessionId: id, id: scheduleId }))} />}
    </div>
  </div>
}

function EventView({ event, current, act, live }: { event: UiEvent; current?: HostSessionSummary; act: (action: () => Promise<unknown>) => Promise<void>; live: boolean }): JSX.Element {
  if (event.type === 'proposal') return <section className="my-4 rounded-[14px] bg-[var(--surface-2)] p-4 shadow-[inset_0_0_0_1px_var(--line)]"><h3 className="flex items-center gap-2 text-[13.5px] font-medium"><ShieldCheck {...icon} />资源更新建议 · {event.name}</h3><pre className="my-3 whitespace-pre-wrap break-words rounded-[10px] bg-[var(--surface)] p-3 font-mono text-xs shadow-[inset_0_0_0_1px_var(--line)]">{JSON.stringify(event.patch, null, 2)}</pre>{event.state === 'pending' && current ? <div className="flex gap-2">{[false, true].map(allowed => <button key={String(allowed)} className={`cv-btn ${allowed ? 'cv-btn-primary' : 'cv-btn-ghost'}`} onClick={() => void act(() => window.sessionAPI.respondProposal({ sessionId: current.id, id: event.id, allowed }))}>{allowed ? '确认更新' : '忽略'}</button>)}</div> : <p className="text-xs text-[var(--ink-faint)]">{event.state === 'applied' ? '已更新' : '已忽略'}</p>}</section>
  if (event.type === 'question') return <QuestionCard question={event.question} act={act} />
  if (event.type === 'approval') return <ApprovalCard event={event} active={!!current && ongoing.has(current.state)} act={act} />
  if (event.type === 'process') return <details className="group my-3 rounded-[12px] shadow-[inset_0_0_0_1px_var(--line)] [&_summary::-webkit-details-marker]:hidden">
    <summary className="flex h-10 cursor-pointer list-none items-center gap-2.5 px-3.5 text-[13px] text-[var(--ink-soft)]"><ChevronRight {...icon} size={14} className="transition-transform duration-300 group-open:rotate-90" /><span className={live ? 'cv-shimmer' : ''}>{event.summary}</span></summary>
    <ol className="space-y-1.5 px-3.5 pb-3 pl-10 text-[13px] text-[var(--ink-soft)]">{event.items.map((item, index) => <li key={index} className="flex gap-2.5"><span className="font-mono text-[var(--ink)]">{item.tool}</span><span>{item.state}</span></li>)}</ol>
  </details>
  if (event.type === 'verification') {
    const failed = /failed|失败|未通过|error/i.test(event.text), passed = !failed && /passed|通过|退出码.?0|success/i.test(event.text)
    return <p className="my-3 flex items-start gap-2.5 whitespace-pre-wrap break-words text-[13px]" style={{ color: failed ? 'var(--state-failed)' : passed ? 'var(--state-done)' : 'var(--text-2)' }}>
      <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full" style={{ background: failed ? 'var(--state-failed)' : passed ? 'var(--state-done)' : 'var(--active)' }}>{failed ? <X size={11} strokeWidth={2.6} color="#fff" /> : <svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke={passed ? '#fff' : 'currentColor'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path className="cv-check" d="M2.5 6.2 5 8.5l4.5-5" /></svg>}</span>{event.text}</p>
  }
  if (event.type === 'status') return <p className="my-3 text-center text-xs text-[var(--ink-faint)]">{event.text || status[event.state]}</p>
  if (event.type === 'user_message') return <div className="mb-7 mt-2 flex justify-end"><div className="max-w-[82%] whitespace-pre-wrap break-words rounded-[16px_16px_4px_16px] bg-[var(--surface-2)] px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[inset_0_0_0_1px_var(--line)]"><span className="sr-only">你</span>{event.text}</div></div>
  return <div className="mb-5"><div className="mb-2 flex items-center gap-2 text-[13px] text-[var(--ink-faint)]"><span aria-hidden className="grid h-5 w-5 place-items-center rounded-[6px] bg-[var(--primary)] after:h-1.5 after:w-1.5 after:rounded-[2px] after:bg-[var(--background)]" />{event.type === 'assistant_message' ? '助手' : '执行记录'}</div><div className="whitespace-pre-wrap break-words text-[15px] leading-[1.75] tracking-[-.003em]">{event.text}</div></div>
}

function Countdown({ expiresAt }: { expiresAt: number }): JSX.Element {
  const [now, setNow] = useState(Date.now)
  const [total] = useState(() => Math.max(1, expiresAt - Date.now()))
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const left = Math.max(0, expiresAt - now), ratio = left / total, seconds = Math.ceil(left / 1000)
  return <span className="flex items-center gap-2 font-mono text-xs text-[var(--ink-faint)]" title="这次确认的剩余有效时间">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden><circle cx="11" cy="11" r="9" fill="none" stroke="var(--border-strong)" strokeWidth="2.2" /><circle cx="11" cy="11" r="9" fill="none" stroke="var(--state-waiting)" strokeWidth="2.2" strokeLinecap="round" strokeDasharray="56.5" strokeDashoffset={56.5 * (1 - ratio)} transform="rotate(-90 11 11)" style={{ transition: 'stroke-dashoffset 1s linear' }} /></svg></span>
}

function ApprovalCard({ event, active, act }: { event: Extract<UiEvent, { type: 'approval' }>; active: boolean; act: (action: () => Promise<unknown>) => Promise<void> }): JSX.Element {
  const [answered, setAnswered] = useState<boolean | null>(null), approval = event.approval
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const expired = approval.expiresAt <= now
  const settled = approval.state !== undefined && approval.state !== 'pending'
  const open = answered === null && !expired && !settled && active
  const answer = (allowed: boolean): void => { void act(async () => { await window.sessionAPI.respondApproval({ id: approval.id, fingerprint: approval.fingerprint, allowed }); setAnswered(allowed) }) }
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent): void => { if (document.querySelector('[role="dialog"]')) return; if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); answer(true) } }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  })
  if (!open) {
    const allowed = approval.state === 'allowed' || answered === true
    return <details className="group my-4 overflow-hidden rounded-[12px] text-[13px] text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--line)] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-2.5 px-3.5">
        {allowed ? <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--state-done)]"><svg viewBox="0 0 12 12" width="11" height="11" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path className="cv-check" d="M2.5 6.2 5 8.5l4.5-5" /></svg></span> : <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[var(--active)]"><X size={11} strokeWidth={2.4} /></span>}
        <span className="shrink-0">{allowed ? '已允许' : approval.state === 'rejected' || answered === false ? '已拒绝' : expired ? '已过期' : '本次确认已结束'} · {approval.operation}</span><span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--ink-faint)]">{approval.target}</span>
        <ChevronRight {...icon} size={14} className="shrink-0 text-[var(--ink-faint)] transition-transform duration-300 group-open:rotate-90" />
      </summary>
      <div className="border-t border-[var(--line)] bg-[var(--surface-2)]">{approval.difference ? <FileDifference before={approval.difference.before} after={approval.difference.after} /> : <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12.5px] leading-relaxed">{approval.description}</pre>}</div>
    </details>
  }
  return <section className="cv-pop my-4 overflow-hidden rounded-[14px] bg-[var(--surface)] shadow-[var(--shadow-lg)]" aria-label="需要确认">
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[var(--warn-soft)] text-[var(--state-waiting)]"><FilePen {...icon} size={14} /></span>
      <div className="min-w-0"><h3 className="text-[13.5px] font-medium">需要确认 · {approval.operation}</h3><p className="truncate font-mono text-xs text-[var(--ink-soft)]">{approval.target}</p></div>
      <span className="flex-1" /><Countdown expiresAt={approval.expiresAt} />
    </div>
    <div className="border-y border-[var(--line)] bg-[var(--surface-2)]">{approval.difference ? <FileDifference before={approval.difference.before} after={approval.difference.after} /> : <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12.5px] leading-relaxed">{approval.description}</pre>}</div>
    <div className="flex items-center gap-2 px-4 py-2.5"><span className="flex-1 text-xs text-[var(--ink-faint)]">只批准这一次</span>
      <button className="cv-btn cv-btn-ghost" aria-label="拒绝" onClick={() => answer(false)}>拒绝</button>
      <button className="cv-btn cv-btn-primary" aria-label="允许" title="允许 Ctrl+Enter" onClick={() => answer(true)}><Check size={14} strokeWidth={2.2} />允许<kbd className="cv-kbd">Ctrl ↵</kbd></button></div>
  </section>
}

function QuestionCard({ question, act }: { question: UiQuestion; act: (action: () => Promise<unknown>) => Promise<void> }): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  return <section className="cv-pop my-4 space-y-4 rounded-[14px] bg-[var(--surface-2)] p-4 shadow-[inset_0_0_0_1px_var(--line)]" aria-label="助手追问">
    {question.questions.map(item => <div key={item.id}>
      <label className="block text-[14px] font-medium" htmlFor={`question-${question.id}-${item.id}`}>{item.detail ? '审阅计划：是否批准并退出计划模式？' : item.question}</label>
      {item.detail && <pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-[var(--surface)] p-3 font-mono text-xs leading-relaxed shadow-[inset_0_0_0_1px_var(--line)]">{item.detail}</pre>}
      {question.state === 'open' ? <>
        <div className="my-3 flex flex-wrap gap-2">{item.options?.map(option => {
          const on = selected[item.id]?.includes(option.label) ?? false
          return <button key={option.label} aria-pressed={on} onClick={() => setSelected(old => ({ ...old, [item.id]: item.multiSelect ? old[item.id]?.includes(option.label) ? old[item.id]!.filter(value => value !== option.label) : [...old[item.id] ?? [], option.label] : [option.label] }))}
            className={`h-[34px] rounded-[9px] px-3.5 text-[13px] transition-all duration-200 hover:-translate-y-px ${on ? 'bg-[var(--primary-soft)] shadow-[0_0_0_1.5px_var(--blue)]' : 'bg-[var(--surface)] shadow-[0_0_0_1px_var(--border-strong)]'}`}>{item.detail && option.label === 'Approve' ? '批准计划' : item.detail && option.label === 'Keep planning' ? '继续讨论' : option.label}</button>
        })}</div>
        <input className="cv-input" id={`question-${question.id}-${item.id}`} value={values[item.id] ?? ''} onChange={event => setValues(old => ({ ...old, [item.id]: event.target.value }))} placeholder="选择选项，或直接写下你的回答" />
      </> : <p className="mt-2 text-[13px] text-[var(--ink-faint)]">{question.state === 'answered' ? `已回答：${question.answer?.answers.find(a => a.id === item.id)?.selected.join('、') || question.answer?.answers.find(a => a.id === item.id)?.custom || '跳过'}` : '已取消'}</p>}
    </div>)}
    {question.state === 'open' && <button className="cv-btn cv-btn-primary" onClick={() => void act(() => {
      const answer: QuestionAnswer = { answers: question.questions.map(item => ({ id: item.id, selected: selected[item.id] ?? [], custom: values[item.id] ?? '' })) }
      return window.sessionAPI.answerQuestion({ id: question.id, answer })
    })}>回答并继续</button>}
  </section>
}
