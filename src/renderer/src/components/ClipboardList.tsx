/**
 * 剪贴板列表 · 清晰正文 + 像素槽图标
 * 图片项支持：复制图片 / 仅路径 / 图+路径
 */

import type { ClipboardItem } from '@/types'
import {
  Clipboard as ClipboardIcon,
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

function TypeIcon({ type }: { type: string }): JSX.Element {
  const props = { size: 15, strokeWidth: 2.25 as const }
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
  items: ClipboardItem[]
  onCopy: (item: ClipboardItem) => void
  onPin: (item: ClipboardItem) => void
  onDelete: (item: ClipboardItem) => void
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
  items,
  onCopy,
  onPin,
  onDelete,
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

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className={`cv-list-row group ${item.isPinned ? 'cv-list-row-active' : ''} ${
            selectedIds?.has(item.id) ? 'ring-1 ring-[var(--primary)]' : ''
          }`}
          onDoubleClick={() => onCopy(item)}
          title="双击按默认偏好复制"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCopy(item)
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
            {item.type === 'image' && item.imageData && (
              <img
                src={item.imageData}
                alt=""
                className="mb-2 max-h-28 max-w-full border-2 border-[var(--line)]"
              />
            )}
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
              <span>{formatTime(item.createdAt)}</span>
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
          </div>

          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
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
