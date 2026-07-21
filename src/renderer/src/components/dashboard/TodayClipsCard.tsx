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

const ACCENT = 'oklch(0.72 0.16 250)' // 蓝

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
        <div className="flex min-h-[120px] flex-col items-center justify-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background: `color-mix(in oklch, ${ACCENT} 12%, transparent)`,
              border: `1px dashed color-mix(in oklch, ${ACCENT} 35%, transparent)`
            }}
          >
            <ClipboardList
              size={26}
              strokeWidth={1.5}
              style={{ color: ACCENT, opacity: 0.8 }}
            />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
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
                  className="truncate rounded-lg px-3 py-2 text-[11px] leading-relaxed transition-colors"
                  style={{
                    background: 'rgba(255,255,255,0.35)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    color: 'var(--text-secondary)'
                  }}
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
