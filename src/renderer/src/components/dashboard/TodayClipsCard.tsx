/**
 * Dashboard · 今日复制卡片（v2.0 Sprint 5 · UI 精致化）
 *
 * 视觉：蓝色调；超大数字展示；底部迷你预览列表。
 */

import { Clipboard, ClipboardList, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from './DashboardCard'
import type { DashboardData } from '../../hooks/useDashboardData'

interface Props {
  state: DashboardData['todayClips']
}

const ACCENT = 'var(--primary)'

export function TodayClipsCard({ state }: Props): JSX.Element {
  const navigate = useNavigate()
  const data = state.data

  return (
    <DashboardCard
      title="今日复制"
      subtitle="最近 24 小时的剪贴板记录"
      icon={Clipboard}
      accent={ACCENT}
      loading={state.loading}
      error={state.error}
      empty={!state.loading && !state.error && (!data || data.count === 0)}
      emptyNode={
        <div className="cv-empty py-8">
          <div
            className="cv-icon-slot !h-12 !w-12"
            style={{ background: 'var(--primary-soft)', color: ACCENT }}
          >
            <ClipboardList size={20} strokeWidth={1.75} />
          </div>
          <p className="font-body text-xs" style={{ color: 'var(--ink-faint)' }}>
            今天还没有复制任何内容
          </p>
        </div>
      }
      onClick={() => navigate('/clipboard')}
      footer={
        data ? (
          <div className="flex items-center justify-between">
            <span>查看完整历史</span>
            <ArrowUpRight
              size={12}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              style={{ color: ACCENT }}
            />
          </div>
        ) : null
      }
    >
      {data ? (
        <div>
          <div className="mb-4 flex items-baseline gap-2">
            <span
              className="text-[64px] font-extralight leading-none tracking-tight"
              style={{
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {data.count}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              条记录
            </span>
          </div>

          {data.items.length > 0 ? (
            <ul className="space-y-1.5">
              {data.items.slice(0, 3).map((it) => (
                <li
                  key={it.id}
                  className="cv-list-row truncate text-[11px] leading-relaxed"
                  style={{ color: 'var(--ink-soft)' }}
                >
                  {String(it.content ?? '').slice(0, 80) || '（空白内容）'}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </DashboardCard>
  )
}

export default TodayClipsCard
