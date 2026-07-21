/**
 * 凭证列表 · 清晰正文
 */

import { useMemo, useRef, useState } from 'react'
import type { Credential } from '@/types'
import { getCredentialTypeMeta } from '@/types'
import {
  Copy,
  Database,
  FileKey,
  KeyRound,
  Lock,
  Star,
  Ticket
} from 'lucide-react'

const typeIcons: Record<string, typeof KeyRound> = {
  api_key: KeyRound,
  database: Database,
  ssh_key: Lock,
  certificate: FileKey,
  token: Ticket,
  password: Lock,
  other: FileKey
}

interface CredentialListProps {
  credentials: Credential[]
  selectedId?: string
  onSelect: (credential: Credential) => void
  onCopy: (credential: Credential) => void
  onDelete?: (credential: Credential) => void
  onToggleFavorite?: (credential: Credential) => void
}

export default function CredentialList({
  credentials,
  selectedId,
  onSelect,
  onCopy,
  onDelete,
  onToggleFavorite
}: CredentialListProps): JSX.Element {
  const [focusIndex, setFocusIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => credentials, [credentials])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIndex((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = items[focusIndex]
      if (c) onSelect(c)
    } else if (e.key === 'Delete' && onDelete) {
      e.preventDefault()
      const c = items[focusIndex]
      if (c) onDelete(c)
    }
  }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="凭证列表"
      tabIndex={0}
      className="outline-none"
      onKeyDown={handleKeyDown}
    >
      <div className="space-y-0.5">
        {items.map((credential, index) => {
          const selected = credential.id === selectedId
          const focused = index === focusIndex
          const Icon = typeIcons[credential.type] ?? KeyRound
          const meta = getCredentialTypeMeta(credential.type)

          return (
            <div
              key={credential.id}
              role="option"
              aria-selected={selected}
              className={`cv-list-row group ${selected || focused ? 'cv-list-row-active' : ''}`}
              onClick={() => {
                setFocusIndex(index)
                onSelect(credential)
              }}
            >
              <div
                className="cv-icon-slot"
                style={{
                  background: selected ? 'var(--primary-soft)' : 'var(--surface)'
                }}
              >
                <Icon size={15} strokeWidth={2.25} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-body truncate text-sm font-semibold text-foreground">
                    {credential.name}
                  </span>
                  {credential.isFavorite ? (
                    <Star
                      size={12}
                      strokeWidth={2.5}
                      className="shrink-0 fill-current"
                      style={{ color: 'var(--primary)' }}
                    />
                  ) : null}
                </div>
                <div className="font-mono mt-0.5 truncate text-[11px] text-muted-foreground">
                  {meta.label}
                  {credential.metadata?.provider
                    ? ` · ${String(credential.metadata.provider)}`
                    : ''}
                </div>
              </div>

              {onToggleFavorite ? (
                <button
                  type="button"
                  className="cv-btn cv-btn-ghost !p-1.5 opacity-0 group-hover:opacity-100"
                  title={credential.isFavorite ? '取消收藏' : '收藏'}
                  aria-label="收藏"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(credential)
                  }}
                >
                  <Star
                    size={13}
                    strokeWidth={2.25}
                    className={credential.isFavorite ? 'fill-current' : ''}
                    style={
                      credential.isFavorite ? { color: 'var(--primary)' } : undefined
                    }
                  />
                </button>
              ) : null}
              <button
                type="button"
                className="cv-btn cv-btn-ghost !p-1.5 opacity-0 group-hover:opacity-100"
                title="复制"
                aria-label={`复制 ${credential.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onCopy(credential)
                }}
              >
                <Copy size={13} strokeWidth={2.25} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
