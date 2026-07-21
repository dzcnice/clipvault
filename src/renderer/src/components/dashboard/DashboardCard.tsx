/**
 * Dashboard 通用卡片容器 · v3（CSS 过渡，无 framer-motion）
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

const DEFAULT_ACCENT = 'oklch(0.72 0.14 160)'

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
      className={`group relative overflow-hidden rounded-2xl p-6 transition-all duration-200 ${
        clickable ? 'cursor-pointer hover:-translate-y-0.5' : ''
      } ${className}`}
      style={{
        minHeight: 200,
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.45), rgba(255,255,255,0.18))',
        border: '1px solid rgba(255,255,255,0.35)',
        boxShadow:
          '0 10px 30px -12px rgba(20,30,50,0.18), 0 4px 16px -6px rgba(20,30,50,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)'
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
        style={{ background: accent }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-12 h-40 w-40 rounded-full opacity-15 blur-3xl"
        style={{ background: accent }}
      />

      <div className="relative z-10 mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            className="text-sm font-semibold tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h3>
          {subtitle ? (
            <p
              className="mt-1 text-[11px] leading-relaxed"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>

        {Icon ? (
          <div
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
            style={{
              background: `color-mix(in oklch, ${accent} 20%, transparent)`,
              border: `1px solid color-mix(in oklch, ${accent} 40%, transparent)`,
              boxShadow: `0 4px 12px -4px color-mix(in oklch, ${accent} 40%, transparent)`
            }}
          >
            <Icon size={20} strokeWidth={1.75} style={{ color: accent }} aria-hidden />
          </div>
        ) : null}
      </div>

      <div className="relative z-10">
        {loading ? (
          <div className="flex min-h-[100px] items-center justify-center gap-2 text-xs">
            <div
              className="h-3 w-3 animate-pulse rounded-full"
              style={{ background: accent, opacity: 0.6 }}
            />
            <span style={{ color: 'var(--text-tertiary)' }}>加载中…</span>
          </div>
        ) : error ? (
          <div
            className="rounded-xl px-4 py-3 text-xs"
            style={{
              background: 'color-mix(in oklch, oklch(0.62 0.18 28) 12%, transparent)',
              border: '1px solid color-mix(in oklch, oklch(0.62 0.18 28) 35%, transparent)',
              color: 'oklch(0.55 0.2 28)'
            }}
          >
            {error}
          </div>
        ) : empty ? (
          emptyNode ?? (
            <div
              className="flex min-h-[100px] items-center justify-center text-center text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {emptyText}
            </div>
          )
        ) : (
          children
        )}
      </div>

      {footer ? (
        <div
          className="relative z-10 mt-4 border-t pt-3 text-[11px]"
          style={{
            borderColor: 'rgba(255,255,255,0.25)',
            color: 'var(--text-secondary)'
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}

export default DashboardCard
