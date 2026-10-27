/**
 * 剪贴板 · 类型筛选 / 批量 / 时间清理 / 来源 / 折叠重复
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ClipboardList, RefreshCw, Trash2 } from 'lucide-react'
import { useClipboard } from '../hooks/useClipboard'
import ClipboardListView, { type ImageCopyMode } from '../components/ClipboardList'
import ClipboardDetail from '../components/ClipboardDetail'
import ClipboardOrganize from '../components/ClipboardOrganize'
import type { RecallResult, InboxItem } from '@/types/inbox'
import type { ClipCategory } from '@/types/clipboard'
import type { WorkProject } from '@/types/workbench'
import SearchBar from '../components/SearchBar'
import ClipboardRetention from '../components/ClipboardRetention'
import { useConfirm } from '../components/ConfirmDialog'
import { showPixelToast } from '../components/PixelToast'
import ResourceIntake from '../components/ResourceIntakeReview'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog'
import {
  ClipboardContentType,
  type ClipboardItem,
  type ClipboardFilter
} from '@/types'

const MODE_HINT: Record<'both' | 'path' | 'image', string> = {
  both: '默认：截图后写入 图片+路径',
  path: '默认：截图后仅写路径（CLI）',
  image: '默认：截图后仅写图片'
}

const CATEGORY_LABELS: Record<ClipCategory, string> = { text: '文本', code: '代码', error: '报错', command: '命令', link: '链接', path: '路径', image: '图片', secret: '密钥', credential: '账号资料' }

type TypeFilter = 'all' | 'text' | 'image' | 'html' | 'file'

const TYPE_CHIPS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'text', label: '文本' },
  { id: 'image', label: '图片' },
  { id: 'html', label: 'HTML' },
  { id: 'file', label: '文件' }
]

const CLEAN_OPTIONS: Array<{ label: string; ms: number }> = [
  { label: '清 1 天前', ms: 1 * 24 * 60 * 60 * 1000 },
  { label: '清 7 天前', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '清 30 天前', ms: 30 * 24 * 60 * 60 * 1000 }
]

export default function ClipboardPage(): JSX.Element {
  const [organizeIds, setOrganizeIds] = useState<string[]>(), [recall, setRecall] = useState<RecallResult>(), [forceRecall, setForceRecall] = useState(0)
  const [suggestions, setSuggestions] = useState<InboxItem[]>([])
  const location = useLocation()
  const source = location.state as { taskId?: string; draft?: unknown; followUp?: unknown } | null
  const [category, setCategory] = useState<ClipCategory | ''>(''), [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<WorkProject[]>([]), [focusedId, setFocusedId] = useState('')
  const [groups, setGroups] = useState<{ categories: Record<string, number>; projects: Record<string, number>; total: number; pinned: number; saved: number }>()
  const [searchKeyword, setSearchKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [savedOnly, setSavedOnly] = useState(false)
  const [sourceApp, setSourceApp] = useState('')
  const [days, setDays] = useState(0)
  const [startTime, setStartTime] = useState<number | undefined>()
  const [pasteMode, setPasteMode] = useState<'both' | 'path' | 'image'>('both')
  const [hideAfterCopy, setHideAfterCopy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [intakeClip, setIntakeClip] = useState<string>()
  const [collapseDup, setCollapseDup] = useState(false)
  const [monitorOn, setMonitorOn] = useState(true)
  const confirm = useConfirm()
  useEffect(() => {
    let alive = true
    if (!searchKeyword.trim() || (!forceRecall && !(searchKeyword.length > 6 && /\s/.test(searchKeyword))) || !window.api.workbench?.recall) return
    const timer = window.setTimeout(() => { void window.api.workbench.recall(searchKeyword).then(result => { if (alive && result.success && result.data?.usedAI) setRecall(result.data) }).catch(() => {}) }, 650)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [searchKeyword, forceRecall])
  useEffect(() => { const update = (): void => { void window.api.workbench?.inbox?.().then(result => { if (result.success && result.data) setSuggestions(result.data.filter(item => item.type === 'organize').slice(0, 3)) }).catch(() => {}) }; update(); return window.api.workbench?.onInboxChanged?.(update) }, [])

  useEffect(() => {
    void window.api.prefs?.get?.().then((res) => {
      if (res.success && res.data) {
        if (res.data.imagePasteMode) setPasteMode(res.data.imagePasteMode)
        if (typeof res.data.hideAfterCopy === 'boolean') {
          setHideAfterCopy(res.data.hideAfterCopy)
        }
        if (typeof res.data.clipboardMonitorEnabled === 'boolean') {
          setMonitorOn(res.data.clipboardMonitorEnabled)
        }
      }
    })
    void window.api.clipboard.getMonitorStatus?.().then((res) => {
      if (res.success && res.data) setMonitorOn(res.data.isRunning)
    })

    const off = window.api.events?.on?.(
      'clipboard:image-paste-mode',
      (payload: unknown) => {
        const p = payload as { label?: string; mode?: string } | undefined
        if (p?.label) showPixelToast(p.label)
        if (p?.mode === 'both' || p?.mode === 'path' || p?.mode === 'image') {
          setPasteMode(p.mode)
        }
      }
    )
    return () => {
      off?.()
    }
  }, [])

  const filter: ClipboardFilter | undefined = useMemo(() => {
    const f: ClipboardFilter = { savedOnly }
    if (sourceApp.trim()) f.sourceApp = sourceApp.trim()
    if (startTime) f.startTime = startTime
    if (searchKeyword) f.keyword = searchKeyword
    if (recall?.usedAI) { delete f.keyword; Object.assign(f, recall.filter) }
    if (typeFilter !== 'all') {
      f.type =
        typeFilter === 'text'
          ? ClipboardContentType.TEXT
          : typeFilter === 'image'
            ? ClipboardContentType.IMAGE
            : typeFilter === 'html'
              ? ClipboardContentType.HTML
              : ClipboardContentType.FILE
    }
    if (category) f.category = category
    if (projectId) f.projectId = projectId
    if (pinnedOnly) f.pinnedOnly = true
    return Object.keys(f).length ? f : undefined
  }, [searchKeyword, typeFilter, pinnedOnly, savedOnly, sourceApp, startTime, category, projectId, recall])

  const [limit, setLimit] = useState(80)
  const resetView = (): void => {
    setLimit(80)
    setSelected(new Set())
  }
  const {
    items,
    total,
    loading,
    error,
    refresh,
    deleteItem,
    pinItem,
    copyItem,
    clearHistory
  } = useClipboard({ filter, limit, workspace: 'personal' })

  const focused = items.find(item => item.id === focusedId) ?? items[0]
  useEffect(() => { void window.api.clipboard.groups?.().then(result => { if (result.success) setGroups(result.data) }).catch(() => {}) }, [items])
  useEffect(() => { void window.api.workbench?.quickIndex?.().then(result => { if (result.success && result.data) setProjects(result.data.projects) }).catch(() => {}) }, [])
  const paste = async (item: ClipboardItem): Promise<void> => { try { const result = await window.api.clipboard.copyItem(item.id, { paste: true }); if (!result.success) showPixelToast(result.error || '粘贴失败') } catch { showPixelToast('粘贴失败，请重试') } }
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < 9 && items[index]) { event.preventDefault(); void paste(items[index]) }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  }, [items])

  const duplicateOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      m.set(it.hash, (m.get(it.hash) ?? 0) + 1)
    }
    return m
  }, [items])

  const displayItems = useMemo(() => {
    if (!collapseDup) return items
    const seen = new Set<string>()
    const out: ClipboardItem[] = []
    for (const it of items) {
      if (seen.has(it.hash)) continue
      seen.add(it.hash)
      out.push(it)
    }
    return out
  }, [items, collapseDup])

  const maybeHide = async (): Promise<void> => {
    if (!hideAfterCopy) return
    try {
      await window.api.window?.minimize?.()
    } catch {
      /* optional */
    }
  }

  const handleCopy = async (item: ClipboardItem): Promise<void> => {
    if (!await copyItem(item.id)) return
    if (item.type === 'image') {
      showPixelToast(
        pasteMode === 'path'
          ? '已按偏好复制路径'
          : pasteMode === 'image'
            ? '已按偏好复制图片'
            : '已复制图片+路径'
      )
    } else {
      showPixelToast('已复制')
    }
    await maybeHide()
  }

  const handleCopyImage = async (
    item: ClipboardItem,
    mode: ImageCopyMode
  ): Promise<void> => {
    try {
      if (mode === 'path') {
        const res = await window.api.clipboard.copyPath(item.id)
        if (res.success) {
          showPixelToast('路径已复制，可贴到终端')
          await maybeHide()
        } else {
          showPixelToast(res.error || '无本地路径')
        }
        return
      }
      const res = await window.api.clipboard.copyItem(item.id, { mode })
      if (res.success) {
        showPixelToast(mode === 'both' ? '图片+路径已复制' : '图片已复制')
        await maybeHide()
      } else {
        showPixelToast(res.error || '复制失败')
      }
    } catch {
      showPixelToast('复制失败')
    }
  }

  const handleClearHistory = async (): Promise<void> => {
    const ok = await confirm({
      title: '清空历史',
      message: '确定清空临时历史？置顶、长期保存和片段会保留。',
      confirmText: '清空',
      cancelText: '取消',
      variant: 'danger'
    })
    if (ok) await clearHistory()
  }

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchDelete = async (): Promise<void> => {
    if (selected.size === 0) return
    const ok = await confirm({
      title: '批量删除',
      message: `确定删除选中的 ${selected.size} 条？`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    })
    if (!ok) return
    const res = await window.api.clipboard.deleteItems?.([...selected])
    if (res?.success) {
      showPixelToast(`已删除 ${res.data ?? selected.size} 条`)
      setSelected(new Set())
      await refresh()
    } else {
      showPixelToast(res?.error || '删除失败')
    }
  }

  const handleBatchPin = async (pinned: boolean): Promise<void> => {
    if (selected.size === 0) return
    const res = await window.api.clipboard.batchPin?.({
      ids: [...selected],
      pinned
    })
    if (res?.success) {
      showPixelToast(pinned ? '已置顶' : '已取消置顶')
      setSelected(new Set())
      await refresh()
    } else {
      showPixelToast(res?.error || '操作失败')
    }
  }

  const handleCleanOlder = async (ms: number, label: string): Promise<void> => {
    const ok = await confirm({
      title: label,
      message: '按最近复制时间清理临时历史。置顶、长期保存和片段会保留。',
      confirmText: '清理',
      cancelText: '取消',
      variant: 'danger'
    })
    if (!ok) return
    const res = await window.api.clipboard.deleteOlder?.({
      olderThanMs: ms,
      keepPinned: true
    })
    if (res?.success) {
      showPixelToast(`已清理 ${res.data ?? 0} 条`)
      await refresh()
    } else {
      showPixelToast(res?.error || '清理失败')
    }
  }

  const handleToggleMonitor = async (): Promise<void> => {
    const next = !monitorOn
    const res = await window.api.clipboard.toggleMonitor?.(next)
    if (res?.success) {
      setMonitorOn(next)
      showPixelToast(next ? '已开启剪贴板监听' : '已暂停剪贴板监听')
    } else {
      showPixelToast(res?.error || '切换失败')
    }
  }

  const pinnedCount = items.filter((i) => i.isPinned).length

  const handleSave = async (item: ClipboardItem): Promise<void> => {
    try {
      const res = await window.api.clipboard.saveSnapshot(item.id)
      showPixelToast(res.success ? '已生成长期保存副本' : res.error || '保存失败')
      if (res.success) await refresh()
    } catch {
      showPixelToast('保存失败，请重试')
    }
  }

  const handleDelete = async (item: ClipboardItem): Promise<void> => {
    if (item.isSaved && !await confirm({ title: '删除长期保存', message: '确定删除这个独立保存的副本？', confirmText: '删除', cancelText: '取消', variant: 'danger' })) return
    await deleteItem(item.id)
  }

  const groupButton = (active: boolean): string => `flex h-8 w-full items-center justify-between gap-2 rounded-[8px] px-2.5 text-left text-[13px] transition-colors ${active ? 'bg-[var(--active)] font-medium text-[var(--ink)]' : 'text-[var(--ink-soft)] hover:bg-[var(--hover)] hover:text-[var(--ink)]'}`
  const chip = (active: boolean): string => `h-7 shrink-0 rounded-[8px] px-2.5 text-[12.5px] transition-all duration-200 ${active ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--line)] hover:text-[var(--ink)] hover:bg-[var(--hover)]'}`
  const allActive = !category && !projectId && !pinnedOnly && !savedOnly
  return (
    <div className="flex h-full flex-col">
      {organizeIds && <ClipboardOrganize ids={organizeIds} close={() => setOrganizeIds(undefined)} saved={() => void refresh()} />}
      <Dialog open={!!intakeClip} onOpenChange={open => { if (!open) setIntakeClip(undefined) }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogTitle>从剪贴板保存资源</DialogTitle><DialogDescription>核对名称与字段后保存，原有历史记录保留。</DialogDescription>{intakeClip && <ResourceIntake source={{ clipboardId: intakeClip }} onCancel={() => setIntakeClip(undefined)} onSaved={() => { setIntakeClip(undefined); showPixelToast('资源已保存') }} />}</DialogContent></Dialog>

      <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] pl-6 pr-3">
        <h1 className="text-[14px] font-medium tracking-[-.01em]">{savedOnly ? '长期保存' : '剪贴板'}</h1>
        <span className="truncate text-[13px] text-[var(--ink-faint)]">本机加密 · 不发给模型 · {MODE_HINT[pasteMode].replace('默认：', '')}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => void handleToggleMonitor()} title={monitorOn ? '暂停监听' : '开启监听'}
          className="flex h-7 items-center gap-2 rounded-[8px] px-2.5 text-[12.5px] text-[var(--ink-soft)] shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]">
          <span className={`cv-dot ${monitorOn ? 'cv-dot-running' : 'cv-dot-idle'}`} style={{ width: 6, height: 6 }} />{monitorOn ? '监听中 · 暂停监听' : '已暂停 · 开启监听'}
        </button>
        <button type="button" onClick={() => void refresh()} className="cv-btn cv-btn-ghost !px-2" aria-label="刷新" title="刷新"><RefreshCw size={15} strokeWidth={1.75} /></button>
        <button type="button" onClick={() => void handleClearHistory()} className="cv-btn cv-btn-ghost !px-2 hover:!text-[var(--destructive)]" disabled={savedOnly} aria-label="清空" title="清空临时历史"><Trash2 size={15} strokeWidth={1.75} /></button>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="cv-clipboard-groups shrink-0 space-y-0.5 overflow-auto px-2 py-3" aria-label="剪贴板分组">
          {([['全部', groups?.total, false, false, allActive], ['置顶', groups?.pinned, true, false, pinnedOnly && !savedOnly], ['长期保存', groups?.saved, false, true, savedOnly]] as const).map(([name, count, pin, saved, active]) =>
            <button key={name} aria-pressed={active} className={groupButton(active)} onClick={() => { resetView(); setCategory(''); setProjectId(''); setPinnedOnly(pin); setSavedOnly(saved) }}><span>{name}</span><span className="font-mono text-[11.5px] text-[var(--ink-faint)]">{count ?? 0}</span></button>)}
          <p className="px-2.5 pb-1 pt-4 text-xs text-[var(--ink-faint)]">自动分类</p>
          {Object.entries(CATEGORY_LABELS).map(([key, name]) => <button key={key} aria-pressed={category === key} className={groupButton(category === key)} onClick={() => { resetView(); setCategory(key as ClipCategory); setProjectId(''); setPinnedOnly(false); setSavedOnly(false) }}><span>{name}</span><span className="font-mono text-[11.5px] text-[var(--ink-faint)]">{groups?.categories[key] || 0}</span></button>)}
          {projects.length > 0 && <p className="px-2.5 pb-1 pt-4 text-xs text-[var(--ink-faint)]">按项目</p>}
          {projects.map(project => <button key={project.id} aria-pressed={projectId === project.id} className={groupButton(projectId === project.id)} onClick={() => { resetView(); setProjectId(project.id); setCategory(''); setPinnedOnly(false); setSavedOnly(false) }}><span className="truncate">{project.name}</span><span className="font-mono text-[11.5px] text-[var(--ink-faint)]">{groups?.projects[project.id] || 0}</span></button>)}
        </nav>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="shrink-0 space-y-2.5 px-5 pb-2 pt-4">
            <div className="flex items-center gap-2">
              <div className="min-w-[14rem] flex-1">
                <SearchBar
                  placeholder="搜索内容、来源、路径；按 Ctrl+Enter 用一句话让 AI 找"
                  value={searchKeyword}
                  onChange={(value) => { resetView(); setRecall(undefined); setForceRecall(0); setSearchKeyword(value) }}
                  onAskAI={value => { setRecall(undefined); setSearchKeyword(value); setForceRecall(number => number + 1) }}
                />
              </div>
              <span className="shrink-0 font-mono text-xs text-[var(--ink-faint)]">{total} 条{pinnedCount > 0 ? ` · ${pinnedCount} 置顶` : ''}</span>
            </div>
            {recall?.usedAI && <div className="cv-pop flex flex-wrap items-center gap-1.5 text-xs"><span className="text-[var(--ink-faint)]">AI 理解为</span>{recall.labels.map(label => <button className="cv-badge cv-badge-accent" key={label.key} aria-label={`移除条件 ${label.text}`} onClick={() => setRecall(previous => { if (!previous) return previous; const filter = { ...previous.filter }; delete filter[label.key]; return { ...previous, filter, labels: previous.labels.filter(item => item.key !== label.key) } })}>{label.text} ×</button>)}<span className="text-[var(--ink-faint)]">只发送了查询句和日期、项目名、分类、来源名；未发送历史内容。</span></div>}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {TYPE_CHIPS.map(item => <button key={item.id} type="button" aria-pressed={typeFilter === item.id} className={chip(typeFilter === item.id)} onClick={() => { resetView(); setTypeFilter(item.id) }}>{item.label}</button>)}
              <span className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
              <button type="button" aria-pressed={pinnedOnly} className={chip(pinnedOnly)} onClick={() => { resetView(); setPinnedOnly(v => !v) }}>仅置顶</button>
              <button type="button" aria-pressed={collapseDup} className={chip(collapseDup)} onClick={() => setCollapseDup(v => !v)}>折叠重复</button>
              <span className="flex-1" />
              <span className="cv-badge shrink-0 font-mono">{pasteMode === 'both' ? '图+路径' : pasteMode === 'path' ? '仅路径' : '仅图片'}</span>
            </div>
            <details className="group"><summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-xs text-[var(--ink-faint)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden"><span className="transition-transform duration-300 group-open:rotate-90">›</span>筛选与保留策略</summary>
              <div className="mt-3 space-y-3 rounded-[12px] bg-[var(--surface-2)] p-3 text-xs shadow-[inset_0_0_0_1px_var(--line)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" aria-pressed={savedOnly} className={chip(savedOnly)} onClick={() => { resetView(); setSavedOnly(v => !v) }}>{savedOnly ? '返回临时历史' : '查看长期保存'}</button>
                  {CLEAN_OPTIONS.map(item => <button key={item.label} type="button" className={chip(false)} onClick={() => void handleCleanOlder(item.ms, item.label)}>{item.label}</button>)}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-[var(--ink-soft)]">来源应用 <input aria-label="来源应用" className="cv-input !h-8 !w-40" placeholder="应用全名" value={sourceApp} onChange={(e) => { resetView(); setSourceApp(e.target.value) }} /></label>
                  <label className="flex items-center gap-2 text-[var(--ink-soft)]">最近复制 <select aria-label="最近复制时间" className="cv-input !h-8 !w-auto" value={days} onChange={(e) => { resetView(); const value = Number(e.target.value); setDays(value); setStartTime(value ? Date.now() - value * 86400000 : undefined) }}>
                    <option value={0}>全部时间</option><option value={1}>24 小时内</option><option value={7}>7 天内</option><option value={30}>30 天内</option>
                  </select></label>
                  {savedOnly ? <span className="text-[var(--ink-faint)]">独立保留文本和图片；文件类型仅保存路径引用。</span> : null}
                </div>
                <ClipboardRetention />
              </div>
            </details>
            <label className="block text-xs xl:hidden">分组<select className="cv-input !h-8 !w-auto" value={category} onChange={event => { resetView(); setCategory(event.target.value as ClipCategory | '') }}><option value="">全部分类</option>{Object.entries(CATEGORY_LABELS).map(([key, name]) => <option key={key} value={key}>{name} · {groups?.categories[key] || 0}</option>)}</select></label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-1">
            {suggestions.map(item => <Link key={item.id} className="cv-rise mx-2 mb-2 flex items-center gap-2 rounded-[12px] bg-[var(--primary-soft)] px-3.5 py-2.5 text-[13px] text-[var(--ink)] transition-transform hover:-translate-y-px" to="/inbox"><span className="text-[var(--blue)]">整理建议</span>{item.data.title}<span className="ml-auto text-xs text-[var(--ink-faint)]">查看 →</span></Link>)}
            {error && items.length > 0 ? <p role="alert" className="mx-2 mb-3 text-sm text-[var(--destructive)]">{error}</p> : null}
            {loading && items.length > 0 ? <p role="status" className="cv-shimmer mx-2 mb-2 text-xs">正在查询全部记录…</p> : null}
            {loading && items.length === 0 && !error ? (
              <div className="space-y-1.5 px-2 pt-2" aria-busy="true">
                <span className="sr-only">加载中…</span>
                {Array.from({ length: 7 }, (_, index) => <div key={index} className="flex h-[54px] items-center gap-3 rounded-[10px] px-3" style={{ opacity: 1 - index * .12 }}><span className="h-[30px] w-[30px] rounded-[8px] bg-[var(--surface-2)]" /><span className="flex-1 space-y-2"><span className="block h-3 w-3/5 animate-pulse rounded bg-[var(--surface-2)]" /><span className="block h-2.5 w-1/4 animate-pulse rounded bg-[var(--surface-2)]" /></span></div>)}
              </div>
            ) : error && items.length === 0 ? (
              <div role="alert" className="cv-empty" style={{ color: 'var(--destructive)' }}>{error}</div>
            ) : displayItems.length === 0 ? (
              <div className="cv-empty cv-rise">
                <span className="cv-icon-slot !h-12 !w-12 !rounded-[14px]"><ClipboardList size={22} strokeWidth={1.5} /></span>
                <p className="mt-2 text-[15px] font-medium text-[var(--ink)]">{searchKeyword ? '没有匹配' : '暂无记录'}</p>
                <p className="max-w-xs text-[13px] leading-relaxed">
                  {searchKeyword || typeFilter !== 'all' || pinnedOnly
                    ? '换个筛选条件试试'
                    : savedOnly ? '在临时历史中选择“长期保存”，以后清理历史也能继续使用。' : '去任意窗口复制文字或截图，内容会出现在这里。Alt+Space 可快速搜索粘贴。'}
                </p>
              </div>
            ) : (
              <>
                <ClipboardListView
                  items={displayItems}
                  focusedId={focused?.id}
                  onOpen={item => setFocusedId(item.id)}
                  onCopy={(item) => void handleCopy(item)}
                  onCopyImage={(item, mode) => void handleCopyImage(item, mode)}
                  onPin={(item) => void pinItem(item.id)}
                  onDelete={(item) => void handleDelete(item)}
                  onSave={(item) => void handleSave(item)}
                  selectedIds={selected}
                  onToggleSelect={toggleSelect}
                  duplicateOf={duplicateOf}
                />
                {total > items.length ? (
                  <div className="flex justify-center py-3">
                    <button type="button" className="cv-btn cv-btn-secondary text-xs" onClick={() => setLimit((n) => n + 80)}>加载更多（{items.length}/{total}）</button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {selected.size > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
              <div className="cv-pop pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-[14px] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-lg)]" role="toolbar" aria-label="批量操作">
                <span className="px-2.5 font-mono text-xs text-[var(--ink-soft)]">已选 {selected.size}</span>
                <Link to="/sessions" state={{ clipboardIds: [...selected], taskId: source?.taskId, draft: source?.draft, followUp: source?.followUp }} className="cv-btn cv-btn-primary !h-8">{source?.taskId ? '追加到当前任务' : '用于会话'}</Link>
                <button className="cv-btn cv-btn-ghost !h-8" disabled={selected.size > 30} onClick={() => setOrganizeIds([...selected])}>让 AI 整理</button>
                <button className="cv-btn cv-btn-ghost !h-8" disabled={selected.size !== 1} onClick={() => setIntakeClip([...selected][0])}>选中资料存为资源</button>
                <button className="cv-btn cv-btn-ghost !h-8" onClick={() => void (async () => { for (const item of items.filter(item => selected.has(item.id))) await handleSave(item) })()}>长期保存选中资料</button>
                <button type="button" className="cv-btn cv-btn-ghost !h-8" onClick={() => void handleBatchPin(true)}>批量置顶</button>
                <button type="button" className="cv-btn cv-btn-ghost !h-8" onClick={() => void handleBatchPin(false)}>取消置顶</button>
                <button type="button" className="cv-btn cv-btn-ghost !h-8 hover:!text-[var(--destructive)]" onClick={() => void handleBatchDelete()}>批量删除</button>
                <span className="mx-0.5 h-4 w-px bg-[var(--line)]" />
                <button type="button" className="cv-btn cv-btn-ghost !h-8" onClick={() => setSelected(new Set())}>取消选择</button>
              </div>
            </div>
          )}
        </div>
        {focused && <ClipboardDetail key={focused.id} item={focused} copy={() => void handleCopy(focused)} paste={() => void paste(focused)} pin={() => void pinItem(focused.id)} save={() => void handleSave(focused)} remove={() => void handleDelete(focused)} resource={() => setIntakeClip(focused.id)} image={mode => void handleCopyImage(focused, mode)} />}
      </div>
    </div>
  )
}
