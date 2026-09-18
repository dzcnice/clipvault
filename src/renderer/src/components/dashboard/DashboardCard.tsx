/**
 * Dashboard 通用卡片容器 · 像素壳（cv-panel）
 */

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  icon?: LucideIcon
  accent?: string
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyNode?: ReactNode
  emptyText?: string
  footer?: ReactNode
  children?: ReactNode
  onClick?: () => void
  className?: string
}

const DEFAULT_ACCENT = 'var(--primary)'

export function DashboardCard({
  title,
  subtitle,
  icon: Icon,
  accent = DEFAULT_ACCENT,
  loading,
  error,
  empty,
  emptyNode,
  emptyText = '暂无数据',
  footer,
  children,
  onClick,
  className = ''
}: Props): JSX.Element {
  const clickable = Boolean(onClick)

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`group relative cv-panel p-5 ${clickable ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-pixel text-sm font-bold" style={{ color: 'var(--ink)' }}>
            {title}
          </h3>
          {subtitle ? (
            <p
              className="mt-1 font-body text-[11px] leading-relaxed"
              style={{ color: 'var(--ink-faint)' }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {Icon ? (
          <div
            className="cv-icon-slot shrink-0"
            style={{ background: 'var(--primary-soft)', color: accent }}
          >
            <Icon size={16} strokeWidth={2.25} aria-hidden />
          </div>
        ) : null}
      </div>

      <div>
        {loading ? (
          <div
            className="flex min-h-[4.5rem] items-center justify-center gap-2 text-xs"
            style={{ color: 'var(--ink-faint)' }}
          >
            加载中…
          </div>
        ) : error ? (
          <div className="px-1 py-2 font-body text-xs" style={{ color: 'var(--destructive)' }}>
            {error}
          </div>
        ) : empty ? (
          (emptyNode ?? (
            <div className="cv-empty py-8 text-xs">{emptyText}</div>
          ))
        ) : (
          children
        )}
      </div>

      {footer ? (
        <div
          className="mt-4 border-t-2 pt-3 font-body text-[11px]"
          style={{
            borderColor: 'var(--line)',
            color: 'var(--ink-soft)'
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export default DashboardCard
