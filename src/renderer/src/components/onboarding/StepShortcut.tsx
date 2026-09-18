/**
 * Onboarding · 快捷键与 HUD（v3.1 个人版）
 */

import { OnboardingLayout } from './OnboardingLayout'

interface Props {
  stepIndex: number
  totalSteps: number
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
}

const SHORTCUTS: Array<{ combo: string; desc: string }> = [
  { combo: 'Alt+Space', desc: '召唤 HUD（搜索 / 粘贴 / 导航）' },
  { combo: 'Ctrl+Space', desc: '显示 / 隐藏主窗口' },
  { combo: 'Ctrl+K', desc: '打开命令面板' },
  { combo: 'Ctrl+Shift+F', desc: '聚焦全局搜索' },
  { combo: 'Ctrl+Shift+N', desc: '新建凭证' },
  { combo: 'Ctrl+Shift+P', desc: '粘贴最近一项' }
]

export function StepShortcut({
  stepIndex,
  totalSteps,
  onPrev,
  onNext,
  onSkip
}: Props): JSX.Element {
  const handleTryHud = (): void => {
    try {
      const api = window.api as {
        hud?: { toggle?: () => Promise<unknown> }
      }
      const hud = api.hud
      if (hud?.toggle) {
        void hud.toggle()
      }
    } catch {
      /* HUD 未就绪时静默 */
    }
  }

  return (
    <OnboardingLayout
      stepId="shortcut"
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="快捷键与 HUD"
      description="快捷键可在「设置 → 快捷键」自定义。Alt+Space 召唤 HUD，Ctrl+K 打开命令面板。"
      onPrev={onPrev}
      onNext={onNext}
      onSkip={onSkip}
      skippable
    >
      <div className="space-y-2">
        {SHORTCUTS.map((s) => (
          <div
            key={s.combo}
            className="flex items-center justify-between p-2 rounded"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            <kbd
              className="px-2 py-1 rounded font-mono text-xs"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid var(--glass-border)'
              }}
            >
              {s.combo}
            </kbd>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {s.desc}
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="glass-btn glass-btn-primary py-2 px-4 mt-4"
        onClick={handleTryHud}
      >
        试试召唤 HUD
      </button>
    </OnboardingLayout>
  )
}
