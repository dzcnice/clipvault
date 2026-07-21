/**
 * 欢迎 · 像素保险库
 */

import type { LucideIcon } from 'lucide-react'
import { ClipboardList, HardDrive, KeyRound, ShieldCheck } from 'lucide-react'
import { OnboardingLayout } from './OnboardingLayout'

interface Props {
  stepIndex: number
  totalSteps: number
  onNext: () => void
}

interface Highlight {
  icon: LucideIcon
  title: string
  desc: string
}

const HIGHLIGHTS: Highlight[] = [
  { icon: HardDrive, title: '本地存档', desc: '数据只在本机' },
  { icon: ShieldCheck, title: '免登录', desc: '系统安全存储' },
  { icon: ClipboardList, title: '剪贴板', desc: '复制即入包' },
  { icon: KeyRound, title: '钥匙箱', desc: '凭证加密保管' }
]

export function StepWelcome({ stepIndex, totalSteps, onNext }: Props): JSX.Element {
  return (
    <OnboardingLayout
      stepId="welcome"
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="欢迎来到 ClipVault"
      description="像素保险库：剪贴板 + 凭证，本地优先，打开即用。"
      onNext={onNext}
      nextLabel="开始"
      hidePrev
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {HIGHLIGHTS.map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.title}
              className="border-2 border-[var(--line)] bg-[var(--surface)] p-3"
              style={{ boxShadow: 'var(--px-shadow-sm)' }}
            >
              <div
                className="cv-icon-slot mb-2 !h-9 !w-9"
                style={{ background: 'var(--primary-soft)' }}
              >
                <Icon size={16} strokeWidth={2.25} />
              </div>
              <div className="font-pixel text-sm font-bold text-foreground">{item.title}</div>
              <p className="font-body mt-1 text-xs text-muted-foreground">{item.desc}</p>
            </div>
          )
        })}
      </div>
    </OnboardingLayout>
  )
}
