/**
 * 剪贴板列表 · 清晰正文 + 像素槽图标
 * 图片项支持：复制图片 / 仅路径 / 图+路径
 */

import { useEffect, useState } from 'react'
import type { ClipboardItem } from '@/types'
import ClipboardOccurrences from './ClipboardOccurrences'
import {
  Clipboard as ClipboardIcon,
  Bookmark,
  Code2,
  Copy,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Pin,
  Shield,
  Trash2
} from 'lucide-react'

export type ImageCopyMode = 'image' | 'path' | 'both'

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}

export function ClipThumb({
  id,
  imageData
}: {
  id: string
  imageData?: string
}): JSX.Element | null {
  const [thumbnail, setThumbnail] = useState<{ id: string; src: string } | null>(null)
  const src = imageData ?? (thumbnail?.id === id ? thumbnail.src : undefined)
  useEffect(() => {
    if (imageData) {
      return
    }
    let cancelled = false
    void window.api.clipboard
      .getThumbnail?.(id)
      .then((res) => {
        if (!cancelled && res.success && res.data) setThumbnail({ id, src: res.data })
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      cancelled = true
    }
  }, [id, imageData])
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="mb-2 max-h-28 max-w-full border-2 border-[var(--line)]"
    />
  )
}

function TypeIcon({ type }: { type: string }): JSX.Element {
  const props = { size: 14, strokeWidth: 1.75 as const }
  switch (type) {
    case 'image':
      return <ImageIcon {...props} />
    case 'html':
      return <Code2 {...props} />
    case 'file':
      return <FileText {...props} />
    default:
      return <ClipboardIcon {...props} />
  }
}

interface ClipboardListProps {
  onOpen?: (item: ClipboardItem) => void
  focusedId?: string
  items: ClipboardItem[]
  onCopy: (item: ClipboardItem) => void
  onPin: (item: ClipboardItem) => void
  onDelete: (item: ClipboardItem) => void
  onSave?: (item: ClipboardItem) => void
  /** 图片：按模式复制（image | path | both） */
  onCopyImage?: (item: ClipboardItem, mode: ImageCopyMode) => void
  /** @deprecated 使用 onCopyImage(..., 'path') */
  onCopyPath?: (item: ClipboardItem) => void
  /** 多选：选中 id 集合 */
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  /** 折叠重复：同 hash 仅展示首条时的提示 */
  duplicateOf?: Map<string, number>
}

