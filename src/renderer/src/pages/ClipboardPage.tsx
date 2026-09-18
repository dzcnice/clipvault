/**
 * 剪贴板 · 类型筛选 / 批量 / 时间清理 / 来源 / 折叠重复
 */

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useClipboard } from '../hooks/useClipboard'
import ClipboardListView, { type ImageCopyMode } from '../components/ClipboardList'
import SearchBar from '../components/SearchBar'
import { useConfirm } from '../components/ConfirmDialog'
import { showPixelToast } from '../components/PixelToast'
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
  const [searchKeyword, setSearchKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [pasteMode, setPasteMode] = useState<'both' | 'path' | 'image'>('both')
  const [hideAfterCopy, setHideAfterCopy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapseDup, setCollapseDup] = useState(false)
  const [monitorOn, setMonitorOn] = useState(true)
  const confirm = useConfirm()

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
    const f: ClipboardFilter = {}
    if (searchKeyword) f.keyword = searchKeyword
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
    if (pinnedOnly) f.pinnedOnly = true
    return Object.keys(f).length ? f : undefined
  }, [searchKeyword, typeFilter, pinnedOnly])

  const [limit, setLimit] = useState(80)
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
    await copyItem(item.id)
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
      message: '确定清空全部历史？置顶与片段不会删除。',
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
      message: '将删除该时间之前的非置顶历史（片段保留）。',
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

  return (
    <div className="flex h-full flex-col">
      <header
        className="border-b-2 border-[var(--line)] px-6 py-5"
        style={{ background: 'var(--surface)' }}
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="cv-kicker mb-1">剪贴板</p>
            <h1 className="cv-page-title">历史背包</h1>
            <p className="cv-page-desc">
              复制即入包 · {MODE_HINT[pasteMode]}
              {!monitorOn ? ' · 监听已暂停' : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleToggleMonitor()}
              className={`cv-btn ${monitorOn ? 'cv-btn-secondary' : 'cv-btn-primary'}`}
            >
              {monitorOn ? '暂停监听' : '开启监听'}
            </button>
            <button type="button" onClick={() => void refresh()} className="cv-btn cv-btn-secondary">
              <RefreshCw size={14} strokeWidth={2.25} />
              刷新
            </button>
            <button
              type="button"
              onClick={() => void handleClearHistory()}
              className="cv-btn cv-btn-danger"
            >
              <Trash2 size={14} strokeWidth={2.25} />
              清空
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] flex-1">
            <SearchBar
              placeholder="搜索历史内容…"
              value={searchKeyword}
              onChange={setSearchKeyword}
            />
          </div>
          <span className="cv-badge font-mono-num">{total} 条</span>
          {pinnedCount > 0 ? (
            <span className="cv-badge cv-badge-accent font-mono-num">{pinnedCount} 置顶</span>
          ) : null}
          <span className="cv-badge font-mono text-[10px]">
            {pasteMode === 'both' ? '图+路径' : pasteMode === 'path' ? '仅路径' : '仅图片'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {TYPE_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`cv-btn text-[11px] !px-2 !py-1 ${
                typeFilter === chip.id ? 'cv-btn-primary' : 'cv-btn-ghost'
              }`}
              onClick={() => setTypeFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
          <button
            type="button"
            className={`cv-btn text-[11px] !px-2 !py-1 ${
              pinnedOnly ? 'cv-btn-primary' : 'cv-btn-ghost'
            }`}
            onClick={() => setPinnedOnly((v) => !v)}
          >
            仅置顶
          </button>
          <button
            type="button"
            className={`cv-btn text-[11px] !px-2 !py-1 ${
              collapseDup ? 'cv-btn-primary' : 'cv-btn-ghost'
            }`}
            onClick={() => setCollapseDup((v) => !v)}
          >
            折叠重复
          </button>
          {CLEAN_OPTIONS.map((c) => (
            <button
              key={c.label}
              type="button"
              className="cv-btn cv-btn-ghost text-[11px] !px-2 !py-1"
              onClick={() => void handleCleanOlder(c.ms, c.label)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
            <span className="text-xs font-medium">已选 {selected.size}</span>
            <button
              type="button"
              className="cv-btn cv-btn-ghost text-[11px] !px-2 !py-1"
              onClick={() => void handleBatchPin(true)}
            >
              批量置顶
            </button>
            <button
              type="button"
              className="cv-btn cv-btn-ghost text-[11px] !px-2 !py-1"
              onClick={() => void handleBatchPin(false)}
            >
              取消置顶
            </button>
            <button
              type="button"
              className="cv-btn cv-btn-danger text-[11px] !px-2 !py-1"
              onClick={() => void handleBatchDelete()}
            >
              批量删除
            </button>
            <button
              type="button"
              className="cv-btn cv-btn-ghost text-[11px] !px-2 !py-1"
              onClick={() => setSelected(new Set())}
            >
              取消选择
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {loading && items.length === 0 && !error ? (
          <div className="cv-empty">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
            <span className="font-body text-sm">加载中…</span>
          </div>
        ) : error && items.length === 0 ? (
          <div className="cv-empty" style={{ color: 'var(--destructive)' }}>
            {error}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="cv-empty">
            <div
              className="cv-icon-slot !h-16 !w-16"
              style={{ background: 'var(--primary-soft)' }}
            >
              <ClipboardList size={28} strokeWidth={2} />
            </div>
            <p className="font-pixel text-base font-bold text-foreground">
              {searchKeyword ? '没有匹配' : '箱子是空的'}
            </p>
            <p className="font-body max-w-xs text-sm text-muted-foreground">
              {searchKeyword || typeFilter !== 'all' || pinnedOnly
                ? '换个筛选条件试试'
                : '去任意窗口复制文字或截图，内容会出现在这里。Alt+Space 可快速搜索粘贴。'}
            </p>
          </div>
        ) : (
          <>
            <ClipboardListView
              items={displayItems}
              onCopy={(item) => void handleCopy(item)}
              onCopyImage={(item, mode) => void handleCopyImage(item, mode)}
              onPin={(item) => void pinItem(item.id)}
              onDelete={(item) => void deleteItem(item.id)}
              selectedIds={selected}
              onToggleSelect={toggleSelect}
              duplicateOf={duplicateOf}
            />
            {total > items.length ? (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  className="cv-btn cv-btn-secondary text-xs"
                  onClick={() => setLimit((n) => n + 80)}
                >
                  加载更多（{items.length}/{total}）
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
