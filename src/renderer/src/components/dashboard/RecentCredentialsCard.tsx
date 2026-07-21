/**
 * Dashboard · 最近凭证卡片（v2.0 Sprint 5 · UI 精致化）
 *
 * 视觉：琥珀色调；avatar + 名称 + 相对时间；空态带 CTA。
 */

import { KeyRound, Plus, ArrowUpRight, Key } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from './DashboardCard'
import type { DashboardData } from '../../hooks/useDashboardData'
import type { Credential } from '@/types'

interface Props {
  state: DashboardData['recentCredentials']
  className?: string
}

const ACCENT = 'oklch(0.72 0.16 45)' // 琥珀

function relativeTime(ts: number | undefined | null): string {
  if (!ts || typeof ts !== 'number') return '未知'
  const diff = Date.now() - ts
  if (diff < 0) return '刚刚'
  const s = Math.floor(diff / 1000)
  if (s < 60) return '刚刚'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} 月前`
  return `${Math.floor(mo / 12)} 年前`
}

function initials(name: string): string {
  const t = (name || '').trim()
  if (!t) return '?'
  // 取前 2 个非空白字符
  const chars = Array.from(t).filter((c) => !/\s/.test(c))
  return chars.slice(0, 2).join('').toUpperCase()
}

function CredentialRow({ c }: { c: Credential }): JSX.Element {
  return (
    <li
      className="flex items-center gap-3 rounded-xl px-3 py-2 transition-colors"
      style={{
        background: 'rgba(255,255,255,0.35)',
        border: '1px solid rgba(255,255,255,0.3)'
      }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tracking-tight"
        style={{
          background: `color-mix(in oklch, ${ACCENT} 22%, transparent)`,
          border: `1px solid color-mix(in oklch, ${ACCENT} 40%, transparent)`,
          color: ACCENT
        }}
        aria-hidden
      >
        {initials(c.name || '未命名')}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-xs font-medium"
          style={{ color: 'var(--text-primary)' }}
        >
          {c.name || '未命名'}
        </div>
        <div
          className="truncate text-[10px]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {c.type} · {relativeTime(c.updatedAt)}
        </div>
      </div>
    </li>
  )
}

export function RecentCredentialsCard({ state, className }: Props): JSX.Element {
  const navigate = useNavigate()
  const list = state.data?.items ?? []

  return (
    <DashboardCard
      title="最近凭证"
      subtitle="最近更新的 5 条"
      icon={KeyRound}
      accent={ACCENT}
      loading={state.loading}
      error={state.error}
      empty={!state.loading && !state.error && list.length === 0}
      emptyNode={
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: `color-mix(in oklch, ${ACCENT} 12%, transparent)`,
              border: `1px dashed color-mix(in oklch, ${ACCENT} 35%, transparent)`
            }}
          >
            <Key size={24} strokeWidth={1.5} style={{ color: ACCENT, opacity: 0.8 }} />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            凭证库是空的，快去添加一条吧
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              navigate('/credentials')
            }}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-all hover:scale-105"
            style={{
              background: `color-mix(in oklch, ${ACCENT} 28%, transparent)`,
              border: `1px solid color-mix(in oklch, ${ACCENT} 45%, transparent)`,
              color: 'oklch(0.45 0.14 45)'
            }}
          >
            <Plus size={12} />
            添加凭证
          </button>
        </div>
      }
      onClick={() => navigate('/credentials')}
      className={className}
      footer={
        list.length > 0 ? (
          <div className="flex items-center justify-between">
            <span>查看全部凭证</span>
            <ArrowUpRight
              size={12}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              style={{ color: ACCENT }}
            />
          </div>
        ) : null
      }
    >
      <ul className="space-y-1.5">
        {list.slice(0, 4).map((c) => (
          <CredentialRow key={c.id} c={c} />
        ))}
      </ul>
    </DashboardCard>
  )
}

export default RecentCredentialsCard