export default function ClipboardList({
  onOpen, focusedId,
  items,
  onCopy,
  onPin,
  onDelete,
  onSave,
  onCopyImage,
  onCopyPath,
  selectedIds,
  onToggleSelect,
  duplicateOf
}: ClipboardListProps): JSX.Element {
  const handleImageMode = (item: ClipboardItem, mode: ImageCopyMode): void => {
    if (onCopyImage) {
      onCopyImage(item, mode)
      return
    }
    if (mode === 'path' && onCopyPath) {
      onCopyPath(item)
      return
    }
    onCopy(item)
  }

  if (onOpen) return <div aria-label="剪贴板记录" className="space-y-0.5">{items.map((item, index) => {
    const active = focusedId === item.id, picked = selectedIds?.has(item.id) ?? false, mono = ['code', 'error', 'command', 'path', 'link'].includes(item.category || '')
    return <div key={item.id} style={{ '--i': Math.min(index, 12) } as React.CSSProperties} className={`cv-rise group flex items-center gap-2 rounded-[10px] pl-2 pr-3 transition-colors ${active ? 'bg-[var(--primary-soft)]' : picked ? 'bg-[var(--active)]' : 'hover:bg-[var(--hover)]'}`}>
      <input className="h-3.5 w-3.5 shrink-0 accent-[var(--blue)] opacity-40 transition-opacity checked:opacity-100 group-hover:opacity-100" type="checkbox" aria-label={`选择记录 ${index + 1}`} checked={picked} onChange={() => onToggleSelect?.(item.id)} />
      <button className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={() => onOpen(item)} onDoubleClick={() => onCopy(item)}>
        <span className="cv-icon-slot">{item.isPinned ? <Pin size={14} strokeWidth={1.75} /> : <TypeIcon type={item.category === 'code' ? 'html' : item.type} />}</span>
        <span className="min-w-0 flex-1"><span className={`block truncate text-[13.5px] ${mono ? 'font-mono text-[13px]' : ''}`}>{['secret', 'credential'].includes(item.category || '') ? '敏感资料 · ••••••' : item.aiMeta?.title || item.preview || item.content || '[图片]'}</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--ink-faint)]">{item.sourceApp || '未知来源'}{(item.copyCount || 1) > 1 ? ` · 复制 ${item.copyCount} 次` : ''}{item.isPinned ? ' · 置顶' : ''}</span></span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-[var(--ink-faint)]">{formatTime(item.lastCopiedAt || item.createdAt)}<span className={`cv-kbd transition-opacity ${index < 9 ? (active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100') : 'invisible'}`}>{index < 9 ? index + 1 : '·'}</span></span>
      </button></div>
  })}</div>

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className={`cv-list-row group ${item.isPinned ? 'cv-list-row-active' : ''} ${
            selectedIds?.has(item.id) ? 'ring-1 ring-[var(--primary)]' : ''
          }`}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest('button, input, summary, details')) onCopy(item)
          }}
          title="双击按默认偏好复制"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && e.key === 'Enter') onCopy(item)
          }}
        >
          {onToggleSelect ? (
            <input
              type="checkbox"
              className="mx-1 h-4 w-4 shrink-0"
              checked={selectedIds?.has(item.id) ?? false}
              onChange={(e) => {
                e.stopPropagation()
                onToggleSelect(item.id)
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label="选择"
            />
          ) : null}
          <div
            className="cv-icon-slot"
            style={{
              background: item.isPinned ? 'var(--primary-soft)' : 'var(--surface-2)'
            }}
          >
            {item.isPinned ? (
              <Pin size={15} strokeWidth={2.5} className="fill-current" />
            ) : (
              <TypeIcon type={item.type} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            {item.type === 'image' ? (
              <ClipThumb id={item.id} imageData={item.imageData} />
            ) : null}
            {(item.type === 'text' || item.type === 'html') && (
              <div className="font-body line-clamp-3 whitespace-pre-wrap break-all text-[13.5px] leading-relaxed text-foreground">
                {item.preview}
              </div>
            )}
            {item.type === 'file' && (
              <div className="truncate font-mono text-sm text-foreground">{item.filePath}</div>
            )}
            {item.type === 'image' && item.imagePath ? (
              <div
                className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
                title={item.imagePath}
              >
                {item.imagePath}
              </div>
            ) : null}

            <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span title={new Date(item.lastCopiedAt ?? item.createdAt).toLocaleString()}>最近复制 {formatTime(item.lastCopiedAt ?? item.createdAt)}</span>
              {item.isSaved ? <span className="cv-badge">长期保存</span> : null}
              <span>·</span>
              <span className="font-mono-num">
                {item.size > 1024
                  ? `${(item.size / 1024).toFixed(1)} KB`
                  : `${item.size} B`}
              </span>
              {item.sourceApp ? (
                <>
                  <span>·</span>
                  <span title="来源应用">{item.sourceApp}</span>
                </>
              ) : null}
              {duplicateOf?.get(item.hash) && (duplicateOf.get(item.hash) ?? 0) > 1 ? (
                <>
                  <span>·</span>
                  <span className="text-amber-600">×{duplicateOf.get(item.hash)} 相似</span>
                </>
              ) : null}
              {item.type === 'image' ? (
                <>
                  <span>·</span>
                  <span className="font-semibold" style={{ color: 'var(--primary-hover)' }}>
                    截图
                  </span>
                </>
              ) : null}
              {item.detectedKeyType ? (
                <>
                  <span>·</span>
                  <span
                    className="inline-flex items-center gap-1 font-semibold"
                    style={{ color: 'var(--primary-hover)' }}
                  >
                    <Shield size={11} strokeWidth={2.5} />
                    密钥
                  </span>
                </>
              ) : null}
            </div>
            {!item.isSnippet ? <ClipboardOccurrences item={item} /> : null}
          </div>

          <div className="flex max-w-24 shrink-0 flex-wrap items-center justify-end gap-0.5 opacity-100 sm:max-w-none sm:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            {onSave && !item.isSaved && !item.isSnippet ? <button type="button" className="cv-btn cv-btn-ghost !p-1.5" title="长期保存独立副本" aria-label="长期保存" onClick={(e) => { e.stopPropagation(); onSave(item) }}><Bookmark size={14} strokeWidth={2.25} /></button> : null}
            {item.type === 'image' ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImageMode(item, 'image')
                  }}
                  className="cv-btn cv-btn-ghost !p-1.5"
                  title="仅复制图片"
                  aria-label="仅复制图片"
                >
                  <ImageIcon size={14} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImageMode(item, 'path')
                  }}
                  className="cv-btn cv-btn-ghost !p-1.5"
                  title="仅复制本地路径（终端/CLI）"
                  aria-label="仅复制路径"
                >
                  <FolderOpen size={14} strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImageMode(item, 'both')
                  }}
                  className="cv-btn cv-btn-ghost !p-1.5"
                  title="图 + 路径（默认双写）"
                  aria-label="图加路径"
                >
                  <Images size={14} strokeWidth={2.25} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onCopy(item)
                }}
                className="cv-btn cv-btn-ghost !p-1.5"
                title="复制"
                aria-label="复制"
              >
                <Copy size={14} strokeWidth={2.25} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPin(item)
              }}
              className="cv-btn cv-btn-ghost !p-1.5"
              title={item.isPinned ? '取消置顶' : '置顶'}
            >
              <Pin
                size={14}
                strokeWidth={2.25}
                className={item.isPinned ? 'fill-current' : undefined}
              />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(item)
              }}
              className="cv-btn cv-btn-ghost !p-1.5 hover:text-[var(--destructive)]"
              title="删除"
              aria-label="删除"
            >
              <Trash2 size={14} strokeWidth={2.25} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
