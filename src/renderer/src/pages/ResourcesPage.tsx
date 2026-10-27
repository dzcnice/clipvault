import { useEffect, useState } from 'react'
import type { ResourceHealth } from '@/types/inbox'
import { Copy, Check, KeyRound, ExternalLink, Plus, Search, Play, LogIn, MessageSquarePlus, PencilLine, Ban, Server, Globe, Database, TerminalSquare, FileText, Link2, Cpu } from 'lucide-react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import type { ResourceInput, WorkResource } from '@/types/workbench'
import { useWorkbench, unwrap } from '../hooks/useWorkbench'
import { WorkbenchFrame } from '../components/WorkbenchParts'
import { useConfirm } from '../components/ConfirmDialog'
import ModelSettings from '../components/ModelSettings'
import ResourceEditor, { RESOURCE_LABELS } from '../components/ResourceEditor'
import DailyDataPanel from '../components/DailyDataPanel'
import ResourceIntake from '../components/ResourceIntakeReview'
import { TOTPRing } from '../components/TOTPRing'

const icon = { size: 15, strokeWidth: 1.75 }
const KIND_ICON: Record<WorkResource['kind'], typeof KeyRound> = { account: Globe, api: Server, database: Database, snippet: FileText, command: TerminalSquare, link: Link2, note: FileText, model: Cpu }
const ROLE_LABEL: Record<string, string> = { username: '用户名', password: '密码', api_key: 'API Key', token: '令牌', totp_seed: '验证码', host: '主机', port: '端口', database: '数据库', connection_string: '连接串' }

function CopyButton({ label, disabled, onCopy }: { label: string; disabled: boolean; onCopy: () => Promise<boolean> }): JSX.Element {
  const [done, setDone] = useState(false)
  return <button className={`flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] transition-all duration-200 ${done ? 'text-[var(--state-done)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--state-done)_40%,transparent)]' : 'text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'}`}
    aria-label={label} disabled={disabled} onClick={() => void onCopy().then(ok => { if (ok) { setDone(true); window.setTimeout(() => setDone(false), 1600) } })}>
    {done ? <Check {...icon} size={13} /> : <Copy {...icon} size={13} />}{done ? '已复制' : '复制'}</button>
}

