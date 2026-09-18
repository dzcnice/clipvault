/**
 * 凭证健康检查 · 像素壳
 */

import { Activity, Loader2, RefreshCw } from 'lucide-react'
import { HealthReportCard } from '../components/HealthReportCard'
import { useHealthReport } from '../hooks/useHealthReport'

const typeLabel: Record<string, string> = {
  weak_password: '弱密码',
  reused_password: '重复使用',
  stale_unused: '长期未用',
  pwned: '疑似泄露'
}

function severityClass(s: 'low' | 'medium' | 'high'): string {
  if (s === 'high') return 'text-[var(--destructive)]'
  if (s === 'medium') return 'text-[var(--primary)]'
  return 'text-muted-foreground'
}

function severityLabel(s: 'low' | 'medium' | 'high'): string {
  return s === 'high' ? '高' : s === 'medium' ? '中' : '低'
}

export default function HealthReportPage(): JSX.Element {
  const { state, report, error, refresh } = useHealthReport(true)

  return (
    <div className="cv-page">
      <div className="cv-page-inner max-w-4xl">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="cv-kicker mb-1">安全</p>
            <h1 className="cv-page-title">凭证健康</h1>
            <p className="cv-page-desc">弱密码、重复、陈旧与泄露检查，分数越高质量越好</p>
          </div>
          <button
            type="button"
            className="cv-btn cv-btn-secondary text-xs"
            onClick={() => void refresh(true)}
          >
            <RefreshCw size={14} strokeWidth={2.25} />
            强制刷新
          </button>
        </header>

        <HealthReportCard className="mb-5" />

        {state === 'loading' || state === 'idle' ? (
          <div className="cv-empty">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
            <span className="font-body text-sm">正在扫描…</span>
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="cv-panel p-5 text-sm" style={{ color: 'var(--destructive)' }}>
            {error || '健康报告暂不可用'}
          </div>
        ) : null}

        {state === 'ready' && report ? (
          <section className="cv-panel overflow-hidden">
            <div className="flex items-center justify-between border-b-2 border-[var(--line)] px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity size={16} style={{ color: 'var(--primary)' }} />
                <h2 className="font-pixel text-sm font-bold">全部问题</h2>
                <span className="cv-badge font-mono-num">{report.issues.length}</span>
              </div>
            </div>
            {report.issues.length === 0 ? (
              <div className="cv-empty py-10">
                <p className="font-pixel font-bold">箱子很干净</p>
                <p className="font-body text-sm text-muted-foreground">当前没有弱密码、重复或泄露项</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="font-pixel text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2">凭证</th>
                      <th className="px-4 py-2">类型</th>
                      <th className="px-4 py-2">严重度</th>
                      <th className="px-4 py-2">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.issues.map((issue, idx) => (
                      <tr key={`${issue.credentialId ?? issue.credentialName}-${idx}`} className="border-t border-[var(--line-soft)]">
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            className="font-medium text-[var(--primary)] underline-offset-2 hover:underline"
                            onClick={() => {
                              window.location.hash = `#/credentials?highlight=${encodeURIComponent(
                                issue.credentialId ?? issue.credentialName
                              )}`
                            }}
                          >
                            {issue.credentialName}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {typeLabel[issue.type] ?? issue.type}
                        </td>
                        <td className={`px-4 py-2.5 font-semibold ${severityClass(issue.severity)}`}>
                          {severityLabel(issue.severity)}
                        </td>
                        <td className="px-4 py-2.5">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
