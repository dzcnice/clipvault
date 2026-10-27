import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, Play, Square, Check, RotateCcw } from 'lucide-react'
import type { ContextItem, TaskDetail, WorkbenchSnapshot, WorkTask } from '@/types/workbench'
import { useWorkbench, unwrap } from '../hooks/useWorkbench'
import { Field, TaskBadge, WorkbenchFrame } from '../components/WorkbenchParts'
import ResourceEditor from '../components/ResourceEditor'
import TaskAttachments from '../components/TaskAttachments'
import TaskTemplates from '../components/TaskTemplates'

interface Draft { projectId: string; prompt: string; acceptance: string; resourceIds: string[]; attachments?: ContextItem[] }
interface FollowDraft { prompt: string; resourceIds: string[]; expectedRevision: number; attachments?: ContextItem[] }

export default function WorkbenchPage(): JSX.Element {
  const location = useLocation()
  return <WorkbenchContent key={location.key} />
}
function WorkbenchContent(): JSX.Element {
  const work = useWorkbench(), location = useLocation()
  const incoming = location.state as { projectId?: string; clipboardIds?: string[]; taskId?: string; resourceId?: string; draft?: Draft; followUp?: FollowDraft } | null
  const params = new URLSearchParams(location.search)
  const [projectId, setProjectId] = useState(incoming?.draft?.projectId ?? incoming?.projectId ?? params.get('project') ?? ''), [prompt, setPrompt] = useState(incoming?.draft?.prompt ?? ''), [acceptance, setAcceptance] = useState(incoming?.draft?.acceptance ?? '')
  const [resourceIds, setResourceIds] = useState<string[]>(incoming?.draft?.resourceIds ?? (incoming?.resourceId ? [incoming.resourceId] : [])), [clipboardIds, setClipboardIds] = useState<string[]>(incoming?.taskId ? [] : incoming?.clipboardIds ?? [])
  const [mode, setMode] = useState<'task' | 'resource'>('task')
  const [attachments, setAttachments] = useState<ContextItem[]>(incoming?.draft?.attachments ?? [])
  const [selected, setSelected] = useState<string | null>(incoming?.taskId ?? params.get('task') ?? null)
  const project = work.data?.projects.find(project => project.id === (projectId || work.data?.projects[0]?.id))
  const available = work.data?.resources.filter(resource => resource.kind !== 'model' && resource.state !== 'revoked' && resource.environment === project?.environment && (!resource.projectId || resource.projectId === project.id)) ?? []
  const unavailableResources = resourceIds.filter(id => !available.some(resource => resource.id === id))
  return <WorkbenchFrame title="工作台" description="找回资料，交代任务，检查结果。你的编程工作从这里继续。" {...work}>
    {work.data && <>
      <div className="mb-5 flex flex-wrap gap-2 text-xs"><span className="cv-badge">{work.data.harness.message}</span><span className="cv-badge">{work.data.model.resourceId ? `模型 · ${work.data.model.model}` : '尚未配置运行模型'}</span><span className="cv-badge">{work.data.harness.terminalEnabled ? '本机检查可用' : '本机检查未就绪'}</span><Link className="cv-btn cv-btn-ghost text-xs !py-1" to="/resources">配置资源与模型<ArrowRight size={12} /></Link></div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(19rem,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0 space-y-5">
          <div className="flex gap-2" aria-label="开始方式"><button className="cv-btn cv-btn-secondary" aria-pressed={mode === 'task'} onClick={() => setMode('task')}>交代任务</button><button className="cv-btn cv-btn-secondary" aria-pressed={mode === 'resource'} onClick={() => setMode('resource')}>保存账号或密钥</button></div>
          {mode === 'resource' ? <ResourceEditor data={work.data} busy={work.busy} act={work.act} useForTask initial={{ name: '', kind: 'account', projectId: project?.id ?? null, environment: project?.environment ?? 'development', fields: [] }} onCancel={() => setMode('task')} onSaved={resource => { if (resource.projectId) setProjectId(resource.projectId); if (resource.kind !== 'model') setResourceIds([resource.id]); if (!prompt) setPrompt(resource.purpose || ''); setMode('task') }} /> : <form className="cv-panel-soft space-y-4 p-5" onSubmit={event => { event.preventDefault(); void work.act(async () => { const task = await unwrap(window.api.workbench.createTask({ projectId: project?.id ?? '', prompt, acceptance, resourceIds: resourceIds.filter(id => available.some(resource => resource.id === id)), clipboardIds, attachmentIds: attachments.map(item => item.id) })); setSelected(task.id); setPrompt(''); setAcceptance(''); setResourceIds([]); setClipboardIds([]); setAttachments([]) }, '任务草稿已保存') }}>
            <h2 className="font-semibold">这次想做什么？</h2>
            <TaskTemplates prompt={prompt} acceptance={acceptance} apply={item => { setPrompt(item.prompt); setAcceptance(item.acceptance) }} act={work.act} busy={work.busy} />
            {!work.data.projects.length ? <p className="text-sm text-muted-foreground">先<Link to="/projects" className="text-primary underline">添加一个项目</Link>，把任务与代码目录关联起来。</p> : <Field label="项目"><select className="cv-input" value={project?.id ?? ''} onChange={event => { setProjectId(event.target.value); setResourceIds([]) }}>{work.data.projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.environment}</option>)}</select></Field>}
            <Field label="任务目标"><textarea className="cv-input" required rows={5} maxLength={50000} placeholder="例如：读取登录模块，修复失败重试问题，补上测试并告诉我验证结果。" value={prompt} onChange={event => setPrompt(event.target.value)} /></Field>
            <Field label="验收标准"><textarea className="cv-input" rows={2} maxLength={4000} placeholder="怎样才算完成？需要跑什么检查？" value={acceptance} onChange={event => setAcceptance(event.target.value)} /></Field>
            {clipboardIds.length > 0 && <div className="flex items-center justify-between gap-2 text-sm"><span>已选 {clipboardIds.length} 条剪贴板记录</span><button type="button" className="cv-btn cv-btn-ghost text-xs" onClick={() => setClipboardIds([])}>移除上下文</button></div>}
            <Link className="inline-flex text-xs text-primary underline" to="/clipboard" state={{ draft: { projectId: project?.id ?? '', prompt, acceptance, resourceIds, attachments } }}>从剪贴板选择任务上下文</Link>
            <TaskAttachments items={attachments} onChange={setAttachments} busy={work.busy} act={work.act} />
            {available.length > 0 && <fieldset className="space-y-2"><legend className="mb-2 text-sm text-muted-foreground">可用资源 · 只共享名称与字段描述</legend>{available.map(resource => <label key={resource.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resourceIds.includes(resource.id)} onChange={event => setResourceIds(event.target.checked ? [...resourceIds, resource.id] : resourceIds.filter(id => id !== resource.id))} />{resource.name}<span className="text-xs text-muted-foreground">{resource.environment}</span></label>)}</fieldset>}
            {unavailableResources.length > 0 && <div role="alert" className="space-y-2 text-sm text-muted-foreground"><p>已选资源与当前项目或环境不匹配，或已被撤销。资源仍已保存，请先选择匹配的项目并重新勾选，或移除本次关联。</p><button type="button" className="cv-btn cv-btn-secondary text-xs" onClick={() => setResourceIds(resourceIds.filter(id => !unavailableResources.includes(id)))}>移除不匹配的关联</button></div>}
            <button className="cv-btn cv-btn-primary" disabled={work.busy || !project || !prompt.trim() || unavailableResources.length > 0}>保存任务草稿<ArrowRight size={14} /></button>
          </form>}
          <section className="space-y-2" aria-label="任务列表"><div className="flex items-center justify-between"><h2 className="font-semibold">最近任务</h2><span className="text-xs text-muted-foreground">{work.data.tasks.length} 项</span></div>
            {!work.data.tasks.length && <p className="cv-panel-soft p-5 text-sm text-muted-foreground">还没有任务。保存一个目标后，可以先检查上下文再运行。</p>}
            {work.data.tasks.map(task => <button key={task.id} className={`cv-panel-soft block w-full p-4 text-left ${selected === task.id ? 'ring-2 ring-primary' : ''}`} aria-pressed={selected === task.id} onClick={() => setSelected(task.id)}><div className="flex items-start justify-between gap-3"><span className="min-w-0 break-words font-medium">{task.title}</span><TaskBadge state={task.state} /></div><p className="mt-2 text-xs text-muted-foreground">{work.data?.projects.find(project => project.id === task.projectId)?.name} · {task.environment} · {new Date(task.updatedAt).toLocaleString()}</p></button>)}
          </section>
        </div>
        {selected ? <TaskPanel key={selected} id={selected} data={work.data} busy={work.busy} act={work.act} clipboardIds={selected === incoming?.taskId ? incoming.clipboardIds ?? [] : []} followDraft={selected === incoming?.taskId ? incoming.followUp : undefined} /> : <div className="cv-panel-soft p-7"><p className="cv-kicker">从资料到结果</p><h2 className="mt-3 text-lg font-semibold">给每次工作留下可继续的记录</h2><ol className="mt-5 space-y-4 text-sm text-muted-foreground"><li>1. 选择项目，写清目标与验收要求。</li><li>2. 把需要的剪贴板内容和资源加入任务。</li><li>3. 运行前确认发给模型的上下文；执行过程中审批具体操作。</li><li>4. 查看实际修改与验证记录，确认完成，或从会话继续。</li></ol></div>}
      </div>
    </>}
  </WorkbenchFrame>
}

