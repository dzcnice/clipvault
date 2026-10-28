import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { MessageSquarePlus, ClipboardList, Inbox, KeyRound, Ellipsis, Settings, PanelLeftClose, PanelLeftOpen, Search, History, Pin, PinOff, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { useConfirm } from '../components/ConfirmDialog'
import TitleBar from '../components/TitleBar'
import ClipIsland from '../components/ClipIsland'
import { SidebarUpdateButton } from '../components/SidebarUpdateButton'
import type { HostSessionSummary } from '@/types/session'
import type { WorkProject, WorkTask } from '@/types/workbench'

const nav = [
  { path: '/sessions', label: '新会话', Icon: MessageSquarePlus },
  { path: '/clipboard', label: '剪贴板', Icon: ClipboardList },
  { path: '/inbox', label: '收件箱', Icon: Inbox },
  { path: '/resources', label: '资源', Icon: KeyRound }
]
const stateText = { idle: '就绪', starting: '启动中', running: '进行中', waiting_user: '等你确认', stopping: '停止中', stopped: '已停止', failed: '未完成', queued: '排队中' }
const dotClass = (state: HostSessionSummary['state']): string => state === 'failed' ? 'cv-dot-failed' : state === 'waiting_user' ? 'cv-dot-waiting' : ['running', 'starting', 'queued'].includes(state) ? 'cv-dot-running' : 'cv-dot-idle'
const icon = { size: 16, strokeWidth: 1.75 }

export default function MainLayout(): JSX.Element {
  const navigate = useNavigate(), location = useLocation()
  const [collapsed, setCollapsed] = useState(false), [sessions, setSessions] = useState<HostSessionSummary[]>([]), [projects, setProjects] = useState<WorkProject[]>([])
  const [version, setVersion] = useState(''), [error, setError] = useState(''), [model, setModel] = useState<{ name: string; host: string } | null>(null)
  const [inboxCount, setInboxCount] = useState(0), [legacy, setLegacy] = useState<WorkTask[]>([])
  const navRef = useRef<HTMLElement>(null), glideRef = useRef<HTMLSpanElement>(null)

  // Alt+Shift+S 截图问 AI：浮窗不可用时回到主窗口，带着截图开一个新会话草稿。
  useEffect(() => window.api.clipboard?.onCapture?.(id => navigate('/sessions', { state: { mentions: [{ kind: 'clipboard', id, label: '截图 / 图片' }], text: '这张截图里有什么？' } })), [navigate])
  useEffect(() => { let alive = true; const update = (): void => { void window.api.workbench?.inbox?.().then(result => { if (alive && result.success && result.data) setInboxCount(result.data.length) }).catch(() => {}) }; update(); const off = window.api.workbench?.onInboxChanged?.(update); return () => { alive = false; off?.() } }, [])
  useEffect(() => {
    let alive = true
    const update = (): void => { void window.api.workbench?.modelService?.().then(result => { if (alive && result.success && result.data) setModel(result.data.configured ? { name: result.data.model, host: (() => { try { return new URL(result.data!.endpoint).hostname.replace(/^api\./, '') } catch { return '' } })() } : null) }).catch(() => {}) }
    update(); const off = window.api.workbench?.onChanged?.(update)
    return () => { alive = false; off?.() }
  }, [])
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined
    const update = (): void => {
      if (!window.sessionAPI?.list) return
      void window.sessionAPI.list().then(items => { if (alive) { setSessions(items); setError('') } }).catch(() => { if (alive) setError('会话列表暂不可用') })
    }
    update()
    const off = window.sessionAPI?.onChanged?.(() => { if (!timer) timer = setTimeout(() => { timer = undefined; update() }, 200) })
    void window.api?.workbench?.quickIndex?.().then(result => { if (alive && result.success && result.data) { setProjects(result.data.projects); setLegacy(result.data.tasks ?? []) } }).catch(() => {})
    void window.api?.system?.getVersion?.().then(result => { if (alive && result.success && result.data) setVersion(result.data.version) }).catch(() => {})
    const key = (event: KeyboardEvent): void => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); navigate('/sessions') } }
    window.addEventListener('keydown', key)
    return () => { alive = false; off?.(); clearTimeout(timer); window.removeEventListener('keydown', key) }
  }, [navigate])
  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]'), glide = glideRef.current
    if (!glide) return
    if (active) glide.style.transform = `translateY(${active.offsetTop}px)`
    glide.style.opacity = active ? '1' : '0'
  }, [location.pathname, collapsed])

  const visible = sessions.filter(item => !item.archived), pinned = visible.filter(item => item.pinned), archived = sessions.filter(item => item.archived)
  const groups = [...new Set(visible.filter(item => !item.pinned).map(item => item.projectId))]
  const confirm = useConfirm()
  const sessionAction = (action: () => Promise<unknown>): void => { void action().catch(err => setError(err instanceof Error ? err.message : '操作失败')) }
  const remove = (item: HostSessionSummary): void => sessionAction(async () => {
    if (!await confirm({ title: '删除会话', message: `「${item.title}」的消息、执行记录和提醒都会删除，不能恢复。项目文件不受影响。`, confirmText: '删除', variant: 'danger' })) return
    await window.sessionAPI.remove(item.id)
    if (location.pathname === '/sessions/' + item.id) navigate('/sessions')
  })
  const row = (item: HostSessionSummary, index: number): JSX.Element => <div key={item.id} className="group relative">
    <NavLink title={stateText[item.state]} to={'/sessions/' + item.id} style={{ '--i': index } as React.CSSProperties}
      className={({ isActive }) => `cv-rise flex h-8 items-center gap-2.5 rounded-[9px] pl-2.5 pr-2 text-[13px] transition-colors ${isActive ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]' : 'text-[var(--ink-soft)] hover:bg-[var(--hover)]'}`}>
      <span aria-label={stateText[item.state]} className={`cv-dot ${dotClass(item.state)}`} /><span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.pendingApprovals > 0 && <span className="font-mono text-[11px] text-[var(--state-waiting)] group-hover:hidden">{item.pendingApprovals}</span>}
    </NavLink>
    <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-[7px] bg-[var(--surface)] p-0.5 shadow-[var(--shadow-sm)] group-hover:flex group-focus-within:flex">
      {item.archived ? <button type="button" title="取消归档" aria-label={`取消归档 ${item.title}`} className="grid h-6 w-6 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" onClick={() => sessionAction(() => window.sessionAPI.setFlags({ sessionId: item.id, archived: false }))}><ArchiveRestore size={13} strokeWidth={1.8} /></button> : <>
        <button type="button" title={item.pinned ? '取消置顶' : '置顶'} aria-label={`${item.pinned ? '取消置顶' : '置顶'} ${item.title}`} className="grid h-6 w-6 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" onClick={() => sessionAction(() => window.sessionAPI.setFlags({ sessionId: item.id, pinned: !item.pinned }))}>{item.pinned ? <PinOff size={13} strokeWidth={1.8} /> : <Pin size={13} strokeWidth={1.8} />}</button>
        <button type="button" title="归档" aria-label={`归档 ${item.title}`} className="grid h-6 w-6 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]" onClick={() => sessionAction(() => window.sessionAPI.setFlags({ sessionId: item.id, archived: true }))}><Archive size={13} strokeWidth={1.8} /></button>
      </>}
      <button type="button" title="删除" aria-label={`删除 ${item.title}`} className="grid h-6 w-6 place-items-center rounded-[5px] text-[var(--ink-faint)] hover:bg-[var(--bad-soft)] hover:text-[var(--destructive)]" onClick={() => remove(item)}><Trash2 size={13} strokeWidth={1.8} /></button>
    </span>
  </div>
  return <div className="cv-app-shell bg-[var(--background)]">
    <ClipIsland />
    <TitleBar />
    <div className="flex min-h-0 flex-1 pb-2.5 pr-2.5">
      <aside className="cv-main-nav flex shrink-0 flex-col overflow-hidden px-3 transition-[width] duration-300 ease-[cubic-bezier(.16,1,.3,1)]" data-collapsed={collapsed}>
        <div className="flex h-10 items-center gap-2.5 px-1.5">
          <span aria-hidden className="relative h-[22px] w-[22px] shrink-0 overflow-hidden rounded-[7px] bg-[var(--primary)] before:absolute before:inset-[5px_9px_9px_5px] before:rounded-[3px] before:bg-[var(--background)] after:absolute after:inset-[9px_5px_5px_9px] after:rounded-[3px] after:border-[1.6px] after:border-[var(--background)]" />
          {!collapsed && <span className="font-semibold tracking-[-.01em]">ClipVault</span>}
          <button aria-label={collapsed ? '展开侧栏' : '收起侧栏'} className="cv-btn cv-btn-ghost ml-auto !h-7 !px-1.5" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen {...icon} /> : <PanelLeftClose {...icon} />}</button>
        </div>
        <button type="button" title="快速粘贴" onClick={() => void window.api.hud?.toggle?.()} className={`mb-3 mt-2 flex h-9 items-center gap-2 rounded-[10px] bg-[var(--surface)] text-[13px] text-[var(--ink-faint)] shadow-[var(--shadow)] transition-transform duration-200 hover:-translate-y-px ${collapsed ? 'justify-center' : 'pl-3 pr-2'}`}>
          <Search {...icon} size={15} />{!collapsed && <><span className="flex-1 text-left">搜索或粘贴</span><kbd className="cv-kbd">Alt Space</kbd></>}
        </button>
        <nav ref={navRef} aria-label="主导航" className="relative flex flex-col gap-0.5">
          <span ref={glideRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[34px] rounded-[9px] bg-[var(--active)] opacity-0 transition-[transform,opacity] duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]" />
          {nav.map(({ path, label, Icon }) => <NavLink end={path === '/sessions'} to={path} key={path} title={label} aria-label={label}
            className={({ isActive }) => `relative z-[1] flex h-[34px] items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] transition-colors ${isActive ? 'font-medium text-[var(--ink)]' : 'text-[var(--ink-soft)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'}`}>
            <Icon {...icon} />{!collapsed && <span>{label}</span>}
            {path === '/inbox' && inboxCount > 0 && <span className="ml-auto grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--blue)] px-1.5 font-mono text-[11px] font-semibold text-white" aria-label={`${inboxCount} 条建议`}>{inboxCount}</span>}
            {!collapsed && path === '/sessions' && <kbd className="cv-kbd ml-auto">Ctrl N</kbd>}
          </NavLink>)}
        </nav>
        {!collapsed && <nav aria-label="会话列表" className="-mx-1 mt-5 min-h-0 flex-1 overflow-y-auto px-1 pb-4">
          {error && <p role="alert" className="px-2.5 text-xs text-[var(--ink-faint)]">{error}</p>}
          {!sessions.length && !error && <p className="px-2.5 text-xs leading-relaxed text-[var(--ink-faint)]">开始一次会话，历史会保存在这里。</p>}
          {pinned.length > 0 && <section className="mb-4"><h2 className="mb-1 flex items-center gap-1.5 px-2.5 text-xs text-[var(--ink-faint)]"><Pin size={11} strokeWidth={2} />置顶</h2>{pinned.map(row)}</section>}
          {groups.map(projectId => <section key={projectId} className="mb-4">
            <h2 className="mb-1 truncate px-2.5 text-xs text-[var(--ink-faint)]">{projects.find(item => item.id === projectId)?.name ?? '项目会话'}</h2>
            {visible.filter(item => item.projectId === projectId && !item.pinned).map(row)}
          </section>)}
          {archived.length > 0 && <details className="group/archived mb-3"><summary className="flex h-8 cursor-pointer list-none items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] text-[var(--ink-faint)] hover:bg-[var(--hover)] [&::-webkit-details-marker]:hidden"><Archive size={14} strokeWidth={1.75} />已归档 {archived.length}</summary><div className="mt-1">{archived.map(row)}</div></details>}
          <Link to="/history" className="flex h-8 items-center gap-2.5 rounded-[9px] px-2.5 text-[13px] text-[var(--ink-faint)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"><History {...icon} size={15} />搜索会话历史</Link>
          {legacy.length > 0 && <section className="mt-4"><h2 className="mb-1 px-2.5 text-xs text-[var(--ink-faint)]">3.4 历史 · 只读</h2>{legacy.slice(0, 6).map(task => <NavLink to={'/legacy-tasks?task=' + encodeURIComponent(task.id)} key={task.id} className="block h-8 truncate rounded-[9px] px-2.5 text-[13px] leading-8 text-[var(--ink-soft)] hover:bg-[var(--hover)]">{task.title}</NavLink>)}{legacy.length > 6 && <Link to="/legacy-tasks" className="block px-2.5 pt-1 text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]">全部历史任务</Link>}</section>}
        </nav>}
        {collapsed && <div className="flex-1" />}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-[var(--line)] pb-1 pt-2">
          {!collapsed && <Link to="/resources" title="模型服务" className="mb-1 flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--hover)]">
            <span className={`cv-dot ${model ? 'cv-dot-done' : 'cv-dot-idle'}`} style={{ width: 6, height: 6 }} />
            {model ? <><span className="truncate font-mono text-[var(--ink)]">{model.name}</span><span className="truncate text-[var(--ink-faint)]">· {model.host}</span></> : <span>配置模型服务</span>}
          </Link>}
          <div className={`flex ${collapsed ? 'flex-col' : 'items-center'} gap-0.5`}>
            <Link className="cv-sidebar-item flex-1" aria-label="更多" title="更多" to="/more"><Ellipsis {...icon} />{!collapsed && '更多'}</Link>
            <Link className="cv-sidebar-item flex-1" aria-label="设置" title="设置" to="/settings"><Settings {...icon} />{!collapsed && '设置'}</Link>
          </div>
          {!collapsed && <div className="flex items-center justify-between px-2.5 pt-1 text-[11px] text-[var(--ink-faint)]"><span className="truncate">本机存档{version ? ' · v' + version : ''}</span><SidebarUpdateButton /></div>}
        </div>
      </aside>
      <main className="relative min-w-0 flex-1 overflow-hidden rounded-[16px] bg-[var(--surface)] shadow-[var(--shadow)]"><div key={location.pathname.split('/')[1]} className="h-full animate-fadeIn"><Outlet /></div></main>
    </div>
  </div>
}
