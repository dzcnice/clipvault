/**
 * HealthReportCard (Sprint 11 · TASK-059)
 */

import React, { useMemo } from 'react'
import { useHealthReport } from '../hooks/useHealthReport'

export interface HealthReportCardProps {
  className?: string
  onOpenFullReport?: () => void
}

function scoreColor(score: number): string {
  if (score >= 90) return '#10b981'
  if (score >= 70) return '#eab308'
  if (score >= 50) return '#f97316'
  return '#ef4444'
}

export const HealthReportCard: React.FC<HealthReportCardProps> = ({
  className,
  onOpenFullReport
}) => {
  const { state, report, error, refresh } = useHealthReport(true)

  const score = useMemo(() => {
    if (!report) return 100
    // 简单复算：与后端 computeScore 同策略（保险起见复用 summary）
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
    <div
      className={className}
      style={{
        padding: 16,
        borderRadius: 12,
        border: '1px solid rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>凭证健康报告</h3>
        <button
          type="button"
          onClick={() => void refresh(true)}
          style={{ fontSize: 12, cursor: 'pointer' }}
        >
          刷新
        </button>
      </div>

      {state === 'loading' && <div>加载中…</div>}
      {state === 'session_required' && <div>请先解锁 Vault</div>}
      {state === 'error' && <div style={{ color: '#ef4444' }}>错误：{error}</div>}

      {state === 'ready' && report && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: scoreColor(score)
              }}
            >
              {score}
            </div>
            <div style={{ fontSize: 12, color: '#666' }}>
              / 100（共 {report.totalCredentials} 个凭证）
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Badge label="弱密码" n={report.summary.weak_password} color="#f97316" />
            <Badge label="重复" n={report.summary.reused_password} color="#ef4444" />
            <Badge label="陈旧" n={report.summary.stale_unused} color="#6b7280" />
            <Badge label="泄露" n={report.summary.pwned} color="#dc2626" />
          </div>

          {topIssues.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>最紧急建议：</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {topIssues.map((i, idx) => (
                  <li key={idx}>
                    <strong>{i.credentialName}</strong>：{i.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {onOpenFullReport && (
            <button
              type="button"
              onClick={onOpenFullReport}
              style={{
                alignSelf: 'flex-start',
                padding: '4px 10px',
                borderRadius: 6,
                border: '1px solid rgba(0,0,0,0.15)',
                cursor: 'pointer'
              }}
            >
              查看完整报告
            </button>
          )}
        </>
      )}
    </div>
  )
}

const Badge: React.FC<{ label: string; n: number; color: string }> = ({
  label,
  n,
  color
}) => (
  <span
    style={{
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      background: color + '20',
      color
    }}
  >
    {label} {n}
  </span>
)

export default HealthReportCard
