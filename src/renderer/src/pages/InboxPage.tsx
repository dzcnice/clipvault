import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bug, KeyRound, ShieldAlert, Wand2, RotateCw, Lock, Inbox, Info } from 'lucide-react'
import type { InboxItem, InboxKind } from '@/types/inbox'
import type { WorkProject } from '@/types/workbench'
import { unwrap } from '../hooks/useWorkbench'
import { useConfirm } from '../components/ConfirmDialog'
import ResourceIntake from '../components/ResourceIntakeReview'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog'

export const INBOX_LABELS: Record<InboxKind, string> = { error_fix: '报错', save_resource: '账号资料', duplicate_secret: '重复密钥', organize: '整理', rotate: '轮换提醒', weak_password: '弱密码' }
function dayLabel(at: number): string { const today = new Date(); today.setHours(0, 0, 0, 0); return at >= today.getTime() ? '今天' : at >= today.getTime() - 86400000 ? '昨天' : '更早' }
export default function InboxPage(): JSX.Element {
  const [items, setItems] = useState<InboxItem[]>([]), [projects, setProjects] = useState<WorkProject[]>([]), [selectedId, setSelectedId] = useState('')
  const [kind, setKind] = useState<InboxKind | ''>(''), [prompt, setPrompt] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [intake, setIntake] = useState<string>()
  const navigate = useNavigate(), confirm = useConfirm()
  const refresh = useCallback(async () => { setItems(await unwrap(window.api.workbench.inbox())); setLoading(false) }, [])
  useEffect(() => { let alive = true; const update = (): void => { if (alive) void refresh().catch(error => { if (alive) { setError(error.message); setLoading(false) } }) }; update(); const off = window.api.workbench.onInboxChanged(update); void window.api.workbench.quickIndex().then(result => { if (alive && result.success && result.data) setProjects(result.data.projects) }); return () => { alive = false; off() } }, [refresh])
  const selected = items.find(item => item.id === selectedId), filtered = items.filter(item => !kind || item.type === kind)
  const act = async (action: () => Promise<unknown>): Promise<void> => { if (busy) return; setBusy(true); setError(''); try { await action(); await refresh() } catch (error) { setError(error instanceof Error ? error.message : '操作失败') } finally { setBusy(false) } }
  const projectName = (projectId?: string | null): string => projects.find(project => project.id === projectId)?.name || '本机资料'
  const KIND_ICON: Record<InboxKind, typeof Bug> = { error_fix: Bug, save_resource: KeyRound, duplicate_secret: ShieldAlert, organize: Wand2, rotate: RotateCw, weak_password: ShieldAlert }
  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] pl-6 pr-3">
      <h1 className="text-[14px] font-medium tracking-[-.01em]">收件箱</h1>
      <span className="flex items-center gap-1.5 text-[13px] text-[var(--ink-faint)]"><Lock size={13} strokeWidth={1.75} /><span>本地识别，未调用模型</span></span>
      <span className="flex-1" />
      <button className="cv-btn cv-btn-ghost" disabled={busy || !items.length} onClick={() => void act(async () => { if (await confirm({ title: '全部忽略', message: '忽略当前全部建议，原资料会保留。', confirmText: '忽略', cancelText: '取消' })) await unwrap(window.api.workbench.dismissInbox()) })}>全部忽略</button>
    </header>
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-5 pb-2 pt-4">
          {([['', '全部'], ...Object.entries(INBOX_LABELS)] as Array<[InboxKind | '', string]>).map(([key, label]) => {
            const count = key ? items.filter(item => item.type === key).length : items.length, on = kind === key
            return <button key={key || 'all'} aria-pressed={on} onClick={() => setKind(key)} className={`h-7 shrink-0 rounded-[8px] px-2.5 text-[12.5px] transition-all duration-200 ${on ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--line)] hover:bg-[var(--hover)]'}`}>{label} <span className="font-mono opacity-70">{count}</span></button>
          })}
        </div>
        <p className="px-5 pb-1 text-xs text-[var(--ink-faint)]">手动 AI 整理产生的建议会单独标注。</p>
        {error && <p role="alert" className="cv-pop mx-5 my-2 flex items-center rounded-[10px] bg-[var(--bad-soft)] px-4 py-2.5 text-[13px] text-[var(--destructive)]">{error}<button className="ml-auto font-medium hover:underline" onClick={() => void act(refresh)}>重试</button></p>}
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-6">
          {loading ? <p role="status" className="cv-shimmer px-3 py-6 text-[13px]">正在读取建议…</p> : !filtered.length ? <div className="cv-empty cv-rise"><span className="cv-icon-slot !h-12 !w-12 !rounded-[14px]"><Inbox size={22} strokeWidth={1.5} /></span><p className="mt-2 text-[15px] font-medium text-[var(--ink)]">暂无建议</p><p className="text-[13px]">复制报错或账号资料后，会在本机识别可处理事项。</p></div>
            : ['今天', '昨天', '更早'].map(day => { const rows = filtered.filter(item => dayLabel(item.createdAt) === day); return rows.length ? <section key={day}><h2 className="px-3 pb-1.5 pt-4 text-xs text-[var(--ink-faint)]">{day}</h2>{rows.map((item, index) => {
              const Icon = KIND_ICON[item.type] ?? Bug, on = selectedId === item.id
              return <button key={item.id} style={{ '--i': Math.min(index, 10) } as React.CSSProperties} className={`cv-rise flex w-full items-start gap-3 rounded-[12px] px-3 py-3 text-left transition-colors ${on ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--hover)]'}`} onClick={() => { setSelectedId(item.id); setPrompt(item.data.prompt || '') }}>
                <span className="cv-icon-slot mt-0.5"><Icon size={14} strokeWidth={1.75} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2"><span className="truncate text-[13.5px] font-medium">{item.data.title}</span>{item.sourceId?.startsWith('ai:') && <span className="cv-badge cv-badge-accent">AI 整理建议</span>}<span className="ml-auto shrink-0 font-mono text-xs text-[var(--ink-faint)]">{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></span>
                  <span className="mt-0.5 block truncate font-mono text-[12.5px] text-[var(--ink-soft)]">{item.data.preview || item.data.reason}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--ink-faint)]">{INBOX_LABELS[item.type]} · {projectName(item.projectId)}{item.data.analysis ? ({ queued: ' · 预分析排队中', running: ' · 预分析中', done: ' · 已预分析', failed: ' · 预分析未完成' } as const)[item.data.analysis.state] : ''}</span>
                </span>
              </button>
            })}</section> : null })}
        </div>
      </div>
      {selected && <aside key={selected.id} className="flex w-[340px] shrink-0 animate-[cv-rise_.35s_cubic-bezier(.16,1,.3,1)] flex-col border-l border-[var(--line)]" aria-label="建议详情">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          <h2 className="text-[15px] font-medium tracking-[-.01em]">{selected.data.title}</h2>
          {selected.data.preview && <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[var(--surface-2)] p-3.5 font-mono text-[12.5px] leading-[1.75] shadow-[inset_0_0_0_1px_var(--line)]">{selected.data.preview}</pre>}
          <div><p className="text-xs text-[var(--ink-faint)]">识别依据</p><p className="mt-1 text-[13px] text-[var(--ink-soft)]">识别依据：{selected.data.reason}</p></div>
          {selected.data.analysis && <section className="rounded-[12px] bg-[var(--primary-soft)] p-3.5" aria-label="预分析">
            <h3 className="flex items-center gap-2 text-xs font-medium text-[var(--blue)]">{['queued', 'running'].includes(selected.data.analysis.state) && <span className="cv-dot cv-dot-running" style={{ width: 6, height: 6 }} />}后台只读预分析 · {({ queued: '排队中', running: '分析中', done: '已完成', failed: '未完成' } as const)[selected.data.analysis.state]}</h3>
            {selected.data.analysis.text ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--ink)]">{selected.data.analysis.text}</p> : <p className="cv-shimmer mt-1.5 text-[13px]">正在读取相关代码…</p>}
            <p className="mt-2 text-[11.5px] text-[var(--ink-faint)]">只读分析，未修改文件；可在项目设置中关闭。</p>
          </section>}
          {selected.type === 'error_fix' && <div className="space-y-2">
            <label className="block text-xs text-[var(--ink-faint)]" htmlFor="inbox-prompt">首句</label>
            <textarea id="inbox-prompt" className="cv-input" rows={4} maxLength={4000} value={prompt} onChange={event => setPrompt(event.target.value)} />
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--ink-faint)]"><Info size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />点了才会把这段内容发给模型。发送前仍执行密钥检查与外发确认。</p>
          </div>}
        </div>
        <div className="space-y-2 border-t border-[var(--line)] p-3">
          {selected.type === 'error_fix' && <button className="cv-btn cv-btn-primary !h-9 w-full" disabled={busy || !prompt.trim()} onClick={() => void act(async () => { const id = await unwrap(window.api.workbench.inboxStart(selected.id, prompt)); navigate('/sessions/' + id) })}>在 {projects.find(project => project.id === selected.projectId)?.name || '项目'} 开会话</button>}
          {selected.data.action === 'resource' && <div className="flex flex-wrap gap-2">{selected.data.ids[0] && <button className="cv-btn cv-btn-primary !h-9 flex-1" onClick={() => setIntake(selected.data.ids[0])}>存为资源</button>}{selected.data.resourceIds?.map(id => <Link className="cv-btn cv-btn-secondary !h-9" key={id} to={'/resources/' + id}>查看资源</Link>)}</div>}
          {selected.type === 'organize' && ['snippet', 'delete'].includes(selected.data.action || '') && <button className={`cv-btn !h-9 w-full ${selected.data.action === 'delete' ? 'cv-btn-danger' : 'cv-btn-primary'}`} disabled={busy} onClick={() => void act(async () => { if (await confirm({ title: selected.data.action === 'snippet' ? '合并为片段' : '清理这些资料', message: `${selected.data.reason}。涉及 ${selected.data.ids.length} 条，仅执行当前建议。`, confirmText: '确认执行', cancelText: '取消', variant: selected.data.action === 'delete' ? 'danger' : undefined })) await unwrap(window.api.workbench.applySuggestion(selected.id)) })}>{selected.data.action === 'snippet' ? '保存为片段' : '确认清理'}</button>}
          <div className="flex gap-2"><button className="cv-btn cv-btn-secondary flex-1" disabled={busy} onClick={() => void act(() => unwrap(window.api.workbench.settleInbox(selected.id, 'dismissed')))}>忽略</button><button className="cv-btn cv-btn-ghost flex-1" disabled={busy} onClick={() => void act(async () => { await unwrap(window.api.workbench.muteInbox(selected.type, true)); await unwrap(window.api.workbench.settleInbox(selected.id, 'dismissed')) })}>不再提示此类</button></div>
          <Link className="block text-center text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]" to="/settings">在设置中恢复已关闭的规则</Link>
        </div>
      </aside>}
    </div>
    <Dialog open={!!intake} onOpenChange={open => { if (!open) setIntake(undefined) }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-auto"><DialogTitle>保存为资源</DialogTitle><DialogDescription>原剪贴板资料保留，确认字段后保存。</DialogDescription>{intake && <ResourceIntake source={{ clipboardId: intake }} onCancel={() => setIntake(undefined)} onSaved={() => { setIntake(undefined); if (selected) void act(() => unwrap(window.api.workbench.settleInbox(selected.id, 'done'))) }} />}</DialogContent></Dialog>
  </div>
}
