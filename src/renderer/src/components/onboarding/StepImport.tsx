/**
 * TASK-082 Onboarding Step 5：导入现有凭证（可跳过）
 *
 * 实际 ImportWizard 由 ζ1 subagent 产出；这里仅给入口 + 说明。
 * v2.0 UI 精致化：emoji 图标改为 Lucide + 色调徽章。
 */

import type { LucideIcon } from 'lucide-react'
import { Shield, Globe, KeyRound, Hash } from 'lucide-react'
import { OnboardingLayout } from './OnboardingLayout'

interface Props {
  stepIndex: number
  totalSteps: number
  onPrev: () => void
  onFinish: () => void
  onSkip: () => void
  onTriggered: () => void
  /** A3: 真正跳转到 /import 向导，并可带 source 自动切 Tab */
  onExitToImport?: (source: ImportTab) => void
}

type ImportTab = 'onepassword' | 'bitwarden' | 'chrome' | 'lastpass' | 'keepass'

interface ImportSource {
  name: string
  tab: ImportTab
  icon: LucideIcon
  format: string
  hue: string
}

const SOURCES: ImportSource[] = [
  { name: '1Password', tab: 'onepassword', icon: Hash, format: '.1pif / .csv', hue: 'oklch(0.72 0.16 250)' },
  { name: 'Bitwarden', tab: 'bitwarden', icon: Shield, format: '.json', hue: 'oklch(0.72 0.14 160)' },
  { name: 'Chrome/Edge', tab: 'chrome', icon: Globe, format: '.csv (passwords.csv)', hue: 'oklch(0.72 0.16 45)' },
  { name: 'LastPass', tab: 'lastpass', icon: KeyRound, format: '.csv', hue: 'oklch(0.72 0.18 290)' }
]

export function StepImport({
  stepIndex,
  totalSteps,
  onPrev,
  onFinish,
  onSkip,
  onTriggered,
  onExitToImport
}: Props): JSX.Element {
  const handleLaunch = (tab: ImportTab): void => {
    onTriggered()
    if (onExitToImport) {
      onExitToImport(tab)
    }
  }

  return (
    <OnboardingLayout
      stepId="import"
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="导入现有凭证（可选）"
      description="从主流密码管理器一键迁移。所有导入操作都在本机完成，无任何上传。"
      onPrev={onPrev}
      onNext={onFinish}
      onSkip={onSkip}
      skippable
      nextLabel="完成配置"
    >
      <div className="grid grid-cols-2 gap-3">
        {SOURCES.map((src) => {
          const Icon = src.icon
          return (
            <button
              key={src.name}
              className="group relative overflow-hidden rounded-lg p-3 text-left transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--glass-border)'
              }}
              onClick={() => handleLaunch(src.tab)}
            >
              {/* 色调光晕 */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-4 -right-4 h-16 w-16 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50"
                style={{ background: src.hue }}
              />
              <div
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  background: `color-mix(in oklch, ${src.hue} 18%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${src.hue} 38%, transparent)`
                }}
              >
                <Icon size={16} strokeWidth={1.75} style={{ color: src.hue }} />
              </div>
              <div className="mt-2 text-sm font-medium">{src.name}</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {src.format}
              </div>
            </button>
          )
        })}
      </div>
      <p className="mt-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        提示：也可以稍后在「设置 → 导入导出」中进行。
      </p>
    </OnboardingLayout>
  )
}
