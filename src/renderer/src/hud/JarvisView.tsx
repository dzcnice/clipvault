import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUp, Check, ClipboardCopy, ClipboardList, ClipboardPaste, ExternalLink, Globe, KeyRound, ScanText, X } from 'lucide-react'
import type { HostSessionSummary, Mention, UiEvent } from '@/types/session'
import { ClipThumb } from '../components/ClipboardList'

/** 浮窗沿用同一个随手问会话：两小时内的追问接着聊，审批也只在新会话第一次出现。 */
const SESSION_KEY = 'cv.jarvis.session', REUSE_MS = 2 * 3600_000
const ongoing = new Set(['starting', 'running', 'waiting_user', 'stopping', 'queued'])
const icon = { size: 14, strokeWidth: 1.8 }
/** 本地斜杠命令：只是常用说法的模板，不绕过任何确认。 */
export const SLASH: Array<{ cmd: string; hint: string; prompt?: string }> = [
  { cmd: '/翻译', hint: '翻译最近复制（中英互译）', prompt: '把引用的内容翻译成中文；如果原文已经是中文，就翻译成英文。只输出译文，保留原有格式。' },
  { cmd: '/总结', hint: '总结最近复制的要点', prompt: '用中文总结引用内容的要点，3–6 条，先给一句话结论。' },
  { cmd: '/解释', hint: '解释最近复制（报错、代码、术语）', prompt: '解释引用的内容：是什么、为什么会这样、我该怎么做。报错请给出最可能的原因和修复步骤。' },
  { cmd: '/改写', hint: '把最近复制改写得更清楚', prompt: '把引用的内容改写得更清楚、简洁、得体，保持原意，只输出改写结果。' },
  { cmd: '/截图', hint: '框选屏幕截图并提问' }
]

export interface JarvisInput { text?: string; mentions?: Mention[]; autoSend?: boolean }

