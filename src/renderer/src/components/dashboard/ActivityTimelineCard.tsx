/**
 * Dashboard · 今日剪贴板活动（ξ1 时间线升级）
 *
 * 主区左侧大卡（col-span-2）。渲染今日复制的剪贴板项，按时间倒序
 * 以时间线形式展示：时间戳 + 分类图标 + 一行摘要。
 *
 * 数据源：useDashboardData 的 todayClips。
 */

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ClipboardList,
  FileText,
  Image as ImageIcon,
  Code2,
  Link as LinkIcon,
  KeyRound,
  ArrowUpRight
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from './DashboardCard'
import { ClipboardContentType } from '@/types'
import type { ClipboardItem } from '@/types'
import type { DashboardData } from '../../hooks/useDashboardData'

interface Props {
  state: DashboardData['todayClips']
}

const ACCENT = 'var(--primary)'

function formatTime(ts: number | undefined | null): string {
  if (!ts || typeof ts !== 'number') return '--:--'
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

interface ItemMeta {
  icon: LucideIcon
  accent: string
  label: string
  summary: string
}

function pickMeta(it: ClipboardItem): ItemMeta {
  const content = String(it.content ?? it.preview ?? '').trim()

  // 优先级 1: 检测到密钥
  if (it.detectedKeyType) {
    return {
      icon: KeyRound,
      accent: 'var(--primary)',
      label: it.detectedKeyType,
      summary: '（敏感内容已遮罩）'
    }
  }

  // 优先级 2: 图片
  if (it.type === ClipboardContentType.IMAGE) {
    return {
      icon: ImageIcon,
      accent: 'var(--ink)',
      label: '图片',
      summary: `${Math.round((it.size ?? 0) / 1024)} KB 图片`
    }
  }

  // 优先级 3: 文件
  if (it.type === ClipboardContentType.FILE) {
    return {
      icon: FileText,
      accent: 'var(--ink-soft)',
      label: '文件',
      summary: it.filePath || content || '文件引用'
    }
  }

  // 优先级 4: URL
  if (content && /^https?:\/\//i.test(content)) {
    return {
      icon: LinkIcon,
      accent: 'var(--success)',
      label: '链接',
      summary: content.slice(0, 80)
    }
  }

  // 优先级 5: 代码/SQL
  if (
    content &&
    /\b(select|insert|update|delete|function|class|import|const|def\s+\w+)\b/i.test(content)
  ) {
    return {
      icon: Code2,
      accent: 'var(--success)',
      label: '代码',
      summary: content.replace(/\s+/g, ' ').slice(0, 80)
    }
  }

  // 默认：文本
  return {
    icon: FileText,
    accent: 'var(--ink)',
    label: '文本',
    summary: content.slice(0, 80) || '（空白内容）'
  }
}

interface TimelineRowProps {
  it: ClipboardItem
  isLast: boolean
}

function TimelineRow({ it, isLast }: TimelineRowProps): JSX.Element {
  const meta = pickMeta(it)
  return (
    <li className="relative flex items-start gap-3 pl-0">
      {/* 时间 */}
      <div
        className="w-12 shrink-0 pt-1.5 text-right font-mono text-[11px] tabular-nums"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {formatTime(it.createdAt)}
      </div>

      {/* 轴 + 圆点 */}
      <div className="relative flex shrink-0 flex-col items-center" aria-hidden>
        <div
          className="mt-1.5 h-2.5 w-2.5 shrink-0"
          style={{
            background: meta.accent,
            border: 'var(--px-border) solid var(--line)'
          }}
        />
        {!isLast && (
          <div
            className="mt-0.5 w-px flex-1"
            style={{
              background: 'var(--line-soft)',
              minHeight: 28
            }}
          />
        )}
      </div>

      {/* 内容 */}
      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-center gap-2">
          <div
            className="cv-badge flex h-5 items-center gap-1 px-1.5 text-[10px] font-medium"
            style={{ color: meta.accent }}
          >
            <meta.icon size={10} strokeWidth={2} />
            {meta.label}
          </div>
          {it.sourceApp ? (
            <span
              className="truncate text-[10px]"
              style={{ color: 'var(--text-tertiary)' }}
            >
              · {it.sourceApp}
            </span>
          ) : null}
        </div>
        <div
          className="mt-1 truncate text-xs leading-relaxed"
          style={{ color: 'var(--text-secondary)' }}
          title={meta.summary}
        >
          {meta.summary}
        </div>
      </div>
    </li>
  )
}

export function ActivityTimelineCard({ state }: Props): JSX.Element {
  const navigate = useNavigate()
  const data = state.data
  const items = data?.items ?? []
  const showList = items.slice(0, 6)

  return (
    <DashboardCard
      title="今日剪贴板活动"
      subtitle="最近 24 小时 · 按时间倒序"
      icon={Activity}
      accent={ACCENT}
      loading={state.loading}
      error={state.error}
      empty={!state.loading && !state.error && (!data || data.count === 0)}
      emptyNode={
        <div className="cv-empty py-10">
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
      className="h-full"
      footer={
        data ? (
          <div className="flex items-center justify-between">
            <span>
              共 <span className="font-semibold tabular-nums">{data.count}</span>{' '}
              条记录 · 点击查看完整历史
            </span>
            <ArrowUpRight
              size={12}
              className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              style={{ color: ACCENT }}
            />
          </div>
        ) : null
      }
    >
      {data && showList.length > 0 ? (
        <ul className="relative">
          {showList.map((it, i) => (
            <TimelineRow
              key={it.id}
              it={it}
              isLast={i === showList.length - 1}
            />
          ))}
        </ul>
      ) : data && items.length === 0 ? (
        <div className="cv-empty py-8 font-body text-xs">今日还没有剪贴板活动</div>
      ) : null}
    </DashboardCard>
  )
}

export default ActivityTimelineCard
