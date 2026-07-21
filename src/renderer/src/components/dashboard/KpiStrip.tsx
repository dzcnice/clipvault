/**
 * Dashboard · KPI 条（ξ1 重构）
 *
 * 横向 4 个极简指标：凭证总数 / 今日复制 / 在线成员 / 健康分数
 * 设计：h-24、grid-cols-4 gap-3、每卡 p-3，图标徽章 + 超大数字 + 小字副标。
 */

import type { LucideIcon } from 'lucide-react'
import { KeyRound, Clipboard, Scissors, HeartPulse } from 'lucide-react'

interface KpiCardProps {
  /** 标题 */
  label: string
  /** 主数值（可以是数字或字符串，如 "3/7"） */
  value: string | number
  /** 副标（更小一行） */
  hint?: string
  /** 图标 */
  icon: LucideIcon
  /** 色调 */
  accent: string
  /** 加载中 */
  loading?: boolean
  /** 错误 */
  error?: boolean
}

function KpiCard({ label, value, hint, icon: Icon, accent, loading, error }: KpiCardProps): JSX.Element {
  return (
    <div
      className="group relative flex h-24 items-center gap-3 overflow-hidden rounded-xl border px-4 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      {/* 右侧色调光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl transition-opacity duration-500 group-hover:opacity-50"
        style={{ background: accent }}
      />

      {/* 图标徽章 */}
      <div
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
        style={{
          background: `color-mix(in oklch, ${accent} 20%, transparent)`,
          border: `1px solid color-mix(in oklch, ${accent} 40%, transparent)`,
          boxShadow: `0 4px 12px -4px color-mix(in oklch, ${accent} 40%, transparent)`
        }}
      >
        <Icon size={18} strokeWidth={1.75} style={{ color: accent }} aria-hidden />
      </div>

      {/* 文字区 */}
      <div className="relative z-10 min-w-0 flex-1">
        <div
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {label}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span
            className="text-3xl font-light leading-none tabular-nums tracking-tight"
            style={{
              color: error ? 'oklch(0.62 0.18 28)' : 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {loading ? '—' : error ? '!' : value}
          </span>
          {hint ? (
            <span
              className="truncate text-[10px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {hint}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export interface KpiStripProps {
  credentialTotal: { value: number; loading: boolean; error: boolean }
  todayClips: { value: number; loading: boolean; error: boolean }
  /** 兼容旧 prop；个人版忽略 */
  teamOnline?: { online: number; total: number; loading: boolean; error: boolean }
  snippetTotal?: { value: number; loading: boolean; error: boolean }
  healthScore: { value: number; loading: boolean; error: boolean }
}

export function KpiStrip({
  credentialTotal,
  todayClips,
  snippetTotal,
  healthScore
}: KpiStripProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        label="凭证总数"
        value={credentialTotal.value}
        hint="条"
        icon={KeyRound}
        accent="oklch(0.72 0.16 45)"
        loading={credentialTotal.loading}
        error={credentialTotal.error}
      />
      <KpiCard
        label="今日复制"
        value={todayClips.value}
        hint="24h"
        icon={Clipboard}
        accent="oklch(0.68 0.16 255)"
        loading={todayClips.loading}
        error={todayClips.error}
      />
      <KpiCard
        label="片段"
        value={snippetTotal?.value ?? 0}
        hint="条"
        icon={Scissors}
        accent="oklch(0.72 0.14 160)"
        loading={snippetTotal?.loading}
        error={snippetTotal?.error}
      />
      <KpiCard
        label="健康分数"
        value={healthScore.value}
        hint="/ 100"
        icon={HeartPulse}
        accent={
          healthScore.value >= 80
            ? 'oklch(0.72 0.14 160)'
            : healthScore.value >= 60
              ? 'oklch(0.72 0.16 45)'
              : 'oklch(0.62 0.18 28)'
        }
        loading={healthScore.loading}
        error={healthScore.error}
      />
    </div>
  )
}

export default KpiStrip
