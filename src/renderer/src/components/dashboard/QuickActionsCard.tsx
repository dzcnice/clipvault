/**
 * Dashboard · 快速操作 · v3.0 个人版
 */

import type { LucideIcon } from 'lucide-react'
import { Zap, Plus, Command, Scissors, HeartPulse, Timer, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import DashboardCard from './DashboardCard'
import { openCommandPalette } from '../CommandPalette'

const ACCENT = 'var(--primary)'

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
      className="cv-btn cv-btn-secondary w-full justify-start text-xs"
    >
      <Icon size={14} strokeWidth={2} style={{ color: ACCENT }} />
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
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
          icon={Timer}
          label="TOTP 验证码"
          onClick={() => navigate('/totp')}
        />
        <ActionRow
          icon={HeartPulse}
          label="健康检查"
          onClick={() => navigate('/health')}
        />
        <ActionRow
          icon={Shield}
          label="重新打开保险库"
          onClick={() => {
            void window.api.vault.ensureOpen().then(() => navigate('/dashboard'))
          }}
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
