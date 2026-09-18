/**
 * Dashboard · 凭证健康分数卡片
 *
 * 有问题时：圆环 + 四类徽章。
 * 全 0 时：紧凑一行（分数 + 「箱子很干净」），避免空徽章占一整列。
 */

import type { LucideIcon } from 'lucide-react'
import { HeartPulse, ShieldCheck, AlertTriangle, Copy, History, ArrowUpRight } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HealthReport } from '../../../../types/health'
import DashboardCard from './DashboardCard'

function scoreAccent(score: number): string {
  if (score >= 80) return 'var(--success)'
  if (score >= 60) return 'var(--primary)'
  return 'var(--destructive)'
}

function scoreLabel(score: number): string {
  if (score >= 90) return '优秀'
  if (score >= 80) return '良好'
  if (score >= 60) return '一般'
  if (score >= 40) return '待改进'
  return '紧急'
}

interface MiniBadgeProps {
  label: string
  count: number
  icon: LucideIcon
}

function MiniBadge({ label, count, icon: Icon }: MiniBadgeProps): JSX.Element {
  const hasIssue = count > 0
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-2"
      style={{
        background: hasIssue ? 'var(--primary-soft)' : 'var(--surface-2)',
        border: 'var(--px-border) solid var(--line)'
      }}
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        style={{
          color: hasIssue ? 'var(--destructive)' : 'var(--ink-faint)'
        }}
      />
      <span className="flex-1 font-body text-[10px]" style={{ color: 'var(--ink-soft)' }}>
        {label}
      </span>
      <span
        className="font-mono-num text-xs font-semibold tabular-nums"
        style={{
          color: hasIssue ? 'var(--destructive)' : 'var(--ink-faint)'
        }}
      >
        {count}
      </span>
    </div>
  )
}

/**
 * ρ2 · P0-R3：纯组件（不再内部调 useHealthReport）。
 * 由 DashboardPage 统一拉一次 health state，避免与 KpiStrip 显示不一致。
 */
export interface HealthScoreCardProps {
  className?: string
  state: 'idle' | 'loading' | 'ready' | 'session_required' | 'error'
  report: HealthReport | null
  error?: string
}

export function HealthScoreCard({
  className,
  state,
  report,
  error
}: HealthScoreCardProps): JSX.Element {
  const navigate = useNavigate()

  const score = useMemo(() => {
    if (!report) return 100
    const penalty =
      (report.summary.weak_password ?? 0) * 5 +
      (report.summary.reused_password ?? 0) * 10 +
      (report.summary.pwned ?? 0) * 10 +
      (report.summary.stale_unused ?? 0) * 2
    return Math.max(0, 100 - penalty)
  }, [report])

  const issueTotal = report
    ? (report.summary.weak_password ?? 0) +
      (report.summary.reused_password ?? 0) +
      (report.summary.pwned ?? 0) +
      (report.summary.stale_unused ?? 0)
    : 0

  const accent = scoreAccent(score)
  const isLoading = state === 'loading' || state === 'idle'
  const isError = state === 'error'
  const isLocked = state === 'session_required'
  const isReady = state === 'ready' && !!report
  const compactHealthy = isReady && issueTotal === 0

  const SIZE = 96
  const STROKE = 8
  const R = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * R
  const dashOffset = C - (Math.max(0, Math.min(100, score)) / 100) * C

  return (
    <DashboardCard
      title="凭证健康"
      subtitle={report ? `共扫描 ${report.totalCredentials} 个凭证` : '加密库安全状况'}
      icon={HeartPulse}
      accent={accent}
      loading={isLoading}
      error={isError ? (error ?? '加载失败') : null}
      empty={isLocked}
      className={className}
      emptyNode={
        <div className="cv-empty py-8">
          <div
            className="cv-icon-slot !h-12 !w-12"
            style={{ background: 'var(--primary-soft)', color: 'var(--success)' }}
          >
            <ShieldCheck size={20} strokeWidth={1.75} />
          </div>
          <p className="font-body text-xs" style={{ color: 'var(--ink-faint)' }}>
            请先解锁 Vault 以扫描
          </p>
        </div>
      }
      onClick={isReady ? () => navigate('/health') : undefined}
      footer={
        isReady ? (
          <div className="flex items-center justify-between">
            <span>查看完整健康报告</span>
            <ArrowUpRight size={12} style={{ color: accent }} />
          </div>
        ) : null
      }
    >
      {isReady && report && compactHealthy ? (
        <div
          className="flex items-center gap-4"
          data-testid="health-score-compact"
        >
          <span
            className="font-mono-num text-4xl font-semibold leading-none"
            style={{ color: accent }}
          >
            {score}
          </span>
          <div className="min-w-0">
            <p className="font-pixel text-sm font-bold" style={{ color: 'var(--ink)' }}>
              箱子很干净
            </p>
            <p className="font-body text-xs" style={{ color: 'var(--ink-faint)' }}>
              {scoreLabel(score)} · {report.totalCredentials} 把钥匙
            </p>
          </div>
        </div>
      ) : null}

      {isReady && report && !compactHealthy ? (
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="var(--line-soft)"
                strokeWidth={STROKE}
              />
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={accent}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={dashOffset}
                style={{
                  transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-mono-num text-2xl font-semibold leading-none"
                style={{ color: accent }}
              >
                {score}
              </span>
              <span className="mt-1 text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>
                {scoreLabel(score)}
              </span>
            </div>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
            <MiniBadge
              label="弱密码"
              count={report.summary.weak_password ?? 0}
              icon={AlertTriangle}
            />
            <MiniBadge
              label="重复密码"
              count={report.summary.reused_password ?? 0}
              icon={Copy}
            />
            <MiniBadge
              label="泄露记录"
              count={report.summary.pwned ?? 0}
              icon={AlertTriangle}
            />
            <MiniBadge
              label="长期未用"
              count={report.summary.stale_unused ?? 0}
              icon={History}
            />
          </div>
        </div>
      ) : null}
    </DashboardCard>
  )
}

export default HealthScoreCard
