/**
 * 健康分数摘要卡 · 像素壳
 */

import { useMemo } from 'react'
import { useHealthReport } from '../hooks/useHealthReport'

export interface HealthReportCardProps {
  className?: string
  onOpenFullReport?: () => void
}

function scoreTone(score: number): string {
  if (score >= 90) return 'var(--success)'
  if (score >= 70) return 'var(--primary)'
  return 'var(--destructive)'
}

export function HealthReportCard({
  className,
  onOpenFullReport
}: HealthReportCardProps): JSX.Element {
  const { state, report, error, refresh } = useHealthReport(true)

  const score = useMemo(() => {
    if (!report) return 100
    const penalty =
      (report.summary.weak_password ?? 0) * 5 +
      (report.summary.reused_password ?? 0) * 10 +
      (report.summary.pwned ?? 0) * 10 +
      (report.summary.stale_unused ?? 0) * 2
    return Math.max(0, 100 - penalty)
  }, [report])

  const topIssues = (report?.issues ?? [])
    .slice()
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 }
      return order[a.severity] - order[b.severity]
    })
    .slice(0, 3)

  return (
    <div className={`cv-panel p-5 ${className ?? ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-pixel text-sm font-bold">健康分数</h3>
        <button
          type="button"
          className="cv-btn cv-btn-ghost text-[11px] !px-2 !py-1"
          onClick={() => void refresh(true)}
        >
          刷新
        </button>
      </div>

      {state === 'loading' || state === 'idle' ? (
        <p className="text-sm text-muted-foreground">扫描中…</p>
      ) : null}
      {state === 'session_required' ? (
        <p className="text-sm text-muted-foreground">保险库未打开</p>
      ) : null}
      {state === 'error' ? (
        <p className="text-sm" style={{ color: 'var(--destructive)' }}>
          {error}
        </p>
      ) : null}

      {state === 'ready' && report ? (
        <>
          <div className="mb-4 flex items-baseline gap-2">
            <span
              className="font-mono-num text-5xl font-semibold leading-none"
              style={{ color: scoreTone(score) }}
            >
              {score}
            </span>
            <span className="text-xs text-muted-foreground">
              / 100 · {report.totalCredentials} 把钥匙
            </span>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="cv-badge">弱密码 {report.summary.weak_password}</span>
            <span className="cv-badge">重复 {report.summary.reused_password}</span>
            <span className="cv-badge">陈旧 {report.summary.stale_unused}</span>
            <span className="cv-badge">泄露 {report.summary.pwned}</span>
          </div>
          {topIssues.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {topIssues.map((issue, idx) => (
                <li key={`${issue.credentialId}-${idx}`}>
                  <span className="font-medium">{issue.credentialName}</span>
                  <span className="text-muted-foreground"> · {issue.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {onOpenFullReport ? (
            <button
              type="button"
              className="cv-btn cv-btn-secondary mt-4 text-xs"
              onClick={onOpenFullReport}
            >
              查看完整报告
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export default HealthReportCard
