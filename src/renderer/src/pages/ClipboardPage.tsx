/**
 * 剪贴板 · 可读列表 + 图片三态复制
 */

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useClipboard } from '../hooks/useClipboard'
import ClipboardListView, { type ImageCopyMode } from '../components/ClipboardList'
import SearchBar from '../components/SearchBar'
import { useConfirm } from '../components/ConfirmDialog'
import { showPixelToast } from '../components/PixelToast'
import type { ClipboardItem, ClipboardFilter } from '@/types'

const MODE_HINT: Record<'both' | 'path' | 'image', string> = {
  both: '默认：截图后写入 图片+路径',
  path: '默认：截图后仅写路径（CLI）',
  image: '默认：截图后仅写图片'
}

export default function ClipboardPage(): JSX.Element {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [pasteMode, setPasteMode] = useState<'both' | 'path' | 'image'>('both')
  const confirm = useConfirm()

  useEffect(() => {
    void window.api.prefs?.get?.().then((res) => {
      if (res.success && res.data?.imagePasteMode) {
        setPasteMode(res.data.imagePasteMode)
      }
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

  const filter: ClipboardFilter | undefined = useMemo(
    () => (searchKeyword ? { keyword: searchKeyword } : undefined),
    [searchKeyword]
  )

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
  } = useClipboard({ filter, limit: 200, workspace: 'personal' })

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
  }

  const handleCopyImage = async (
    item: ClipboardItem,
    mode: ImageCopyMode
  ): Promise<void> => {
    try {
      if (mode === 'path') {
        const res = await window.api.clipboard.copyPath(item.id)
        if (res.success) showPixelToast('路径已复制，可贴到终端')
        else showPixelToast(res.error || '无本地路径')
        return
      }
      const res = await window.api.clipboard.copyItem(item.id, { mode })
      if (res.success) {
        showPixelToast(mode === 'both' ? '图片+路径已复制' : '图片已复制')
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
            </p>
          </div>
          <div className="flex items-center gap-2">
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
        ) : items.length === 0 ? (
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
              {searchKeyword
                ? '换个关键词试试'
                : '去任意窗口复制或截图，内容会出现在这里'}
            </p>
          </div>
        ) : (
          <ClipboardListView
            items={items}
            onCopy={(item) => void handleCopy(item)}
            onCopyImage={(item, mode) => void handleCopyImage(item, mode)}
            onPin={(item) => void pinItem(item.id)}
            onDelete={(item) => void deleteItem(item.id)}
          />
        )}
      </div>
    </div>
  )
}