function TaskPanel({ id, data, busy, act, clipboardIds, followDraft }: { id: string; data: WorkbenchSnapshot; busy: boolean; act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>; clipboardIds: string[]; followDraft?: FollowDraft }): JSX.Element {
  const [detail, setDetail] = useState<TaskDetail | null>(null), [error, setError] = useState('')
  const [contextConsumed, setContextConsumed] = useState(false)
  useEffect(() => {
    let cancelled = false
    void unwrap(window.api.workbench.task(id)).then(detail => { if (!cancelled) { setDetail(detail); setError('') } }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : '任务读取失败') })
    return () => { cancelled = true }
  }, [id, data])
  if (error) return <div role="alert" className="cv-panel-soft p-5 text-sm text-destructive">{error}</div>
  if (!detail) return <div role="status" className="cv-panel-soft p-5">正在读取任务…</div>
  const task = detail.task, active = (data.harness.activeTaskIds ?? [data.harness.activeTaskId]).includes(task.id), approvals = data.harness.approvals.filter(approval => approval.taskId === id)
  return <section className="min-w-0 space-y-4" aria-label="任务详情">
    <div className="cv-panel-soft space-y-3 p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="min-w-0 break-words font-semibold">{task.title}</h2><TaskBadge state={task.state} /></div>
      <p className="break-all font-mono text-xs text-muted-foreground">{task.directory}</p><p className="whitespace-pre-wrap text-sm">{task.prompt}</p>
      {task.acceptance && <p className="whitespace-pre-wrap border-l-2 border-primary pl-3 text-sm text-muted-foreground">验收：{task.acceptance}</p>}
      <TaskActions task={task} hasRuns={detail.runs.length > 0} active={active} busy={busy} available={data.harness.available && !!data.model.resourceId} act={act} />
      {detail.runs.at(-1)?.error && <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{detail.runs.at(-1)?.error}</p>}
    </div>
    {(task.updates ?? []).map(update => <article key={update.id} className="cv-panel-soft p-4"><p className="mb-2 text-xs text-muted-foreground">你的补充 · 版本 {update.revision} · {new Date(update.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap text-sm">{update.prompt}</p>{update.context.map(item => <details key={item.id} className="mt-2 text-xs"><summary>{item.title}{item.redacted ? ' · 已脱敏' : ''}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{item.text}</pre></details>)}</article>)}
    <FollowUp key={`${id}:${task.revision ?? 1}:${contextConsumed}`} task={task} data={data} busy={busy || active || task.state === 'queued'} act={act} clipboardIds={contextConsumed ? [] : clipboardIds} initial={contextConsumed ? undefined : followDraft} onSaved={() => setContextConsumed(true)} />
    {approvals.map(approval => <div key={approval.id} className="rounded border-2 border-primary bg-[var(--surface)] p-4" role="region" aria-label="待审批操作"><h3 className="font-semibold">需要确认 · {approval.operation}</h3><p className="mt-2 break-all font-mono text-xs">{approval.target}</p><pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-soft)] p-3 font-mono text-xs">{approval.description}</pre><p className="mb-3 text-xs text-muted-foreground">仅批准这一次操作 · {new Date(approval.expiresAt).toLocaleTimeString()} 到期</p><div className="flex flex-wrap gap-2"><button disabled={busy} className="cv-btn cv-btn-primary" onClick={() => void act(() => unwrap(window.api.workbench.approve(approval.id, approval.fingerprint, true)))}>确认此操作</button><button disabled={busy} className="cv-btn cv-btn-secondary" onClick={() => void act(() => unwrap(window.api.workbench.approve(approval.id, approval.fingerprint, false)))}>拒绝</button></div></div>)}
    <details className="cv-panel-soft p-4"><summary className="cursor-pointer text-sm font-medium">固定上下文 · {task.context.length} 条 · {task.resourceIds.length} 个资源</summary><p className="mt-3 text-xs text-muted-foreground">只使用本次选择的快照；后来清理剪贴板不会改变任务资料。</p>{task.context.map(item => <div key={item.id} className="mt-3"><p className="text-xs text-muted-foreground">{item.title}{item.redacted ? ' · 已隐藏敏感字段' : ''}</p><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{item.text}</pre></div>)}</details>
    {detail.changes.map(change => <details key={change.id} className="cv-panel-soft p-4"><summary className="cursor-pointer break-all text-sm font-medium">{change.path} · {change.state === 'completed' ? '已写入' : '结果待核对'}</summary><div className="mt-3 grid gap-3 2xl:grid-cols-2"><div><p className="mb-2 text-xs text-muted-foreground">修改前</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{change.before || '（新文件）'}</pre></div><div><p className="mb-2 text-xs text-muted-foreground">批准写入的内容</p><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">{change.after}</pre></div></div></details>)}
    <div className="cv-panel-soft p-4"><h3 className="mb-3 text-sm font-semibold">运行记录</h3>{!detail.events.length && <p className="text-sm text-muted-foreground">运行后会在这里记录模型回复、实际操作和验证结果。</p>}<div className="space-y-3">{detail.events.map(event => <article key={event.id} className="border-l-2 border-[var(--line)] pl-3"><p className="mb-1 text-[11px] text-muted-foreground">{new Date(event.createdAt).toLocaleTimeString()} · {{ message: '模型回复', tool: '操作', approval: '审批', result: '验证结果', error: '未完成', status: '状态' }[event.kind]}</p><pre className={`whitespace-pre-wrap break-words font-body text-sm ${event.kind === 'error' ? 'text-destructive' : ''}`}>{event.text}</pre></article>)}</div></div>
    {detail.runs.length > 0 && <details className="cv-panel-soft p-4 text-xs"><summary className="cursor-pointer">运行版本与会话 · {detail.runs.length} 次</summary>{detail.runs.map(run => <p key={run.id} className="mt-2 break-all font-mono">{new Date(run.startedAt).toLocaleString()} · {run.runtimeVersion} · {run.resumedFrom ? '恢复' : '新会话'} · {run.sessionId}</p>)}</details>}
  </section>
}
function FollowUp({ task, data, busy, act, clipboardIds, initial, onSaved }: { task: WorkTask; data: WorkbenchSnapshot; busy: boolean; act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>; clipboardIds: string[]; initial?: FollowDraft; onSaved: () => void }): JSX.Element {
  const [prompt, setPrompt] = useState(initial?.prompt ?? ''), [resources, setResources] = useState(initial?.resourceIds ?? task.resourceIds)
  const [clips, setClips] = useState(clipboardIds)
  const [attachments, setAttachments] = useState<ContextItem[]>(initial?.attachments ?? [])
  const available = data.resources.filter(resource => resource.kind !== 'model' && resource.state !== 'revoked' && resource.environment === task.environment && (!resource.projectId || resource.projectId === task.projectId))
  return <form className="cv-panel-soft space-y-3 p-4" aria-label="补充任务" onSubmit={event => { event.preventDefault(); void act(async () => {
    await unwrap(window.api.workbench.followUp({ taskId: task.id, prompt, resourceIds: resources.filter(id => available.some(resource => resource.id === id)), clipboardIds: clips, attachmentIds: attachments.map(item => item.id), expectedRevision: initial?.expectedRevision ?? task.revision ?? 1 }))
    setPrompt(''); setClips([]); setAttachments([]); onSaved()
  }, '补充已保存；点击继续会话运行新要求') }}>
    <Field label="补充要求或新的报错"><textarea className="cv-input" rows={3} maxLength={20000} required value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="例如：刚才的结果还需要兼容空输入，补上对应测试。" /></Field>
    {busy && <p className="text-xs text-muted-foreground">当前任务运行或排队期间，请先停止再保存补充。</p>}
    {available.length > 0 && <fieldset className="space-y-2"><legend className="mb-2 text-xs text-muted-foreground">下一次运行可用的资源</legend>{available.map(resource => <label key={resource.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resources.includes(resource.id)} onChange={event => setResources(event.target.checked ? [...resources, resource.id] : resources.filter(id => id !== resource.id))} />{resource.name} · {resource.environment}</label>)}</fieldset>}
    {clips.length > 0 && <p className="text-xs">将追加 {clips.length} 条剪贴板快照 <button type="button" className="underline" onClick={() => setClips([])}>移除</button></p>}
    <TaskAttachments items={attachments} onChange={setAttachments} busy={busy} act={act} />
    <Link to="/clipboard" className="block text-xs text-primary underline" state={{ taskId: task.id, followUp: { prompt, resourceIds: resources, expectedRevision: task.revision ?? 1, attachments } }}>选择要追加的剪贴板资料</Link>
    <button className="cv-btn cv-btn-primary" disabled={busy || !prompt.trim()}>保存补充</button>
  </form>
}
function TaskActions({ task, hasRuns, active, busy, available, act }: { task: WorkTask; hasRuns: boolean; active: boolean; busy: boolean; available: boolean; act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined> }): JSX.Element {
  return <div className="flex flex-wrap gap-2">
    <button className="cv-btn cv-btn-secondary" disabled={busy || active} onClick={() => void act(() => unwrap(window.api.workbench.handoff(task.id)), '已复制脱敏任务上下文，可粘贴给 Claude、Codex 或其他编程工具')}>复制任务交接</button>
    {active || task.state === 'queued' ? <button className="cv-btn cv-btn-secondary" disabled={busy || task.state === 'stopping'} onClick={() => void act(() => unwrap(window.api.workbench.stop(task.id)))}><Square size={13} />{task.state === 'stopping' ? '正在确认停止…' : '停止任务'}</button> : <>
      <button className="cv-btn cv-btn-primary" disabled={busy || !available} onClick={() => void act(() => unwrap(window.api.workbench.start(task.id)))}><Play size={13} />{hasRuns ? '重新运行' : '运行任务'}</button>
      {hasRuns && <button className="cv-btn cv-btn-secondary" disabled={busy || !available} onClick={() => void act(() => unwrap(window.api.workbench.start(task.id, true)))}><RotateCcw size={13} />继续会话</button>}
      {task.state === 'waiting' && <button className="cv-btn cv-btn-secondary" disabled={busy} onClick={() => void act(() => unwrap(window.api.workbench.accept(task.id)), '任务已验收完成')}><Check size={13} />确认验收</button>}
    </>}
  </div>
}
