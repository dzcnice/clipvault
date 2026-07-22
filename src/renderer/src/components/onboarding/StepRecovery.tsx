/**
 * Onboarding · 恢复短语（可选但目标形态完整引导）
 */

import { OnboardingLayout } from './OnboardingLayout'
import { Shield } from 'lucide-react'

interface Props {
  stepIndex: number
  totalSteps: number
  onPrev: () => void
  onNext: () => void
  onSkip: () => void
}

export function StepRecovery({
  stepIndex,
  totalSteps,
  onPrev,
  onNext,
  onSkip
}: Props): JSX.Element {
  return (
    <OnboardingLayout
      stepId="recovery"
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="灾难恢复短语"
      description="可选。24 词只展示一次，请离线抄写；应用内不存明文短语。"
      onPrev={onPrev}
      onNext={onNext}
      onSkip={onSkip}
      nextLabel="下一步"
      skippable
    >
      <div
        className="flex flex-col gap-3 rounded-xl border p-4 text-sm"
        style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
      >
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 shrink-0" size={18} style={{ color: 'var(--primary)' }} />
          <div className="space-y-2 text-muted-foreground leading-relaxed">
            <p>
              日常打开应用<strong className="text-foreground">不需要</strong>
              输入主密码；短语只在库文件损坏或换机恢复时使用。
            </p>
            <p>建议现在设置：进入恢复页生成 24 词 → 离线抄写 → 勾选已保存 → 完成校验。</p>
          </div>
        </div>
        <button
          type="button"
          className="cv-btn cv-btn-primary self-start text-xs"
          onClick={() => {
            window.location.hash = '#/recovery'
            onNext()
          }}
        >
          打开恢复短语设置
        </button>
      </div>
    </OnboardingLayout>
  )
}