export default function JarvisView({ initial, onExit }: { initial: JarvisInput; onExit: () => void }): JSX.Element {
  const [text, setText] = useState(initial.text ?? ''), [mentions, setMentions] = useState<Mention[]>(initial.mentions ?? [])
  const [sessionId, setSessionId] = useState<string>(), [boundary, setBoundary] = useState(-1)
  const [events, setEvents] = useState<UiEvent[]>([]), [session, setSession] = useState<HostSessionSummary>()
  const [error, setError] = useState(''), [sending, setSending] = useState(false), [copied, setCopied] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null), feed = useRef<HTMLDivElement>(null), started = useRef(false)

  useEffect(() => { void window.api.hud.mode?.('jarvis'); input.current?.focus() }, [])
  const refresh = useCallback(async () => {
    if (!sessionId) return
    const [list, next] = await Promise.all([window.sessionAPI.list(), window.sessionAPI.events({ sessionId, afterSeq: boundary })])
    setSession(list.find(item => item.id === sessionId)); setEvents(next)
  }, [sessionId, boundary])
  useEffect(() => {
    if (!sessionId) return
    void refresh()
    const off = window.sessionAPI.onChanged(() => void refresh()), timer = window.setInterval(() => void refresh(), 1000)
    return () => { off(); window.clearInterval(timer) }
  }, [sessionId, refresh])
  useEffect(() => { const box = feed.current; if (box) box.scrollTop = box.scrollHeight }, [events])

  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId
    let saved: { id: string; at: number } | null = null
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') } catch { /* 忽略损坏的记录 */ }
    const list = await window.sessionAPI.list()
    const reuse = saved && Date.now() - saved.at < REUSE_MS ? list.find(item => item.id === saved!.id && !ongoing.has(item.state)) : undefined
    const id = reuse?.id ?? (await window.sessionAPI.create({ projectId: 'quick-ask', permission: 'confirm' })).id
    setSessionId(id)
    return id
  }
  async function latestClip(): Promise<Mention | undefined> {
    const [item] = await window.sessionAPI.mentionCandidates({ kind: 'clipboard', query: '' })
    return item ? { kind: 'clipboard', id: item.id, label: item.label } : undefined
  }
  async function send(raw = text, allowPossibleSecret = false): Promise<void> {
    let message = raw.trim(), refs = mentions
    if (!message && !refs.length) return
    const slash = SLASH.find(item => message === item.cmd || message.startsWith(item.cmd + ' '))
    if (slash?.cmd === '/截图') { await capture(); return }
    if (slash?.prompt) {
      const extra = message.slice(slash.cmd.length).trim()
      message = slash.prompt + (extra ? `\n补充要求：${extra}` : '')
      if (!refs.length) { const latest = await latestClip(); if (latest) refs = [latest]; else { setError('剪贴板里还没有可以引用的内容'); return } }
    }
    if (!message) message = '这张图里有什么？'
    setSending(true); setError('')
    try {
      const id = await ensureSession()
      const before = (await window.sessionAPI.events({ sessionId: id, afterSeq: -1 })).at(-1)?.seq ?? -1
      setBoundary(before)
      try { localStorage.setItem(SESSION_KEY, JSON.stringify({ id, at: Date.now() })) } catch { /* 隐私模式 */ }
      setText(''); setMentions([])
      await window.sessionAPI.prompt({ sessionId: id, text: message, ...(refs.length ? { mentions: refs } : {}), ...(allowPossibleSecret ? { allowPossibleSecret: true } : {}) })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '没有发出去'
      if (msg.startsWith('POSSIBLE_SECRET')) { setText(raw); setMentions(refs); setError('这段像是密码。确认是示例或可以发送时，按 Ctrl+Shift+Enter 原样发送；否则请在主窗口存为资源。') }
      else { setText(raw); setMentions(refs); setError(msg) }
    } finally { setSending(false) }
  }
  async function capture(): Promise<void> {
    setError('')
    const result = await window.api.clipboard.capture()
    if (!result.success) { setError(result.error || '截图未完成'); return }
    if (result.data) { setMentions(old => [...old.filter(item => item.id !== result.data), { kind: 'clipboard', id: result.data!, label: '截图 / 图片' }]); setText(value => value === '/截图' ? '' : value) }
    void window.api.hud.toggle?.().then(() => input.current?.focus())
  }
  // 从搜索框回车带来的问题：进来就发。
  useEffect(() => { if (initial.autoSend && !started.current) { started.current = true; void send(initial.text ?? '') } })

  const approval = [...events].reverse().find(event => event.type === 'approval' && event.approval.state === 'pending') as Extract<UiEvent, { type: 'approval' }> | undefined
  const question = events.some(event => event.type === 'question' && event.question.state === 'open')
  const answer = [...events].reverse().find(event => event.type === 'assistant_message') as Extract<UiEvent, { type: 'user_message' | 'assistant_message' }> | undefined
  const busy = !!session && ongoing.has(session.state)
  const failure = [...events].reverse().find(event => event.type === 'error' || (event.type === 'status' && event.state === 'failed' && event.text)) as { text?: string } | undefined
  const respond = (allowed: boolean): void => { if (approval) void window.sessionAPI.respondApproval({ id: approval.approval.id, fingerprint: approval.approval.fingerprint, allowed }).catch(err => setError(err instanceof Error ? err.message : '确认失败')) }
  const copy = (): void => { if (answer) void navigator.clipboard.writeText(answer.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }) }
  const paste = (): void => { if (answer) void window.api.hud.pasteAnswer(answer.text).then(result => { if (!result.success) setError(result.error || '粘贴失败') }) }
  const slashOpen = text.startsWith('/') && !text.includes(' ')

  return <div className="flex h-full min-h-0 flex-col" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onExit() }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && event.shiftKey) { event.preventDefault(); void send(text, true) }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && approval) { event.preventDefault(); respond(true) }
    else if (event.key === 'Enter' && event.altKey && answer && !busy) { event.preventDefault(); paste() }
  }}>
    <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-[var(--line)] px-3">
      <button type="button" aria-label="返回搜索" title="返回搜索 Esc" onClick={onExit} className="grid h-7 w-7 place-items-center rounded-[7px] text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"><ArrowLeft {...icon} /></button>
      <span className="cv-jarvis-orb !h-[18px] !w-[18px]" data-active={busy} aria-hidden />
      <span className="text-[14px] font-semibold tracking-[-.01em]">Jarvis</span>
      <span className="flex items-center gap-1 text-[11.5px] text-[var(--ink-faint)]"><Globe size={11} strokeWidth={2} />随手问 · 可联网</span>
      <span className="flex-1" />
      {sessionId && <button type="button" className="cv-btn cv-btn-ghost !h-7 !px-2 text-xs" onClick={() => void window.api.hud.navigate(`/sessions/${sessionId}`)}><ExternalLink {...icon} size={13} />在主窗口继续</button>}
    </header>

    <div ref={feed} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite" aria-label="Jarvis 回答">
      {!sessionId && !sending && <div className="cv-rise space-y-2 pt-6 text-center"><p className="text-[14px] text-[var(--ink)]">想问什么？</p><p className="text-[12.5px] text-[var(--ink-faint)]">输入 / 用常用说法，粘贴或截一张图让它看图。回答可以直接粘贴回你刚才的窗口。</p></div>}
      {events.map(event => event.type === 'user_message' ? <div key={event.seq} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[14px_14px_4px_14px] bg-[var(--surface-2)] px-3 py-2 text-[13.5px] shadow-[inset_0_0_0_1px_var(--line)]">{event.text.split('\n\n以下是用户引用的资料')[0]}</div></div>
        : event.type === 'assistant_message' ? <div key={event.seq} className="whitespace-pre-wrap break-words text-[14px] leading-[1.7]">{event.text}</div>
          : event.type === 'change' ? <p key={event.seq} className="text-[11.5px] text-[var(--ink-faint)]">{event.text}</p> : null)}
      {approval && <section className="cv-pop rounded-[12px] bg-[var(--surface)] p-3 shadow-[var(--shadow-lg)]" aria-label="需要确认">
        <p className="text-[13px] font-medium">发给 {approval.approval.target}</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-faint)]">这个浮窗会话只问这一次；之后的追问直接发送。写文件、命令和账号资源仍会逐次确认。</p>
        <div className="mt-2.5 flex justify-end gap-2"><button type="button" className="cv-btn cv-btn-ghost !h-8" onClick={() => respond(false)}>拒绝</button><button type="button" className="cv-btn cv-btn-primary !h-8" onClick={() => respond(true)}><Check size={14} strokeWidth={2.2} />允许<kbd className="cv-kbd">Ctrl ↵</kbd></button></div>
      </section>}
      {question && <button type="button" className="cv-btn cv-btn-secondary" onClick={() => void window.api.hud.navigate(`/sessions/${sessionId}`)}>Jarvis 有问题要问你，去主窗口回答 →</button>}
      {(sending || (busy && !approval && !question)) && <p className="flex items-center gap-2 text-[13px]"><span className="cv-dot cv-dot-running" /><span className="cv-shimmer">{session?.state === 'starting' || sending ? '正在准备…' : '正在想…'}</span></p>}
      {!busy && failure?.text && <p role="alert" className="rounded-[9px] bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--destructive)]">{failure.text}</p>}
    </div>

    {answer && !busy && <div className="flex shrink-0 items-center gap-1.5 border-t border-[var(--line)] px-3 py-2">
      <button type="button" className="cv-btn cv-btn-primary !h-8" onClick={paste} title="收起浮窗并粘贴到刚才的窗口"><ClipboardPaste {...icon} />粘贴到前台<kbd className="cv-kbd">Alt ↵</kbd></button>
      <button type="button" className="cv-btn cv-btn-ghost !h-8" onClick={copy}>{copied ? <Check {...icon} /> : <ClipboardCopy {...icon} />}{copied ? '已复制' : '复制'}</button>
    </div>}

    {error && <p role="alert" className="mx-3 mb-2 rounded-[9px] bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--destructive)]">{error}</p>}
    <form className="relative shrink-0 border-t border-[var(--line)] p-2.5" onSubmit={event => { event.preventDefault(); if (!busy && !sending) void send() }}>
      {slashOpen && <div className="cv-pop absolute bottom-[calc(100%+6px)] left-2.5 w-[300px] rounded-[12px] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]" role="listbox" aria-label="常用说法">
        {SLASH.filter(item => item.cmd.startsWith(text)).map(item => <button type="button" role="option" aria-selected={false} key={item.cmd} onClick={() => { setText(item.cmd + ' '); input.current?.focus() }} className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] hover:bg-[var(--hover)]"><span className="font-mono text-[var(--blue)]">{item.cmd}</span><span className="text-xs text-[var(--ink-faint)]">{item.hint}</span></button>)}
      </div>}
      {mentions.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{mentions.map(item => <span key={item.id} className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[var(--surface-2)] pl-1 pr-1 text-[12px] shadow-[inset_0_0_0_1px_var(--line)]">
        {item.kind === 'clipboard' && item.label === '截图 / 图片' ? <span className="h-7 w-7 overflow-hidden rounded-[6px]"><ClipThumb id={item.id} variant="row" /></span> : <span className="grid h-7 w-7 place-items-center text-[var(--ink-faint)]">{item.kind === 'resource' ? <KeyRound size={13} strokeWidth={1.8} /> : <ClipboardList size={13} strokeWidth={1.8} />}</span>}<span className="max-w-[220px] truncate">{item.label ?? '剪贴板资料'}</span>
        <button type="button" aria-label="移除引用" className="grid h-5 w-5 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--hover)]" onClick={() => setMentions(old => old.filter(value => value.id !== item.id))}><X size={12} /></button></span>)}</div>}
      <div className="flex items-end gap-2">
        <textarea ref={input} rows={1} value={text} aria-label="问 Jarvis" placeholder={busy ? 'Jarvis 正在回答…' : '问点什么，/ 用常用说法'} maxLength={20_000}
          onChange={event => setText(event.target.value)}
          onPaste={event => { const file = [...event.clipboardData.items].find(item => item.type.startsWith('image/'))?.getAsFile(); if (!file) return; event.preventDefault()
            const reader = new FileReader(); reader.onload = () => void window.api.clipboard.savePastedImage(String(reader.result)).then(result => { if (result.success && result.data) setMentions(old => [...old, { kind: 'clipboard', id: result.data!.id, label: '截图 / 图片' }]); else setError(result.error || '图片未能保存') }); reader.readAsDataURL(file) }}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !sending) void send() } }}
          className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] outline-none placeholder:text-[var(--ink-faint)]" />
        <button type="button" title="截图问 AI" aria-label="截图" onClick={() => void capture()} className="grid h-9 w-9 place-items-center rounded-[9px] text-[var(--ink-soft)] hover:bg-[var(--hover)]"><ScanText {...icon} size={16} /></button>
        <button aria-label="发送" disabled={busy || sending || (!text.trim() && !mentions.length)} className="grid h-9 w-9 place-items-center rounded-[9px] bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-40"><ArrowUp size={16} strokeWidth={2.2} /></button>
      </div>
    </form>
  </div>
}
