/**
 * 概览页 · v3 个人本地版（CSS 动效，无 framer-motion）
 */

import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useDashboardData } from '../hooks/useDashboardData'
import { useHealthReport } from '../hooks/useHealthReport'
import ActivityTimelineCard from '../components/dashboard/ActivityTimelineCard'
import RecentCredentialsCard from '../components/dashboard/RecentCredentialsCard'
import HealthScoreCard from '../components/dashboard/HealthScoreCard'
import QuickActionsCard from '../components/dashboard/QuickActionsCard'
import KpiStrip from '../components/dashboard/KpiStrip'

function greeting(hour: number): string {
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  if (hour < 22) return '晚上好'
  return '夜深了'
}

function formatDate(d: Date): string {
  const yy = d.getFullYear()
  const mo = d.getMonth() + 1
  const dd = d.getDate()
  return `今天是 ${yy} 年 ${mo} 月 ${dd} 日`
}

export default function DashboardPage(): JSX.Element {
  const { data, refreshAll } = useDashboardData(30_000, 'personal')
  const { state: healthState, report, error: healthReportError } = useHealthReport(true)

  const now = new Date()
  const hello = greeting(now.getHours())
  const dateLabel = formatDate(now)

  const healthScore = useMemo(() => {
    if (!report) return 100
    const penalty =
      (report.summary.weak_password ?? 0) * 5 +
      (report.summary.reused_password ?? 0) * 10 +
      (report.summary.pwned ?? 0) * 10 +
      (report.summary.stale_unused ?? 0) * 2
    return Math.max(0, 100 - penalty)
  }, [report])

  const healthLoading = healthState === 'idle' || healthState === 'loading'
  const healthError = healthState === 'error'

  return (
    <div className="cv-page">
      <div className="cv-page-inner max-w-6xl">
        <header className="mb-6 flex animate-fadeIn items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="cv-kicker mb-1">概览</p>
            <h1 className="cv-page-title">
              {hello}
              <span className="ml-2 font-body text-base font-normal text-muted-foreground">
                欢迎回来
              </span>
            </h1>
            <p className="cv-page-desc">
              {dateLabel}
              {healthReportError ? ' · 健康报告暂不可用' : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void refreshAll()}
            className="cv-btn cv-btn-secondary text-xs"
            title="立即刷新"
          >
            <RefreshCw size={12} strokeWidth={2} />
            刷新
          </button>
        </header>

        <section className="mb-6 animate-fadeIn">
          <KpiStrip
            credentialTotal={{
              value: data.recentCredentials.data?.total ?? 0,
              loading: data.recentCredentials.loading,
              error: Boolean(data.recentCredentials.error)
            }}
            todayClips={{
              value: data.todayClips.data?.count ?? 0,
              loading: data.todayClips.loading,
              error: Boolean(data.todayClips.error)
            }}
            snippetTotal={{
              value: data.snippets.data?.total ?? 0,
              loading: data.snippets.loading,
              error: Boolean(data.snippets.error)
            }}
            healthScore={{
              value: healthScore,
              loading: healthLoading,
              error: healthError
            }}
          />
        </section>

        <section className="mb-6 grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActivityTimelineCard state={data.todayClips} />
          </div>
          <div className="lg:col-span-1">
            <HealthScoreCard
              state={healthState}
              report={report}
              error={healthReportError ?? undefined}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <RecentCredentialsCard state={data.recentCredentials} />
          <QuickActionsCard />
        </section>
      </div>
    </div>
  )
}
