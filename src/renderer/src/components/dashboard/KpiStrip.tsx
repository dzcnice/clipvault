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
    <div className="cv-panel flex h-[5.5rem] items-center gap-3 px-4">
      <div
        className="cv-icon-slot shrink-0"
        style={{ background: 'var(--primary-soft)', color: accent }}
      >
        <Icon size={16} strokeWidth={2.25} aria-hidden />
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
              color: error ? 'var(--destructive)' : 'var(--ink)',
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
        accent="var(--primary)"
        loading={credentialTotal.loading}
        error={credentialTotal.error}
      />
      <KpiCard
        label="今日复制"
        value={todayClips.value}
        hint="24h"
        icon={Clipboard}
        accent="var(--ink)"
        loading={todayClips.loading}
        error={todayClips.error}
      />
      <KpiCard
        label="片段"
        value={snippetTotal?.value ?? 0}
        hint="条"
        icon={Scissors}
        accent="var(--success)"
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
            ? 'var(--success)'
            : healthScore.value >= 60
              ? 'var(--primary)'
              : 'var(--destructive)'
        }
        loading={healthScore.loading}
        error={healthScore.error}
      />
    </div>
  )
}

export default KpiStrip
