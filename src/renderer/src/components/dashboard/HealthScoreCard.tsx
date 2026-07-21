/**
 * Dashboard · 凭证健康分数卡片（v2.0 Sprint 5 · UI 精致化）
 *
 * 直接读取 useHealthReport hook 的 report，本卡内自行渲染：
 *  - SVG 圆环进度 + 中心分数
 *  - 分级色调（>=80 绿 / 60-80 琥珀 / <60 红）
 *  - 底部 2x2 徽章展示四类问题数量
 *
 * 点击跳转 /health。
 */

import type { LucideIcon } from 'lucide-react'
import { HeartPulse, ShieldCheck, AlertTriangle, Copy, History, ArrowUpRight } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { HealthReport } from '../../../../types/health'
import DashboardCard from './DashboardCard'

function scoreAccent(score: number): string {
  if (score >= 80) return 'oklch(0.72 0.14 160)' // 绿
  if (score >= 60) return 'oklch(0.72 0.16 45)' // 琥珀
  return 'oklch(0.62 0.18 28)' // 红
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
  accent: string
  icon: LucideIcon
}

function MiniBadge({ label, count, accent, icon: Icon }: MiniBadgeProps): JSX.Element {
  const hasIssue = count > 0
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-2.5 py-2"
      style={{
        background: hasIssue
          ? `color-mix(in oklch, ${accent} 15%, transparent)`
          : 'rgba(255,255,255,0.35)',
        border: hasIssue
          ? `1px solid color-mix(in oklch, ${accent} 35%, transparent)`
          : '1px solid rgba(255,255,255,0.3)'
      }}
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        style={{
          color: hasIssue ? accent : 'var(--text-tertiary)'
        }}
      />
      <span
        className="flex-1 text-[10px]"
        style={{ color: 'var(--text-secondary)' }}
      >
        {label}
      </span>
      <span
        className="font-mono text-xs font-semibold tabular-nums"
        style={{
          color: hasIssue ? accent : 'var(--text-tertiary)'
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

  const accent = scoreAccent(score)
  const isLoading = state === 'loading' || state === 'idle'
  const isError = state === 'error'
  const isLocked = state === 'session_required'
  const isReady = state === 'ready' && !!report

  // 圆环几何
  const SIZE = 120
  const STROKE = 10
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
      error={isError ? error ?? '加载失败' : null}
      empty={isLocked}
      className={className}
      emptyNode={
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: 'color-mix(in oklch, oklch(0.72 0.14 160) 12%, transparent)',
              border: '1px dashed color-mix(in oklch, oklch(0.72 0.14 160) 35%, transparent)'
            }}
          >
            <ShieldCheck
              size={24}
              strokeWidth={1.5}
              style={{ color: 'oklch(0.6 0.13 160)' }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            请先解锁 Vault 以扫描
          </p>
        </div>
      }
      onClick={isReady ? () => navigate('/health') : undefined}
      footer={
        isReady ? (
          <div className="flex items-center justify-between">
            <span>查看完整健康报告</span>
            <ArrowUpRight
              size={12}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              style={{ color: accent }}
            />
          </div>
        ) : null
      }
    >
      {isReady && report ? (
        <div className="flex items-center gap-5">
          {/* 圆环 */}
          <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              {/* 背景轨道 */}
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={STROKE}
              />
              {/* 进度 */}
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
                  transition: 'stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)',
                  filter: `drop-shadow(0 0 8px color-mix(in oklch, ${accent} 60%, transparent))`
                }}
              />
            </svg>
            {/* 中心数字 */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="text-3xl font-light leading-none tracking-tight"
                style={{
                  color: accent,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {score}
              </span>
              <span
                className="mt-1 text-[10px] font-medium"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {scoreLabel(score)}
              </span>
            </div>
          </div>

          {/* 右侧：问题徽章 */}
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
            <MiniBadge
              label="弱密码"
              count={report.summary.weak_password ?? 0}
              accent="oklch(0.72 0.16 45)"
              icon={AlertTriangle}
            />
            <MiniBadge
              label="重复密码"
              count={report.summary.reused_password ?? 0}
              accent="oklch(0.62 0.18 28)"
              icon={Copy}
            />
            <MiniBadge
              label="泄露记录"
              count={report.summary.pwned ?? 0}
              accent="oklch(0.55 0.2 28)"
              icon={AlertTriangle}
            />
            <MiniBadge
              label="长期未用"
              count={report.summary.stale_unused ?? 0}
              accent="oklch(0.6 0.03 270)"
              icon={History}
            />
          </div>
        </div>
      ) : null}
    </DashboardCard>
  )
}

export default HealthScoreCard