export default function ResourcesPage(): JSX.Element {
  const { id } = useParams(), navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const work = useWorkbench(), confirm = useConfirm()
  const [health, setHealth] = useState<ResourceHealth[]>([])
  useEffect(() => { let alive = true; void window.api.workbench.resourceHealth?.().then(result => { if (alive && result.success && result.data) setHealth(result.data) }).catch(() => {}); return () => { alive = false } }, [work.data?.resources])
  const [query, setQuery] = useState(''), [projectId, setProjectId] = useState(''), [environment, setEnvironment] = useState('')
  const [editing, setEditing] = useState<ResourceInput>(), [legacy, setLegacy] = useState<Array<{ id: string; name: string }>>([])
  const [histories, setHistories] = useState<Record<string, Array<{ name: string; version: number; createdAt: number }>>>({})
  const resources = work.data?.resources.filter(resource => {
    const project = work.data?.projects.find(project => project.id === resource.projectId)
    return (!projectId || resource.projectId === projectId) && (!environment || resource.environment === environment) &&
      [resource.name, resource.purpose, resource.environment, resource.endpoint, project?.name, ...resource.aliases ?? []].join(' ').toLowerCase().includes(query.toLowerCase())
  }) ?? []
  const selected = id ? work.data?.resources.find(resource => resource.id === id) : undefined
  const projectName = (resource: WorkResource): string => work.data?.projects.find(project => project.id === resource.projectId)?.name || '通用资料'
  const edit = (resource: WorkResource): void => { setCreating(false); setEditing({ ...resource, expectedVersion: resource.version, fields: [] }) }
  const issues = (resourceId: string): string[] => health.find(item => item.resourceId === resourceId)?.issues.map(issue => issue.kind === 'rotate' ? '待轮换' : issue.kind === 'weak_password' ? '弱密码' : '重复密码') ?? []
  const copyField = (resource: WorkResource, field: string): Promise<boolean> => work.act(() => unwrap(window.api.workbench.copyField(resource.id, field, resource.version)), `${field} 已复制`).then(result => result !== undefined)

  return <WorkbenchFrame title="账号与密钥" description="密钥只进不出，模型只看得到名字" flush {...work}
    actions={<button className="cv-btn cv-btn-primary !h-8" onClick={() => { setCreating(true); setEditing(undefined); navigate('/resources') }}><Plus {...icon} size={14} />新建资源</button>}>
    <div className="flex min-h-0 w-full">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-[var(--line)]" aria-label="资源列表">
        <div className="space-y-2 p-3">
          <label className="flex h-9 items-center gap-2 rounded-[10px] bg-[var(--surface-2)] px-3 shadow-[inset_0_0_0_1px_var(--line)] focus-within:shadow-[0_0_0_2px_var(--blue)]"><Search {...icon} size={14} className="text-[var(--ink-faint)]" />
            <input className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--ink-faint)]" aria-label="搜索资源" placeholder="名称、别名、项目、域名…" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <select className="cv-input !h-8 text-[12.5px]" aria-label="筛选项目" value={projectId} onChange={event => setProjectId(event.target.value)}><option value="">全部项目</option>{work.data?.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
            <select className="cv-input !h-8 text-[12.5px]" aria-label="筛选环境" value={environment} onChange={event => setEnvironment(event.target.value)}><option value="">全部环境</option>{[...new Set(work.data?.resources.map(resource => resource.environment) ?? [])].map(value => <option key={value}>{value}</option>)}</select>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {resources.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-[var(--ink-faint)]">{query || projectId || environment ? '没有匹配的资源' : '还没有资源'}</p>}
          {resources.map((resource, index) => {
            const Icon = KIND_ICON[resource.kind] ?? KeyRound, flags = resource.state === 'revoked' ? ['已撤销'] : issues(resource.id)
            return <button key={resource.id} style={{ '--i': Math.min(index, 12) } as React.CSSProperties} onClick={() => { setCreating(false); setEditing(undefined); navigate('/resources/' + resource.id) }}
              className={`cv-rise flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors ${id === resource.id ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--hover)]'}`}>
              <span className="cv-icon-slot"><Icon {...icon} size={14} /></span>
              <span className="min-w-0 flex-1"><span className={`block truncate text-[13.5px] ${resource.state === 'revoked' ? 'text-[var(--ink-faint)] line-through' : ''}`}>{resource.name}</span>
                <span className="block truncate text-xs text-[var(--ink-faint)]">{projectName(resource)} · {RESOURCE_LABELS[resource.kind]} · {resource.fields.length} 个字段</span></span>
              {flags.length > 0 && <span className={`cv-badge ${resource.state === 'revoked' ? '' : 'cv-badge-warn'}`}>{flags[0]}</span>}
            </button>
          })}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[680px] px-8 py-7">
          {work.data && editing ? <ResourceEditor key={editing.id} data={work.data} busy={work.busy} act={work.act} initial={editing} onSaved={() => setEditing(undefined)} onCancel={() => setEditing(undefined)} />
            : creating ? <div className="cv-rise"><h2 className="text-[17px] font-semibold tracking-[-.015em]">新建资源</h2><p className="mb-5 mt-1 text-[13px] text-[var(--ink-faint)]">随便粘贴一段账号、密码、密钥，本机先拆好字段；AI 只看格式，不看值。</p>
              <ResourceIntake onCancel={() => setCreating(false)} onSaved={resource => { setCreating(false); navigate('/resources/' + resource.id); void work.act(async () => true, '资源已保存') }} /></div>
            : selected ? <ResourceDetail key={selected.id} resource={selected} project={projectName(selected)} health={health.find(item => item.resourceId === selected.id)?.issues ?? []} busy={work.busy}
              history={histories[selected.id]} loadHistory={() => void work.act(async () => { const data = await unwrap(window.api.workbench.resourceHistory(selected.id)); setHistories(old => ({ ...old, [selected.id]: data })) })}
              copy={field => copyField(selected, field)} act={work.act} edit={() => edit(selected)}
              revoke={() => void work.act(async () => { if (await confirm({ title: '撤销资源', message: '撤销后不能复制或用于新请求，历史版本仍保留。', confirmText: '确认撤销', variant: 'danger' })) await unwrap(window.api.workbench.revokeResource(selected.id)) })} />
            : <div className="space-y-6">
              <button onClick={() => setCreating(true)} className="cv-rise cv-card-spot group flex w-full items-center gap-4 rounded-[16px] p-5 text-left shadow-[0_0_0_1px_var(--line),var(--shadow-sm)] transition-transform duration-300 hover:-translate-y-0.5"
                onPointerMove={event => { const box = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--mx', `${event.clientX - box.left}px`); event.currentTarget.style.setProperty('--my', `${event.clientY - box.top}px`) }}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-[var(--primary)] text-[var(--primary-foreground)]"><KeyRound size={18} strokeWidth={1.75} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{resources.length ? '把新的账号和密钥交给这里' : '把常用账号和密钥交给这里'}</span><span className="mt-0.5 block text-[13px] text-[var(--ink-faint)]">粘贴一段资料并说一句用途，本地整理字段，检查后加密保存。之后每个字段都能单独复制、依次粘贴。</span></span>
                <Plus {...icon} className="text-[var(--ink-faint)] transition-transform duration-300 group-hover:rotate-90" /></button>
              {work.data && <section className="cv-rise" style={{ '--i': 1 } as React.CSSProperties}><ModelSettings onSaved={() => void work.refresh()} /></section>}
              <details className="cv-rise group rounded-[14px] shadow-[inset_0_0_0_1px_var(--line)]" style={{ '--i': 2 } as React.CSSProperties}><summary className="flex cursor-pointer list-none items-center px-4 py-3 text-[13.5px] [&::-webkit-details-marker]:hidden">从现有凭证导入副本<span className="ml-auto text-[var(--ink-faint)] transition-transform group-open:rotate-90">›</span></summary>
                <div className="space-y-2 border-t border-[var(--line)] p-4"><p className="text-xs text-[var(--ink-faint)]">旧凭证和 TOTP 关联会保留。导入后，两个版本分别管理。</p><button className="cv-btn cv-btn-secondary" disabled={work.busy} onClick={() => void work.act(async () => { const result = await unwrap(window.api.credential.list({ limit: 5000 })); setLegacy(result.items) })}>读取现有凭证</button>
                  <div className="flex flex-wrap gap-1.5">{legacy.map(item => <button key={item.id} className="cv-badge hover:bg-[var(--hover)]" disabled={work.busy} onClick={() => void work.act(() => unwrap(window.api.workbench.importCredential(item.id)), '已导入资源副本')}>{item.name} · 导入</button>)}</div></div></details>
              <details className="cv-rise group rounded-[14px] shadow-[inset_0_0_0_1px_var(--line)]" style={{ '--i': 3 } as React.CSSProperties}><summary className="flex cursor-pointer list-none items-center px-4 py-3 text-[13.5px] [&::-webkit-details-marker]:hidden">数据导入与导出<span className="ml-auto text-[var(--ink-faint)] transition-transform group-open:rotate-90">›</span></summary><div className="border-t border-[var(--line)] p-4"><DailyDataPanel busy={work.busy} act={work.act} /></div></details>
            </div>}
        </div>
      </section>
    </div>
  </WorkbenchFrame>
}

function ResourceDetail({ resource, project, health, busy, history, loadHistory, copy, act, edit, revoke }: {
  resource: WorkResource; project: string; health: ResourceHealth['issues']; busy: boolean; history?: Array<{ name: string; version: number; createdAt: number }>
  loadHistory: () => void; copy: (field: string) => Promise<boolean>; act: ReturnType<typeof useWorkbench>['act']; edit: () => void; revoke: () => void
}): JSX.Element {
  const revoked = resource.state === 'revoked', Icon = KIND_ICON[resource.kind] ?? KeyRound
  const canSequence = !revoked && resource.fields.some(field => field.role === 'username' || field.role === 'password')
  return <article className="space-y-6">
    <header className="cv-rise flex items-start gap-4">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[var(--surface-2)] text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--line)]"><Icon size={20} strokeWidth={1.5} /></span>
      <div className="min-w-0 flex-1">
        <h2 className={`truncate text-[19px] font-semibold tracking-[-.02em] ${revoked ? 'text-[var(--ink-faint)] line-through' : ''}`}>{resource.name}</h2>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><span className="cv-badge">{RESOURCE_LABELS[resource.kind]}</span><span className="cv-badge">{project}</span><span className="cv-badge font-mono">{resource.environment}</span><span className="cv-badge font-mono">v{resource.version}</span>{revoked && <span className="cv-badge">已撤销</span>}{resource.state === 'verified' && <span className="cv-badge cv-badge-ok">已验证</span>}</div>
      </div>
    </header>
    {health.map((issue, index) => <p key={index} className="cv-rise flex items-center gap-2 rounded-[10px] bg-[var(--warn-soft)] px-3.5 py-2 text-[13px] text-[var(--state-waiting)]">{issue.text}</p>)}
    {resource.purpose && <p className="cv-rise whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--ink-soft)]" style={{ '--i': 1 } as React.CSSProperties}>{resource.purpose}</p>}
    {resource.state === 'verified' && resource.verification && <Link className="text-xs text-[var(--blue)] hover:underline" to={`/workbench?task=${encodeURIComponent(resource.verification.taskId)}`}>此端点上次响应匹配：HTTP {resource.verification.status} · {new Date(resource.verification.createdAt).toLocaleString()} · 查看任务</Link>}

    <section className="cv-rise overflow-hidden rounded-[14px] shadow-[0_0_0_1px_var(--line),var(--shadow-sm)]" style={{ '--i': 2 } as React.CSSProperties} aria-label="字段">
      {resource.endpoint && <div className="flex items-center gap-3 px-4 py-2.5"><span className="w-[72px] shrink-0 text-[12.5px] text-[var(--ink-faint)]">地址</span><span className="min-w-0 flex-1 truncate font-mono text-[13px]">{resource.endpoint}</span>
        <button className="flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 text-[12.5px] text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" disabled={busy || revoked} onClick={() => void act(() => unwrap(window.api.workbench.openResource(resource.id)))}><ExternalLink {...icon} size={13} />打开地址</button></div>}
      {resource.fields.map(field => <div key={field.name} className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-2.5 first:border-t-0">
        <span className="w-[72px] shrink-0 truncate text-[12.5px] text-[var(--ink-faint)]" title={field.name}>{ROLE_LABEL[field.role ?? ''] ?? field.name}</span>
        <div className="min-w-0 flex-1">{field.role === 'totp_seed' && !revoked ? <TOTPRing credentialId={resource.id} resource size={80} /> : <p className={`truncate font-mono text-[13.5px] ${field.secret ? 'tracking-[.2em] text-[var(--ink-soft)]' : ''}`}>{field.secret ? '••••••••' : field.displayValue}</p>}</div>
        <CopyButton label={`复制 ${resource.name} 的 ${field.name}`} disabled={revoked || busy} onCopy={() => copy(field.name)} />
      </div>)}
    </section>

    <div className="cv-rise flex flex-wrap gap-2" style={{ '--i': 3 } as React.CSSProperties}>
      {canSequence && <button className="cv-btn cv-btn-primary !h-9" title="按 用户名 → 密码 → 验证码 依次粘贴，Alt+Shift+V 下一项" onClick={() => void act(() => unwrap(window.api.workbench.sequence(resource.id)))}><Play {...icon} size={14} />依次粘贴</button>}
      {resource.kind === 'account' && resource.endpoint && !revoked && <button className="cv-btn cv-btn-secondary !h-9" disabled={busy} onClick={() => void act(() => unwrap(window.api.workbench.login(resource.id)))}><LogIn {...icon} size={14} />登录助手</button>}
      {!revoked && resource.kind !== 'model' && <Link className="cv-btn cv-btn-secondary !h-9" to="/sessions" state={{ projectId: resource.projectId, resourceId: resource.id }}><MessageSquarePlus {...icon} size={14} />用于会话</Link>}
      <span className="flex-1" />
      <button className="cv-btn cv-btn-ghost !h-9" onClick={edit}><PencilLine {...icon} size={14} />编辑 / 更新字段</button>
      {!revoked && <button className="cv-btn cv-btn-ghost !h-9 hover:!text-[var(--destructive)]" disabled={busy} onClick={revoke}><Ban {...icon} size={14} />撤销</button>}
    </div>

    <dl className="cv-rise grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]" style={{ '--i': 4 } as React.CSSProperties}>
      <dt className="text-[var(--ink-faint)]">上次使用</dt><dd className="text-right font-mono">{resource.lastUsedAt ? new Date(resource.lastUsedAt).toLocaleString() : '尚未取用'}</dd>
    </dl>
    <details className="group text-[12.5px]" onToggle={event => { if (event.currentTarget.open) loadHistory() }}><summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-[var(--ink-faint)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden"><span className="transition-transform group-open:rotate-90">›</span>字段版本历史</summary>
      <div className="mt-2 space-y-1">{history?.map(field => <p className="font-mono text-xs text-[var(--ink-faint)]" key={`${field.name}:${field.version}`}>{field.name} · v{field.version} · {new Date(field.createdAt).toLocaleString()} · 值已加密保留</p>)}</div></details>
  </article>
}
