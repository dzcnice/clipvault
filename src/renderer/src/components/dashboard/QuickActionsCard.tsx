/**
 * Dashboard · 快速操作 · v3.0 个人版
 */

import type { LucideIcon } from 'lucide-react'
import { Zap, Plus, Command, Scissors, HeartPulse } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from './DashboardCard'
import { openCommandPalette } from '../CommandPalette'

const ACCENT = 'oklch(0.68 0.16 255)'

interface ActionRowProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  onClick: () => void
}

function ActionRow({ icon: Icon, label, shortcut, onClick }: ActionRowProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="group/row flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
      style={{
        background: 'var(--surface-2)',
        borderColor: 'var(--border-subtle)'
      }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{
          background: 'oklch(0.68 0.16 255 / 0.15)',
          color: ACCENT
        }}
      >
        <Icon size={14} strokeWidth={1.75} />
      </div>
      <span className="flex-1 truncate text-xs font-medium text-foreground">{label}</span>
      {shortcut ? (
        <kbd className="cv-badge font-mono tabular-nums">{shortcut}</kbd>
      ) : null}
    </button>
  )
}

export default function QuickActionsCard(): JSX.Element {
  const navigate = useNavigate()

  return (
    <DashboardCard
      title="快速操作"
      icon={Zap}
      accent={ACCENT}
    >
      <div className="space-y-2">
        <ActionRow
          icon={Plus}
          label="新建凭证"
          onClick={() => navigate('/credentials')}
        />
        <ActionRow
          icon={Command}
          label="命令面板"
          shortcut="Ctrl+K"
          onClick={() => openCommandPalette()}
        />
        <ActionRow
          icon={HeartPulse}
          label="健康检查"
          onClick={() => navigate('/health')}
        />
        <ActionRow
          icon={Scissors}
          label="片段库"
          onClick={() => navigate('/snippets')}
        />
      </div>
    </DashboardCard>
  )
}
